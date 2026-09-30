import { Vector3, CFrame } from '../src/core/math';
import {
    AnalyticScalarSpring,
    AnalyticVectorSpring,
    AnalyticModel,
    AnalyticConfig
} from '../src/analytic';

describe('Independent Analytic Model: Unit Test Suite', () => {
    // -------------------------------------------------------------
    // Test A: Zero Recoil
    // -------------------------------------------------------------
    test('A. Zero Recoil: All recoil parameters zero produce zero recoil motion', () => {
        const zeroWeaponData: Record<string, any> = {
            firerate: 600,
            recoil: {
                hipRotation: { x: [[0.5, 20, 0, 0]], y: [[0.5, 20, 0, 0]], z: [[0.5, 20, 0, 0]] },
                aimRotation: { x: [[0.5, 20, 0, 0]], y: [[0.5, 20, 0, 0]], z: [[0.5, 20, 0, 0]] },
                hipTranslation: { x: [[0.5, 20, 0, 0]], y: [[0.5, 20, 0, 0]], z: [[0.5, 20, 0, 0]] },
                aimTranslation: { x: [[0.5, 20, 0, 0]], y: [[0.5, 20, 0, 0]], z: [[0.5, 20, 0, 0]] }
            },
            cameraRecoil: {
                hipCameraBody: { x: [[0.5, 20, 0, 0]], y: [[0.5, 20, 0, 0]], z: [[0.5, 20, 0, 0]] },
                aimCameraBody: { x: [[0.5, 20, 0, 0]], y: [[0.5, 20, 0, 0]], z: [[0.5, 20, 0, 0]] },
                hipCameraHead: { x: [[0.5, 20, 0, 0]], y: [[0.5, 20, 0, 0]], z: [[0.5, 20, 0, 0]] },
                aimCameraHead: { x: [[0.5, 20, 0, 0]], y: [[0.5, 20, 0, 0]], z: [[0.5, 20, 0, 0]] }
            },
            hipfirespread: 0,
            spread: 0
        };

        const model = new AnalyticModel({
            weaponData: zeroWeaponData,
            seed: 42
        });

        // Fire 5 shots
        const shots = model.simulateBurst(5, 0.0);
        expect(shots.length).toBe(5);

        for (const shot of shots) {
            expect(shot.rotationRecoilVec.magnitude).toBeCloseTo(0, 6);
            expect(shot.translationRecoilVec.magnitude).toBeCloseTo(0, 6);
            expect(shot.cameraBodyRecoilVec.magnitude).toBeCloseTo(0, 6);
            expect(shot.cameraHeadRecoilVec.magnitude).toBeCloseTo(0, 6);
            expect(shot.spreadSpringVec.magnitude).toBeCloseTo(0, 6);
            // Default lookVector along -Z
            expect(shot.direction.x).toBeCloseTo(0, 6);
            expect(shot.direction.y).toBeCloseTo(0, 6);
            expect(shot.direction.z).toBeCloseTo(-1, 6);
        }
    });

    // -------------------------------------------------------------
    // Test B: Single Impulse & Damping Regimes
    // -------------------------------------------------------------
    test('B. Single Impulse: Underdamped, Critically Damped, and Overdamped closed-form solutions', () => {
        // Underdamped (d = 0.5, s = 20)
        const springUnder = new AnalyticScalarSpring(0, 0.5, 20, 0, 0);
        springUnder.accelerate(10, 0); // impulse v0 = 10 at t=0

        // At t=0, p=0, v=10
        const r0 = springUnder.evaluate(0);
        expect(r0.p).toBeCloseTo(0, 6);
        expect(r0.v).toBeCloseTo(10, 6);

        // At t = 0.05
        const r1 = springUnder.evaluate(0.05);
        expect(r1.p).toBeGreaterThan(0.2); // position displaced
        expect(r1.v).toBeLessThan(10);     // velocity decreasing

        // Critically damped (d = 1.0, s = 20)
        const springCrit = new AnalyticScalarSpring(0, 1.0, 20, 0, 0);
        springCrit.accelerate(10, 0);
        const rc0 = springCrit.evaluate(0);
        expect(rc0.p).toBeCloseTo(0, 6);
        expect(rc0.v).toBeCloseTo(10, 6);

        // At t = 1.0 (long after impulse, must return to rest at target=0)
        const rcEnd = springCrit.evaluate(1.0);
        expect(rcEnd.p).toBeCloseTo(0, 6);
        expect(rcEnd.v).toBeCloseTo(0, 6);

        // Overdamped (d = 2.0, s = 20)
        const springOver = new AnalyticScalarSpring(0, 2.0, 20, 0, 0);
        springOver.accelerate(10, 0);
        const ro1 = springOver.evaluate(0.05);
        expect(ro1.p).toBeGreaterThan(0);
    });

    // -------------------------------------------------------------
    // Test C: Multiple Impulses Accumulation
    // -------------------------------------------------------------
    test('C. Multiple Impulses: Consecutive impulses accumulate velocity and displacement', () => {
        const spring = new AnalyticScalarSpring(0, 0.5, 20, 0, 0);

        // Impulse 1 at t = 0
        spring.accelerate(5, 0.0);
        const p1 = spring.evaluate(0.02).p;

        // Impulse 2 at t = 0.02
        spring.accelerate(5, 0.02);
        const p2 = spring.evaluate(0.04).p;

        // Position after two consecutive impulses must be significantly greater than single impulse
        expect(p2).toBeGreaterThan(p1);
    });

    // -------------------------------------------------------------
    // Test D: Recovery Delay Transition
    // -------------------------------------------------------------
    test('D. Recovery Transition: RecoilSprings switches to recovery parameters after recovery delay', () => {
        const weaponData = {
            recoil: {
                hipRotation: { x: [[0.3, 30, 1.0, 0]] },
                hipRotationRecovery: {
                    x: { a: [[0.9, 10]], d: { delay: 0.1 } }
                }
            }
        };

        const model = new AnalyticModel({ weaponData, seed: 1 });
        // Fire at t = 0
        model.fireSingle(0);

        // Before recovery delay (t = 0.05 < 0.1): firing parameters active (d=0.3, s=30)
        const rotSpring = model.firearmRecoil.rotationSprings.vectorSprings[0].x;
        model.firearmRecoil.rotationSprings.checkRecovery(0.05);
        expect(rotSpring.d).toBeCloseTo(0.3, 5);
        expect(rotSpring.s).toBeCloseTo(30, 5);

        // After recovery delay (t = 0.15 > 0.1): recovery parameters active (d=0.9, s=10)
        model.firearmRecoil.rotationSprings.checkRecovery(0.15);
        expect(rotSpring.d).toBeCloseTo(0.9, 5);
        expect(rotSpring.s).toBeCloseTo(10, 5);
    });

    // -------------------------------------------------------------
    // Test E: CameraHead Isolation (0% in WeaponPose / PhysicalShot)
    // -------------------------------------------------------------
    test('E. CameraHead Isolation: Changing CameraHead recoil does not change WeaponPose or PhysicalShot', () => {
        const baseWeaponData: Record<string, any> = {
            firerate: 600,
            recoil: {
                hipRotation: { x: [[0.5, 20, 0.2, 0]] },
                hipTranslation: { z: [[0.9, 25, 1.0, 0]] }
            },
            cameraRecoil: {
                hipCameraBody: { x: [[0.5, 20, 0.5, 0]] },
                hipCameraHead: { x: [[0.5, 20, 0.1, 0]] }
            }
        };

        // Model 1: Normal CameraHead
        const model1 = new AnalyticModel({ weaponData: baseWeaponData, seed: 100 });
        model1.fireSingle(0);

        // Model 2: Extremely exaggerated CameraHead (100x larger)
        const exaggeratedWeaponData = JSON.parse(JSON.stringify(baseWeaponData));
        exaggeratedWeaponData.cameraRecoil.hipCameraHead.x = [[0.5, 20, 100.0, 0]];

        const model2 = new AnalyticModel({ weaponData: exaggeratedWeaponData, seed: 100 });
        model2.fireSingle(0);

        // Evaluate at t = 0.05s after impulse has developed
        const pose1 = model1.getWeaponPose(0.05);
        const pose2 = model2.getWeaponPose(0.05);

        // WeaponPose forward and translation must remain 100% IDENTICAL
        expect(pose1.forward.x).toBeCloseTo(pose2.forward.x, 9);
        expect(pose1.forward.y).toBeCloseTo(pose2.forward.y, 9);
        expect(pose1.forward.z).toBeCloseTo(pose2.forward.z, 9);
        expect(pose1.translationRecoilVec.z).toBeCloseTo(pose2.translationRecoilVec.z, 9);

        // But CameraHead recoil itself must be drastically different
        expect(pose1.cameraHeadRecoilVec.x).not.toBeCloseTo(pose2.cameraHeadRecoilVec.x, 2);
    });

    // -------------------------------------------------------------
    // Test F: CameraBody Propagation
    // -------------------------------------------------------------
    test('F. CameraBody Propagation: CameraBody recoil directly affects shakeCFrame and PhysicalShot', () => {
        const weaponData1: Record<string, any> = {
            firerate: 600,
            cameraRecoil: {
                hipCameraBody: { x: [[0.5, 20, 0.0, 0]] }, // zero body recoil
                hipCameraHead: { x: [[0.5, 20, 0.0, 0]] }
            }
        };

        const weaponData2: Record<string, any> = {
            firerate: 600,
            cameraRecoil: {
                hipCameraBody: { x: [[0.5, 20, 1.5, 0]] }, // strong body recoil
                hipCameraHead: { x: [[0.5, 20, 0.0, 0]] }
            }
        };

        const m1 = new AnalyticModel({ weaponData: weaponData1, seed: 10 });
        const m2 = new AnalyticModel({ weaponData: weaponData2, seed: 10 });

        m1.fireSingle(0);
        m2.fireSingle(0);

        // Evaluate at t = 0.05s
        const p1 = m1.getWeaponPose(0.05);
        const p2 = m2.getWeaponPose(0.05);

        // CameraBody recoil propagates into WeaponPose.forward
        expect(p1.forward.y).not.toBeCloseTo(p2.forward.y, 3);
    });

    // -------------------------------------------------------------
    // Test G: ADS Behavior
    // -------------------------------------------------------------
    test('G. ADS: 100% ADS zeroes out spread spring impulse and uses aim parameters', () => {
        const weaponData: Record<string, any> = {
            firerate: 600,
            hipfirespread: 0.1,
            hipfirespreadrecover: 10,
            recoil: {
                aimRotation: { x: [[0.3, 30, 0.5, 0]] },
                hipRotation: { x: [[0.3, 30, 2.0, 0]] }
            }
        };

        const model = new AnalyticModel({ weaponData, seed: 123 });
        model.setAim(true, 0);

        // Evaluate at t = 1.0 when aimProgress is 100% aimed
        const shot = model.fireSingle(1.0)!;
        expect(shot.aimProgressAtFire).toBeGreaterThan(0.999);

        // Spread spring impulse = 0.5 * (1 - aimProgressAtFire) * ... = 0!
        expect(shot.spreadSpringVec.magnitude).toBeCloseTo(0, 5);
    });

    // -------------------------------------------------------------
    // Test H: HIPFIRE Behavior
    // -------------------------------------------------------------
    test('H. HIPFIRE: Spread spring is actively stimulated and displaces mainC0', () => {
        const weaponData: Record<string, any> = {
            firerate: 600,
            hipfirespread: 0.2,
            hipfirespreadrecover: 5
        };

        const model = new AnalyticModel({ weaponData, seed: 777 });
        model.setAim(false, 0);

        const shot = model.fireSingle(0)!;
        expect(shot.aimProgressAtFire).toBeCloseTo(0, 4);
        // Spread spring receives impulse
        const spreadPV = model.spreadSpring.evaluate(0.02);
        expect(spreadPV.p.magnitude).toBeGreaterThan(0);
    });

    // -------------------------------------------------------------
    // Test I: Strict Determinism
    // -------------------------------------------------------------
    test('I. Determinism: Same seed and inputs yield identical results down to float precision', () => {
        const weaponData: Record<string, any> = {
            firerate: 800,
            recoil: {
                hipRotation: { x: [[0.3, 35, -0.7, 0.2]], y: [[0.3, 45, -0.25, 0.36]] },
                hipTranslation: { z: [[1.1, 25, 7.1, 0.7]] }
            },
            cameraRecoil: {
                hipCameraBody: { x: [[1, 30, 1.92, 0.45]] }
            },
            hipfirespread: 0.05,
            spread: 0.01
        };

        const run1 = new AnalyticModel({ weaponData, seed: 9999 }).simulateBurst(10, 0);
        const run2 = new AnalyticModel({ weaponData, seed: 9999 }).simulateBurst(10, 0);

        expect(run1.length).toBe(10);
        expect(run2.length).toBe(10);

        for (let i = 0; i < 10; i++) {
            expect(run1[i].direction.x).toBe(run2[i].direction.x);
            expect(run1[i].direction.y).toBe(run2[i].direction.y);
            expect(run1[i].direction.z).toBe(run2[i].direction.z);
            expect(run1[i].origin.x).toBe(run2[i].origin.x);
            expect(run1[i].origin.y).toBe(run2[i].origin.y);
            expect(run1[i].origin.z).toBe(run2[i].origin.z);
        }
    });
});
