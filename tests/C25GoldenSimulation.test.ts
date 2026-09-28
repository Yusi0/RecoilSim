import fs from 'fs';
import path from 'path';
import { SimulationEngine, Vector3, CFrame, WeaponsParser, WeaponCompiler } from '../src/core';

describe('C25 Golden Simulation Validation', () => {
    let c25RawData: any;
    let compiledC25Data: any;

    beforeAll(() => {
        const c25Path = path.join(__dirname, '../data/C25.json');
        c25RawData = JSON.parse(fs.readFileSync(c25Path, 'utf-8'));

        // Compile C25 using WeaponsParser + WeaponCompiler
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
        compiledC25Data = compileResult.compiledWeaponData;
    });

    test('1. Data Binding: C25 Raw & Compiled Recoil Stats verification', () => {
        // Verify C25 aimRotation X/Y/Z
        expect(compiledC25Data.recoil.aimRotation.x[0]).toEqual([0.3, 35, -0.7, 0.2]);
        expect(compiledC25Data.recoil.aimRotation.y[0]).toEqual([0.3, 45, -0.25, 0.36]);
        expect(compiledC25Data.recoil.aimRotation.z[0]).toEqual([0.4, 42, 0.1, 0.5]);

        // Verify C25 aimTranslation X/Y/Z
        expect(compiledC25Data.recoil.aimTranslation.x[0]).toEqual([0.9, 25, 0, 0.1]);
        expect(compiledC25Data.recoil.aimTranslation.y[0]).toEqual([0.9, 25, -0.5, 0.2]);
        expect(compiledC25Data.recoil.aimTranslation.z[0]).toEqual([1.1, 25, 7.1, 0.7]);

        // Verify C25 hipTranslation
        expect(compiledC25Data.recoil.hipTranslation.x[0]).toEqual([0.9, 25, 1.4, 0.4]);
        expect(compiledC25Data.recoil.hipTranslation.y[0]).toEqual([0.9, 25, -0.8, 0.2]);
        expect(compiledC25Data.recoil.hipTranslation.z[0]).toEqual([1, 23, 7.2, 0.7]);

        // Verify C25 aimCameraBody
        expect(compiledC25Data.recoil.aimCameraBody.x[0]).toEqual([1, 30, 1.92, 0.45]);
        expect(compiledC25Data.recoil.aimCameraBody.x[1]).toEqual([3.45, 5, 0.1, 0.02]);
        expect(compiledC25Data.recoil.aimCameraBody.y[0]).toEqual([0.75, 15, -0.1, 0.24]);
        expect(compiledC25Data.recoil.aimCameraBody.z[0]).toEqual([0.45, 50, 1.9, 0.5]);

        // Verify Recoil Recovery & Firerate
        expect(compiledC25Data.recoil.aimRotationRecovery.x.a[0]).toEqual([0.9, 25]);
        expect(compiledC25Data.firerate).toBe(800);
    });

    test('2. C25 Single-Shot Golden Simulation (1 Round)', () => {
        const engine = new SimulationEngine({
            weaponData: compiledC25Data,
            seed: 2026,
            baseCameraOrientation: CFrame.IDENTITY
        });

        // Set Aiming mode for C25
        engine.pushAimInput(true, 0.0);
        engine.advanceTo(0.3); // allow aim spring to settle (s=16.5 -> 0.3s for >95% aim)

        // Fire single round at t = 0.3
        engine.pushFireInput(0.3);
        engine.advanceTo(0.45);

        expect(engine.physicalShots.length).toBe(1);
        const shot = engine.physicalShots[0];

        expect(shot.timestamp).toBe(0.3);
        expect(shot.fireCount).toBe(0);
        expect(shot.aimProgressAtFire).toBeGreaterThan(0.95); // Full aim (> 0.95)
        expect(shot.origin).toBeDefined();
        expect(shot.direction).toBeDefined();
        expect(shot.v474).toBeDefined();

        // Print key parameters for trace verification
        // console.log('Single Shot Origin:', shot.origin);
        // console.log('Single Shot Direction:', shot.direction);
    });

    test('3. C25 3-Shot Burst Golden Simulation (800 RPM = 0.075s interval)', () => {
        const engine = new SimulationEngine({
            weaponData: compiledC25Data,
            seed: 2026,
            baseCameraOrientation: CFrame.IDENTITY
        });

        engine.pushAimInput(true, 0.0);
        engine.advanceTo(0.3);

        // Fire 3 rounds at t = 0.300, 0.375, 0.450
        const interval = 60 / 800; // 0.075s
        for (let i = 0; i < 3; i++) {
            const fireTime = 0.3 + i * interval;
            const fired = engine.pushFireInput(fireTime);
            expect(fired).toBe(true);
        }

        // Advance step-by-step recording trajectories
        const trajectorySamples: Array<{ time: number; shotCount: number; rotationRecoil: Vector3; bodyRecoil: Vector3 }> = [];

        for (let t = 0.3; t <= 0.6; t += 0.025) {
            engine.advanceTo(t);
            const view = engine.getPlayerViewSnapshot();
            const firearmPos = engine.firearmRecoil.getPositions(t);

            trajectorySamples.push({
                time: Math.round(t * 1000) / 1000,
                shotCount: engine.physicalShots.length,
                rotationRecoil: firearmPos.rotation,
                bodyRecoil: view.cameraBodyRecoilVec
            });
        }

        expect(engine.physicalShots.length).toBe(3);

        const shots = engine.physicalShots;
        expect(shots[0].timestamp).toBeCloseTo(0.300);
        expect(shots[1].timestamp).toBeCloseTo(0.375);
        expect(shots[2].timestamp).toBeCloseTo(0.450);

        // Verify recoil accumulation from shot 1 to shot 3
        expect(shots[2].rotationRecoilVec.magnitude).toBeGreaterThan(shots[0].rotationRecoilVec.magnitude);
    });

    test('4. C25 Automatic 10-Shot Sequence & Recovery', () => {
        const engine = new SimulationEngine({
            weaponData: compiledC25Data,
            seed: 2026,
            baseCameraOrientation: CFrame.IDENTITY
        });

        engine.pushAimInput(true, 0.0);
        engine.advanceTo(0.3);

        const interval = 60 / 800; // 0.075s
        for (let i = 0; i < 10; i++) {
            const fireTime = 0.3 + i * interval;
            const fired = engine.pushFireInput(fireTime);
            expect(fired).toBe(true);
        }

        // Advance through full burst to t = 1.1
        engine.advanceTo(1.1);
        expect(engine.physicalShots.length).toBe(10);

        const shot10Recoil = engine.physicalShots[9].rotationRecoilVec.magnitude;

        // Advance into post-firing recovery phase to t = 2.0
        engine.advanceTo(2.0);
        const postRecoveryRecoil = engine.firearmRecoil.getPositions(2.0).rotation.magnitude;

        // Verify spring recovery after firing stops
        expect(postRecoveryRecoil).toBeLessThan(shot10Recoil);
    });

    test('5. CameraHead Isolation & CameraBody Influence on C25 Shots', () => {
        // Run standard C25 engine with 2 shots
        const engineNormal = new SimulationEngine({ weaponData: compiledC25Data, seed: 100 });
        engineNormal.pushAimInput(true, 0.0);
        engineNormal.advanceTo(0.3);
        engineNormal.pushFireInput(0.3);
        engineNormal.pushFireInput(0.375);
        engineNormal.advanceTo(0.45);

        // Run modified C25 engine with 10x Head Recoil
        const headModData = JSON.parse(JSON.stringify(compiledC25Data));
        headModData.recoil.aimCameraHead.x = [[0.35, 50, 100.0, 0]]; // Huge head impulse

        const engineHeadMod = new SimulationEngine({ weaponData: headModData, seed: 100 });
        engineHeadMod.pushAimInput(true, 0.0);
        engineHeadMod.advanceTo(0.3);
        engineHeadMod.pushFireInput(0.3);
        engineHeadMod.pushFireInput(0.375);
        engineHeadMod.advanceTo(0.45);

        const shotNormal1 = engineNormal.physicalShots[0];
        const shotHeadMod1 = engineHeadMod.physicalShots[0];

        // 100% IDENTICAL Physical Shot (CameraHead has 0% effect)
        expect(shotNormal1.origin.equals(shotHeadMod1.origin, 1e-6)).toBe(true);
        expect(shotNormal1.direction.equals(shotHeadMod1.direction, 1e-6)).toBe(true);

        // Run modified C25 engine with 10x Body Recoil
        const bodyModData = JSON.parse(JSON.stringify(compiledC25Data));
        bodyModData.recoil.aimCameraBody.x[0][2] = 20.0; // Huge body impulse

        const engineBodyMod = new SimulationEngine({ weaponData: bodyModData, seed: 100 });
        engineBodyMod.pushAimInput(true, 0.0);
        engineBodyMod.advanceTo(0.3);
        engineBodyMod.pushFireInput(0.3);
        engineBodyMod.pushFireInput(0.375);
        engineBodyMod.advanceTo(0.45);

        // Check Shot 2 (where body recoil displacement has accumulated)
        const shotNormal2 = engineNormal.physicalShots[1];
        const shotBodyMod2 = engineBodyMod.physicalShots[1];

        // Physical Shot CHANGES when CameraBody changes
        expect(shotNormal2.direction.equals(shotBodyMod2.direction, 1e-4)).toBe(false);
    });

    test('6. Seeded Reproducibility on C25 10-Shot Trajectory', () => {
        const runSimulation = (seed: number) => {
            const engine = new SimulationEngine({ weaponData: compiledC25Data, seed });
            engine.pushAimInput(true, 0.0);
            engine.advanceTo(0.3);
            for (let i = 0; i < 10; i++) {
                engine.pushFireInput(0.3 + i * 0.075);
            }
            engine.advanceTo(1.1);
            return engine.physicalShots;
        };

        const shotsRun1 = runSimulation(999);
        const shotsRun2 = runSimulation(999);

        expect(shotsRun1.length).toBe(10);
        expect(shotsRun2.length).toBe(10);

        for (let i = 0; i < 10; i++) {
            expect(shotsRun1[i].origin.x).toBe(shotsRun2[i].origin.x);
            expect(shotsRun1[i].origin.y).toBe(shotsRun2[i].origin.y);
            expect(shotsRun1[i].origin.z).toBe(shotsRun2[i].origin.z);
            expect(shotsRun1[i].direction.x).toBe(shotsRun2[i].direction.x);
            expect(shotsRun1[i].direction.y).toBe(shotsRun2[i].direction.y);
            expect(shotsRun1[i].direction.z).toBe(shotsRun2[i].direction.z);
        }
    });
});
