import fs from 'fs';
import path from 'path';
import {
    SimulationEngine,
    Vector3,
    CFrame,
    WeaponsParser,
    WeaponCompiler
} from '../src/core';
import { MonteCarloEngine, TargetPlaneProjector } from '../src/montecarlo';

describe('Monte Carlo Simulation Engine Test Suite', () => {
    let c25Normalized: any;
    let attachmentMap: any;
    let c25Detail: any;
    let compiledC25Base: any;
    let compiler: WeaponCompiler;

    beforeAll(() => {
        const rawFilePath = path.join(__dirname, '../data/raw/weapons.json');
        const rawDetailPath = path.join(__dirname, '../data/raw/weapon-details/c25.json');

        const rawWeaponsData = JSON.parse(fs.readFileSync(rawFilePath, 'utf-8'));
        const parser = new WeaponsParser();
        const parseResult = parser.parse(rawWeaponsData);

        c25Normalized = parseResult.weapons.get('c25')!;
        attachmentMap = parseResult.attachments;
        c25Detail = JSON.parse(fs.readFileSync(rawDetailPath, 'utf-8'));

        compiler = new WeaponCompiler();
        const compileResult = compiler.compileWeapon(c25Normalized, {}, attachmentMap, c25Detail);
        compiledC25Base = compileResult.compiledWeaponData;
    });

    // -------------------------------------------------------------
    // Test A: Determinism with Identical Inputs
    // -------------------------------------------------------------
    test('A. Determinism: Same config + same seed + same trialCount yields identical results', () => {
        const engine1 = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 5,
            burstSize: 30,
            masterSeed: 12345
        });

        const engine2 = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 5,
            burstSize: 30,
            masterSeed: 12345
        });

        const res1 = engine1.run();
        const res2 = engine2.run();

        expect(res1.totalShots).toBe(150);
        expect(res2.totalShots).toBe(150);

        // Statistics must be identical down to machine precision
        expect(res1.statistics.meanX).toBe(res2.statistics.meanX);
        expect(res1.statistics.meanY).toBe(res2.statistics.meanY);
        expect(res1.statistics.stdX).toBe(res2.statistics.stdX);
        expect(res1.statistics.stdY).toBe(res2.statistics.stdY);
        expect(res1.statistics.medianRadius).toBe(res2.statistics.medianRadius);
        expect(res1.statistics.p95Radius).toBe(res2.statistics.p95Radius);
        expect(res1.statistics.maxRadius).toBe(res2.statistics.maxRadius);
    });

    // -------------------------------------------------------------
    // Test B: Different Seed Divergence
    // -------------------------------------------------------------
    test('B. Seed Divergence: Different master seed yields different random dispersion', () => {
        const engine1 = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 5,
            burstSize: 30,
            masterSeed: 11111
        });

        const engine2 = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 5,
            burstSize: 30,
            masterSeed: 99999
        });

        const res1 = engine1.run();
        const res2 = engine2.run();

        expect(res1.statistics.meanX).not.toBe(res2.statistics.meanX);
        expect(res1.statistics.stdX).not.toBe(res2.statistics.stdX);
    });

    // -------------------------------------------------------------
    // Test C: Trial Count = 1 (Exactly 30 Shots)
    // -------------------------------------------------------------
    test('C. Single Trial: trialCount = 1 produces exactly 30 shots', () => {
        const engine = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 1,
            burstSize: 30,
            masterSeed: 2026
        });

        const res = engine.run();
        expect(res.trialCount).toBe(1);
        expect(res.shotsPerTrial).toBe(30);
        expect(res.totalShots).toBe(30);
        expect(res.impacts.length).toBe(30);
        expect(res.statistics.sampleCount).toBe(30);
    });

    // -------------------------------------------------------------
    // Test D: Trial Count = 10 (Exactly 300 Shots)
    // -------------------------------------------------------------
    test('D. Multiple Trials: trialCount = 10 produces exactly 300 shots in statistics', () => {
        const engine = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 10,
            burstSize: 30,
            masterSeed: 2026
        });

        const res = engine.run();
        expect(res.trialCount).toBe(10);
        expect(res.shotsPerTrial).toBe(30);
        expect(res.totalShots).toBe(300);
        expect(res.statistics.sampleCount).toBe(300);
    });

    // -------------------------------------------------------------
    // Test E: Repeated Execution Consistency
    // -------------------------------------------------------------
    test('E. Idempotency: Re-running engine with same configuration produces identical statistics', () => {
        const engine = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 3,
            burstSize: 30,
            masterSeed: 555
        });

        const res1 = engine.run();
        const res2 = engine.run();

        expect(res1.statistics.meanRadius).toBe(res2.statistics.meanRadius);
        expect(res1.statistics.radialStd).toBe(res2.statistics.radialStd);
        expect(res1.statistics.centeredP90Radius).toBe(res2.statistics.centeredP90Radius);
    });

    // -------------------------------------------------------------
    // Test F: Attachment Modifier Impact Verification
    // -------------------------------------------------------------
    test('F. Attachment Modifier: Changing attachments alters recoil dispersion', () => {
        // Compensator modifies aimRotation and recoil behavior
        const compiledWithCompensator = compiler.compileWeapon(
            c25Normalized,
            { Barrel: 'Compensator' },
            attachmentMap,
            c25Detail
        ).compiledWeaponData;

        const baseEngine = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 5,
            burstSize: 30,
            masterSeed: 2026
        });

        const compEngine = new MonteCarloEngine({
            weaponData: compiledWithCompensator,
            trialCount: 5,
            burstSize: 30,
            masterSeed: 2026
        });

        const baseRes = baseEngine.run();
        const compRes = compEngine.run();

        expect(baseRes.totalShots).toBe(150);
        expect(compRes.totalShots).toBe(150);

        // Statistics must reflect the recoil difference
        expect(baseRes.statistics.meanRadius).not.toBe(compRes.statistics.meanRadius);
    });

    // -------------------------------------------------------------
    // Test G: Section 20 Strict SimulationEngine 1:1 Parity Validation
    // -------------------------------------------------------------
    test('G. Section 20 Parity: SimulationEngine 1-run vs MonteCarloEngine trial 1 are 100% bitwise identical', () => {
        const SEED = 2026;
        const BURST_SIZE = 30;
        const FIRERATE = compiledC25Base.firerate ?? 800;
        const INTERVAL = 60 / FIRERATE;
        const SETTLE_TIME = 0.3;

        // 1. Standalone SimulationEngine Run
        const standaloneSim = new SimulationEngine({
            weaponData: compiledC25Base,
            seed: SEED,
            baseCameraOrientation: CFrame.IDENTITY,
            positionOffset: new Vector3(0, 1.5, 0),
            hipOffset: CFrame.newPos(new Vector3(0.18, -0.15, -0.42)),
            aimOffset: CFrame.newPos(new Vector3(0, -0.08, -0.32))
        });

        standaloneSim.setStance('stand');
        standaloneSim.setDevice('mouse');
        standaloneSim.pushAimInput(true, 0.0);
        standaloneSim.advanceTo(SETTLE_TIME);

        for (let i = 0; i < BURST_SIZE; i++) {
            const fireT = SETTLE_TIME + i * INTERVAL;
            standaloneSim.pushFireInput(fireT);
            standaloneSim.advanceTo(fireT + INTERVAL);
        }

        const simShots = standaloneSim.physicalShots;
        expect(simShots.length).toBe(BURST_SIZE);

        // 2. MonteCarloEngine Run with trialCount = 1
        const mcEngine = new MonteCarloEngine({
            weaponData: compiledC25Base,
            masterSeed: SEED,
            trialCount: 1,
            burstSize: BURST_SIZE,
            aiming: true,
            aimProgress: 1.0,
            stance: 'stand',
            device: 'mouse',
            firerate: FIRERATE,
            settleTime: SETTLE_TIME
        });

        const mcResult = mcEngine.run();
        expect(mcResult.totalShots).toBe(BURST_SIZE);
        expect(mcResult.impacts.length).toBe(BURST_SIZE);

        // 3. Strict 1:1 bitwise verification of every single shot
        for (let i = 0; i < BURST_SIZE; i++) {
            const simShot = simShots[i];
            const mcImpact = mcResult.impacts[i];

            // Timestamps must match exactly
            expect(mcImpact.timestamp).toBe(simShot.timestamp);

            // Origins must match exactly down to machine precision
            expect(mcImpact.origin.x).toBe(simShot.origin.x);
            expect(mcImpact.origin.y).toBe(simShot.origin.y);
            expect(mcImpact.origin.z).toBe(simShot.origin.z);

            // Directions must match exactly down to machine precision
            expect(mcImpact.direction.x).toBe(simShot.direction.x);
            expect(mcImpact.direction.y).toBe(simShot.direction.y);
            expect(mcImpact.direction.z).toBe(simShot.direction.z);
        }
    });

    // -------------------------------------------------------------
    // Test H: Asynchronous Chunked Execution (runAsync)
    // -------------------------------------------------------------
    test('H. Asynchronous Execution: runAsync executes correctly with progress notifications', async () => {
        const mcEngine = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 15,
            burstSize: 10,
            masterSeed: 444
        });

        const progressUpdates: number[] = [];
        const res = await mcEngine.runAsync(5, (completed, total) => {
            progressUpdates.push(completed);
        });

        expect(res.totalShots).toBe(150);
        expect(res.statistics.sampleCount).toBe(150);
        expect(progressUpdates.length).toBeGreaterThan(0);
        expect(progressUpdates[progressUpdates.length - 1]).toBe(15);
    });

    // -------------------------------------------------------------
    // Test I: Monte Carlo Aiming Contract (HIPFIRE vs ADS Binary State)
    // -------------------------------------------------------------
    test('I. Aiming Contract: Binary ADS vs HIPFIRE behaves correctly and aimProgress is strictly binary', () => {
        // 1. Explicit HIPFIRE (aiming: false)
        const hipEngine = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 2,
            burstSize: 5,
            masterSeed: 100,
            aiming: false
        });
        const hipRes = hipEngine.run();
        expect(hipRes.conditions.isAiming).toBe(false);
        expect(hipRes.conditions.aimProgress).toBe(0.0);
        expect(hipRes.totalShots).toBe(10);

        // 2. Explicit ADS (aiming: true)
        const adsEngine = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 2,
            burstSize: 5,
            masterSeed: 100,
            aiming: true
        });
        const adsRes = adsEngine.run();
        expect(adsRes.conditions.isAiming).toBe(true);
        expect(adsRes.conditions.aimProgress).toBe(1.0);
        expect(adsRes.totalShots).toBe(10);

        // HIPFIRE dispersion must be larger than ADS dispersion due to hipfire spread spring
        expect(hipRes.statistics.dispersion.radialStd).toBeGreaterThan(adsRes.statistics.dispersion.radialStd);

        // 3. Default without aiming specifies ADS
        const defaultEngine = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 1,
            burstSize: 5,
            masterSeed: 100
        });
        const defaultRes = defaultEngine.run();
        expect(defaultRes.conditions.isAiming).toBe(true);
    });

    // -------------------------------------------------------------
    // Test J: Authoritative Firerate & Silent Drop Prevention
    // -------------------------------------------------------------
    test('J. Firerate Handling: Weapon firerate is authoritative; mismatch throws and never silently drops shots', () => {
        const weaponRPM = compiledC25Base.firerate ?? 800;

        // 1. Matching firerate succeeds with exact shot count
        const normalEngine = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 2,
            burstSize: 10,
            masterSeed: 555,
            firerate: weaponRPM
        });
        const normalRes = normalEngine.run();
        expect(normalRes.shotsPerTrial).toBe(10);
        expect(normalRes.totalShots).toBe(20);
        expect(normalRes.impacts.length).toBe(20);
        expect(normalRes.conditions.firerate).toBe(weaponRPM);

        // Timestamps must have exactly 60 / weaponRPM intervals
        const expectedInterval = 60 / weaponRPM;
        expect(normalRes.impacts[1].timestamp - normalRes.impacts[0].timestamp).toBeCloseTo(expectedInterval, 6);

        // 2. Mismatched firerate override (e.g. 1600 RPM vs 800 RPM) throws explicit Error
        expect(() => {
            const mismatchedEngine = new MonteCarloEngine({
                weaponData: compiledC25Base,
                trialCount: 1,
                burstSize: 10,
                masterSeed: 555,
                firerate: 1600
            });
            mismatchedEngine.run();
        }).toThrow(/Specified firerate \(1600\) does not match weapon effective firerate/);

        // 3. Slower mismatched firerate override (e.g. 400 RPM vs 800 RPM) also throws
        expect(() => {
            const slowEngine = new MonteCarloEngine({
                weaponData: compiledC25Base,
                trialCount: 1,
                burstSize: 5,
                masterSeed: 555,
                firerate: 400
            });
            slowEngine.run();
        }).toThrow(/does not match weapon effective firerate/);
    });

    // -------------------------------------------------------------
    // Test K: TargetPlaneProjector Ray-Plane Intersection Semantics
    // -------------------------------------------------------------
    test('K. TargetPlaneProjector: Strict ray-plane intersection validates rays and rejects non-intersecting rays', () => {
        const origin = new Vector3(0, 0, 0);
        const targetDist = 50; // target plane at Z = -50

        // 1. Normal forward ray (dir.z < 0) -> valid
        const forwardRay = new Vector3(0, 0, -1);
        const resForward = TargetPlaneProjector.project(origin, forwardRay, targetDist);
        expect(resForward).not.toBeNull();
        expect(resForward!.x).toBeCloseTo(0);
        expect(resForward!.y).toBeCloseTo(0);
        expect(resForward!.z).toBeCloseTo(-50);
        expect(resForward!.distToTarget).toBeCloseTo(50);

        // 2. Backward ray (dir.z > 0) -> invalid (null)
        const backwardRay = new Vector3(0, 0, 1);
        const resBackward = TargetPlaneProjector.project(origin, backwardRay, targetDist);
        expect(resBackward).toBeNull();

        // 3. Backward diagonal ray (dir.z > 0) -> invalid (null)
        const backwardDiag = new Vector3(1, 1, 1).unit;
        const resBackwardDiag = TargetPlaneProjector.project(origin, backwardDiag, targetDist);
        expect(resBackwardDiag).toBeNull();

        // 4. Parallel ray (dir.z == 0) -> invalid (null)
        const parallelRay = new Vector3(1, 0, 0);
        const resParallel = TargetPlaneProjector.project(origin, parallelRay, targetDist);
        expect(resParallel).toBeNull();

        // 5. Near-parallel ray (|dir.z| < EPSILON) -> invalid (null)
        const nearParallelRay = new Vector3(1, 0, -1e-7).unit;
        const resNearParallel = TargetPlaneProjector.project(origin, nearParallelRay, targetDist);
        expect(resNearParallel).toBeNull();

        // 6. Forward angled ray (dir.z < 0) -> valid with correct Euclidean distance
        const forwardAngled = new Vector3(0.1, 0.2, -1).unit;
        const resAngled = TargetPlaneProjector.project(origin, forwardAngled, targetDist);
        expect(resAngled).not.toBeNull();
        expect(resAngled!.z).toBeCloseTo(-50);
        expect(resAngled!.distToTarget).toBeGreaterThan(50);
    });

    // -------------------------------------------------------------
    // Test L: Invalid Projections Excluded from Statistics
    // -------------------------------------------------------------
    test('L. Statistics Filtration: Invalid projections are not inserted into points or statistics', () => {
        const validProj = TargetPlaneProjector.project(new Vector3(0, 0, 0), new Vector3(0, 0, -1), 50);
        const invalidProj = TargetPlaneProjector.project(new Vector3(0, 0, 0), new Vector3(0, 0, 1), 50);

        expect(validProj).not.toBeNull();
        expect(invalidProj).toBeNull();

        const engine = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 2,
            burstSize: 10,
            masterSeed: 777
        });
        const res = engine.run();
        expect(res.totalShots).toBe(20);
        for (const imp of res.impacts) {
            expect(imp.targetZ).toBe(-50);
            expect(imp.direction.z).toBeLessThan(0); // All physical shots traveled towards target
        }
    });
});
