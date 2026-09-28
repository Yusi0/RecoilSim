import fs from 'fs';
import path from 'path';
import {
    PFRuntimeComparator,
    SimulationEngine,
    PFTelemetryFixture,
    PFFrameSample,
    PFShotSample,
    CFrame,
    Vector3,
    WeaponsParser,
    WeaponCompiler
} from '../src/core';

describe('PFRuntimeComparator - Phase A Automated Validation Suite', () => {
    let c25WeaponData: any;
    let comparator: PFRuntimeComparator;

    beforeAll(() => {
        const rawFilePath = path.join(__dirname, '../data/raw/weapons.json');
        const rawDetailPath = path.join(__dirname, '../data/raw/weapon-details/c25.json');

        const rawWeaponsData = JSON.parse(fs.readFileSync(rawFilePath, 'utf-8'));
        const parser = new WeaponsParser();
        const parseResult = parser.parse(rawWeaponsData);

        const c25Normalized = parseResult.weapons.get('c25')!;
        const attachmentMap = parseResult.attachments;
        const c25Detail = JSON.parse(fs.readFileSync(rawDetailPath, 'utf-8'));

        const compiler = new WeaponCompiler();
        const compileResult = compiler.compileWeapon(c25Normalized, {}, attachmentMap, c25Detail);
        c25WeaponData = compileResult.compiledWeaponData;

        // Zero-variance mode for Phase A
        if (c25WeaponData.recoil) {
            for (const key of Object.keys(c25WeaponData.recoil)) {
                const val = c25WeaponData.recoil[key];
                if (typeof val === 'object' && val !== null) {
                    for (const axis of Object.keys(val)) {
                        if (Array.isArray(val[axis]) && val[axis][0] && val[axis][0].length >= 4) {
                            val[axis][0][3] = 0.0; // variance = 0
                        }
                    }
                }
            }
        }

        comparator = new PFRuntimeComparator();
    });

    /**
     * Helper to generate a clean synthetic Phase A Telemetry Fixture from SimulationEngine.
     */
    function generateSyntheticPhaseAFixture(testName: string, shotsCount: number = 3): PFTelemetryFixture {
        const engine = new SimulationEngine({
            weaponData: c25WeaponData,
            seed: 2026
        });

        engine.setStance('stand');
        engine.setDevice('mouse');
        engine.pushAimInput(true, 0.0);
        engine.advanceTo(0.3);

        const interval = 60 / 800; // 0.075s
        for (let i = 0; i < shotsCount; i++) {
            engine.pushFireInput(0.3 + i * interval);
        }

        const frameSamples: PFFrameSample[] = [];

        for (let t = 0.3; t <= 0.6; t += 0.025) {
            engine.advanceTo(t);
            const view = engine.getPlayerViewSnapshot(t);
            const firearmPos = engine.firearmRecoil.getPositions(t);

            const sample: PFFrameSample = {
                time: Math.round(t * 1000) / 1000,
                aimProgress: engine.getAimProgress(t),
                springs: {
                    translation_p: firearmPos.translation.toArray(),
                    rotation_p: firearmPos.rotation.toArray(),
                    cameraBody_p: view.cameraBodyRecoilVec.toArray(),
                    cameraHead_p: view.cameraHeadRecoilVec.toArray(),
                    spread_p: engine.spreadSpring.p.toArray()
                },
                cframes: {
                    v185: [1,0,0, 0,1,0, 0,0,1, 0,0,0],
                    v186: [1,0,0, 0,1,0, 0,0,1, 0,0,0],
                    shakeCFrame: [1,0,0, 0,1,0, 0,0,1, 0,0,0],
                    mainC0: [1,0,0, 0,1,0, 0,0,1, 0,0,0],
                    v187: [1,0,0, 0,1,0, 0,0,1, 0,0,0]
                },
                state: {
                    nextShotTime: engine.firearmState.nextShotTime,
                    firemodeStability: engine.firearmState.firemodeStability
                }
            };
            frameSamples.push(sample);
        }

        const shots: PFShotSample[] = engine.physicalShots.map((s, idx) => ({
            fireCount: idx,
            fireTimestamp: s.timestamp,
            recoilImpulseTimestamp: s.timestamp,
            shotGenerateTimestamp: s.timestamp,
            capturedAimProgress: s.aimProgressAtFire,
            shotOutputs: {
                v474: [1,0,0, 0,1,0, 0,0,1, s.origin.x, s.origin.y, s.origin.z],
                origin: s.origin.toArray(),
                direction: s.direction.toArray()
            }
        }));

        return {
            metadata: {
                weaponName: 'C25',
                testName,
                phase: 'PhaseA_ZeroVariance',
                timestamp: 1759021200,
                aimState: 'ADS',
                stance: 'stand',
                device: 'mouse'
            },
            shots,
            frameSamples
        };
    }

    test('1. Helper Utilities: arrayToCFrame & arrayToVector3 conversion', () => {
        const arrVec = [1.5, 2.5, 3.5];
        const vec = comparator.arrayToVector3(arrVec);
        expect(vec.x).toBe(1.5);
        expect(vec.y).toBe(2.5);
        expect(vec.z).toBe(3.5);

        const arrCF = [1,0,0, 0,1,0, 0,0,1, 10,20,30];
        const cf = comparator.arrayToCFrame(arrCF);
        expect(cf.p.x).toBe(10);
        expect(cf.p.y).toBe(20);
        expect(cf.p.z).toBe(30);
    });

    test('2. Phase A Clean Fixture Match (Pass Case)', () => {
        const fixture = generateSyntheticPhaseAFixture('C25_ADS_3Shot_Clean', 3);
        const report = comparator.compareFixture(fixture, c25WeaponData);

        expect(report.passed).toBe(true);
        expect(report.firstDivergence).toBeUndefined();
        expect(report.summary).toContain('[PASS]');
        expect(report.shotsChecked).toBe(3);
    });

    test('3. Layer 3 (SPRING_ODE) Divergence Detection on Spring Fault Injection', () => {
        const fixture = generateSyntheticPhaseAFixture('C25_Spring_Fault_Injection', 3);

        // Inject fault into translation_p at frame sample index 5
        const mutableSamples = JSON.parse(JSON.stringify(fixture.frameSamples));
        mutableSamples[5].springs.translation_p = [0.5, 0.5, 0.5]; // Large fault

        const faultyFixture: PFTelemetryFixture = {
            ...fixture,
            frameSamples: mutableSamples
        };

        const report = comparator.compareFixture(faultyFixture, c25WeaponData);

        expect(report.passed).toBe(false);
        expect(report.firstDivergence).toBeDefined();
        expect(report.firstDivergence!.category).toBe('SPRING_ODE');
        expect(report.firstDivergence!.property).toBe('springs.translation_p');
        expect(report.summary).toContain('Layer 3 (SPRING_ODE)');
    });

    test('4. Layer 4 (CFRAME_CHAIN) Divergence Detection on Shot Origin Fault Injection', () => {
        const fixture = generateSyntheticPhaseAFixture('C25_Origin_Fault_Injection', 3);

        // Inject fault into shot 1 origin
        const mutableShots = JSON.parse(JSON.stringify(fixture.shots));
        mutableShots[1].shotOutputs.origin = [10.0, 5.0, -2.0]; // Large origin fault

        const faultyFixture: PFTelemetryFixture = {
            ...fixture,
            shots: mutableShots
        };

        const report = comparator.compareFixture(faultyFixture, c25WeaponData);

        expect(report.passed).toBe(false);
        expect(report.firstDivergence).toBeDefined();
        expect(report.firstDivergence!.category).toBe('CFRAME_CHAIN');
        expect(report.firstDivergence!.property).toBe('shots[1].origin');
        expect(report.summary).toContain('Layer 4 (CFRAME_CHAIN)');
    });

    test('5. Layer 5 (SPREAD) Divergence Detection on Direction Unit Vector Fault Injection', () => {
        const fixture = generateSyntheticPhaseAFixture('C25_Direction_Fault_Injection', 3);

        // Inject fault into shot 0 direction
        const mutableShots = JSON.parse(JSON.stringify(fixture.shots));
        mutableShots[0].shotOutputs.direction = [0.5, 0.5, 0.0]; // Mismatched direction

        const faultyFixture: PFTelemetryFixture = {
            ...fixture,
            shots: mutableShots
        };

        const report = comparator.compareFixture(faultyFixture, c25WeaponData);

        expect(report.passed).toBe(false);
        expect(report.firstDivergence).toBeDefined();
        expect(report.firstDivergence!.category).toBe('SPREAD');
        expect(report.firstDivergence!.property).toBe('shots[0].direction');
        expect(report.summary).toContain('Layer 5 (SPREAD)');
    });
});
