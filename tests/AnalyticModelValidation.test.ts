import fs from 'fs';
import path from 'path';
import {
    SimulationEngine,
    Vector3,
    CFrame,
    WeaponsParser,
    WeaponCompiler
} from '../src/core';
import {
    AnalyticModel,
    AnalyticComparator
} from '../src/analytic';

describe('C25 Simulation vs Independent Analytic Model Validation', () => {
    let compiledC25Data: any;

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
        compiledC25Data = compileResult.compiledWeaponData;
    });

    test('J1. C25 ADS 30-Shot Full Burst Validation (800 RPM)', () => {
        const SEED = 2026;
        const SHOT_COUNT = 30;
        const FIRERATE = compiledC25Data.firerate ?? 800;
        const INTERVAL = 60 / FIRERATE; // 0.075s

        // 1. Initialize SimulationEngine
        const simEngine = new SimulationEngine({
            weaponData: compiledC25Data,
            seed: SEED,
            baseCameraOrientation: CFrame.IDENTITY,
            positionOffset: new Vector3(0, 1.5, 0),
            hipOffset: CFrame.newPos(new Vector3(0.18, -0.15, -0.42)),
            aimOffset: CFrame.newPos(new Vector3(0, -0.08, -0.32))
        });

        // 2. Initialize Independent Analytic Model
        const analyticModel = new AnalyticModel({
            weaponData: compiledC25Data,
            seed: SEED,
            baseCameraOrientation: CFrame.IDENTITY,
            positionOffset: new Vector3(0, 1.5, 0),
            hipOffset: CFrame.newPos(new Vector3(0.18, -0.15, -0.42)),
            aimOffset: CFrame.newPos(new Vector3(0, -0.08, -0.32))
        });

        // Setup ADS Aiming (settle aim spring at t = 0.3s)
        const START_TIME = 0.3;
        simEngine.pushAimInput(true, 0.0);
        simEngine.advanceTo(START_TIME);

        analyticModel.setAim(true, 0.0);

        // Fire 30 rounds
        for (let i = 0; i < SHOT_COUNT; i++) {
            const fireT = START_TIME + i * INTERVAL;
            simEngine.pushFireInput(fireT);
            simEngine.advanceTo(fireT + INTERVAL);

            analyticModel.fireSingle(fireT);
        }

        expect(simEngine.physicalShots.length).toBe(SHOT_COUNT);
        expect(analyticModel.shots.length).toBe(SHOT_COUNT);

        // Run Numerical Comparison
        const report = AnalyticComparator.compare(simEngine, analyticModel);

        console.log('\n[C25 ADS 30-Shot Validation Report]');
        console.log(report.formattedReport);

        expect(report.firstDivergenceShot).toBeNull();
        expect(report.passed).toBe(true);

        // Verify each key subsystem is strictly passing
        for (const s of report.subsystemSummaries) {
            expect(s.passed).toBe(true);
        }
    });

    test('J2. C25 HIPFIRE 30-Shot Full Burst Validation (800 RPM)', () => {
        const SEED = 7777;
        const SHOT_COUNT = 30;
        const FIRERATE = compiledC25Data.firerate ?? 800;
        const INTERVAL = 60 / FIRERATE;

        // 1. Initialize SimulationEngine
        const simEngine = new SimulationEngine({
            weaponData: compiledC25Data,
            seed: SEED,
            baseCameraOrientation: CFrame.IDENTITY,
            positionOffset: new Vector3(0, 1.5, 0),
            hipOffset: CFrame.newPos(new Vector3(0.18, -0.15, -0.42)),
            aimOffset: CFrame.newPos(new Vector3(0, -0.08, -0.32))
        });

        // 2. Initialize Independent Analytic Model
        const analyticModel = new AnalyticModel({
            weaponData: compiledC25Data,
            seed: SEED,
            baseCameraOrientation: CFrame.IDENTITY,
            positionOffset: new Vector3(0, 1.5, 0),
            hipOffset: CFrame.newPos(new Vector3(0.18, -0.15, -0.42)),
            aimOffset: CFrame.newPos(new Vector3(0, -0.08, -0.32))
        });

        // HIPFIRE (aiming = false)
        const START_TIME = 0.0;
        simEngine.pushAimInput(false, 0.0);
        analyticModel.setAim(false, 0.0);

        for (let i = 0; i < SHOT_COUNT; i++) {
            const fireT = START_TIME + i * INTERVAL;
            simEngine.pushFireInput(fireT);
            simEngine.advanceTo(fireT + INTERVAL);

            analyticModel.fireSingle(fireT);
        }

        expect(simEngine.physicalShots.length).toBe(SHOT_COUNT);
        expect(analyticModel.shots.length).toBe(SHOT_COUNT);

        const report = AnalyticComparator.compare(simEngine, analyticModel);

        console.log('\n[C25 HIPFIRE 30-Shot Validation Report]');
        console.log(report.formattedReport);

        expect(report.firstDivergenceShot).toBeNull();
        expect(report.passed).toBe(true);

        for (const s of report.subsystemSummaries) {
            expect(s.passed).toBe(true);
        }
    });
});
