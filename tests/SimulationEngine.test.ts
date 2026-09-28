import { SimulationEngine, Vector3, CFrame } from '../src/core';

describe('SimulationEngine - Deterministic Simulation Core', () => {
    const mockWeaponData = {
        firerate: 600, // 600 RPM = 0.1s fire interval
        recoildelay: 0.05,
        firedelay: 0.02,
        hipfirespread: 1.0,
        hipfirespreadrecover: 1.0,
        camerarecoilmult: 1.0,
        weightrecoilmult: 1.0,
        spread: 0.05,
        recoil: {
            hipTranslation: {
                z: [[0.5, 20, 0.2, 0.05]]
            },
            hipRotation: {
                x: [[0.5, 20, 0.3, 0.05]]
            },
            camera: {
                hipCameraBody: {
                    x: [[0.5, 20, 0.1, 0.02]]
                },
                hipCameraHead: {
                    y: [[0.5, 20, 0.5, 0.1]] // Large head recoil for testing
                }
            }
        }
    };

    it('1. FIRE_INPUT -> RECOIL_IMPULSE delay verification', () => {
        const engine = new SimulationEngine({ weaponData: mockWeaponData, seed: 42 });
        engine.pushFireInput(0.0);

        // Advance to t = 0.03 (before recoildelay = 0.05)
        engine.advanceTo(0.03);
        const viewBefore = engine.getPlayerViewSnapshot();
        expect(viewBefore.cameraBodyRecoilVec.x).toBe(0);

        // Advance to t = 0.06 (after recoildelay = 0.05)
        engine.advanceTo(0.06);
        const viewAfter = engine.getPlayerViewSnapshot();
        expect(viewAfter.cameraBodyRecoilVec.x).toBeGreaterThan(0);
    });

    it('2. FIRE_INPUT -> SHOT_GENERATE delay verification', () => {
        const engine = new SimulationEngine({ weaponData: mockWeaponData, seed: 42 });
        engine.pushFireInput(0.0);

        // Advance to t = 0.01 (before firedelay = 0.02)
        engine.advanceTo(0.01);
        expect(engine.physicalShots.length).toBe(0);

        // Advance to t = 0.03 (after firedelay = 0.02)
        engine.advanceTo(0.03);
        expect(engine.physicalShots.length).toBe(1);
        expect(engine.physicalShots[0].timestamp).toBe(0.02);
    });

    it('3. Captures aimProgressAtFire at t_fire', () => {
        const engine = new SimulationEngine({ weaponData: mockWeaponData, seed: 42 });

        // Start hip firing at t = 0
        engine.pushFireInput(0.0);
        expect(engine.getAimProgress()).toBe(0.0);

        // Switch to aim input at t = 0.01 (before recoildelay = 0.05)
        engine.pushAimInput(true, 0.01);

        // Advance to t = 0.06 (recoil impulse processed)
        engine.advanceTo(0.06);

        // Shot snapshot captured aimProgressAtFire should be 0.0
        expect(engine.physicalShots.length).toBe(1);
        expect(engine.physicalShots[0].aimProgressAtFire).toBe(0.0);
    });

    it('4. Dynamically evaluates stance/device at impulse time', () => {
        const engineStanding = new SimulationEngine({ weaponData: mockWeaponData, seed: 42 });
        engineStanding.setStance('stand');
        engineStanding.pushFireInput(0.0);
        engineStanding.advanceTo(0.1);

        const engineProne = new SimulationEngine({ weaponData: mockWeaponData, seed: 42 });
        engineProne.setStance('stand');
        engineProne.pushFireInput(0.0);
        // Change stance to prone at t = 0.02 (before recoildelay = 0.05)
        engineProne.setStance('prone');
        engineProne.advanceTo(0.1);

        // Camera recoil in prone stance should be damped compared to standing stance
        const viewStand = engineStanding.getPlayerViewSnapshot(0.1);
        const viewProne = engineProne.getPlayerViewSnapshot(0.1);

        expect(viewProne.cameraBodyRecoilVec.x).toBeLessThan(viewStand.cameraBodyRecoilVec.x);
    });

    it('5. Enforces nextShotTime / canFire cooldown', () => {
        const engine = new SimulationEngine({ weaponData: mockWeaponData, seed: 42 });

        expect(engine.canFire(0.0)).toBe(true);
        const fired1 = engine.pushFireInput(0.0);
        expect(fired1).toBe(true);

        // Process FIRE_INPUT at t = 0.0
        engine.advanceTo(0.0);

        // firerate 600 RPM = 0.1s interval -> nextShotTime = 0.1s
        expect(engine.firearmState.nextShotTime).toBeCloseTo(0.1);

        // Attempting to fire at t = 0.05 should be rejected
        expect(engine.canFire(0.05)).toBe(false);
        const fired2 = engine.pushFireInput(0.05);
        expect(fired2).toBe(false);

        // Firing at t = 0.1 should succeed
        expect(engine.canFire(0.1)).toBe(true);
        const fired3 = engine.pushFireInput(0.1);
        expect(fired3).toBe(true);
    });

    it('6. Reproduces 100% identical shot snapshots given the same seed & inputs', () => {
        const createAndRun = (seed: number) => {
            const engine = new SimulationEngine({ weaponData: mockWeaponData, seed });
            engine.pushFireInput(0.0);
            engine.pushFireInput(0.1);
            engine.pushFireInput(0.2);
            engine.advanceTo(0.35);
            return engine.physicalShots;
        };

        const shotsRun1 = createAndRun(12345);
        const shotsRun2 = createAndRun(12345);

        expect(shotsRun1.length).toBe(3);
        expect(shotsRun2.length).toBe(3);

        for (let i = 0; i < 3; i++) {
            expect(shotsRun1[i].origin.x).toBe(shotsRun2[i].origin.x);
            expect(shotsRun1[i].origin.y).toBe(shotsRun2[i].origin.y);
            expect(shotsRun1[i].origin.z).toBe(shotsRun2[i].origin.z);
            expect(shotsRun1[i].direction.x).toBe(shotsRun2[i].direction.x);
            expect(shotsRun1[i].direction.y).toBe(shotsRun2[i].direction.y);
            expect(shotsRun1[i].direction.z).toBe(shotsRun2[i].direction.z);
        }
    });

    it('7. Yields identical physical shot results across different render timesteps', () => {
        // Run 1: Big single step
        const engineBig = new SimulationEngine({ weaponData: mockWeaponData, seed: 99 });
        engineBig.pushFireInput(0.0);
        engineBig.advanceTo(0.2);

        // Run 2: Fine-grained 60 FPS micro-steps
        const engineFine = new SimulationEngine({ weaponData: mockWeaponData, seed: 99 });
        engineFine.pushFireInput(0.0);
        for (let t = 0.0166; t <= 0.2; t += 0.0166) {
            engineFine.advanceTo(t);
        }
        engineFine.advanceTo(0.2);

        const shotsBig = engineBig.physicalShots;
        const shotsFine = engineFine.physicalShots;

        expect(shotsBig.length).toBe(1);
        expect(shotsFine.length).toBe(1);

        expect(shotsBig[0].origin.x).toBeCloseTo(shotsFine[0].origin.x, 5);
        expect(shotsBig[0].origin.y).toBeCloseTo(shotsFine[0].origin.y, 5);
        expect(shotsBig[0].origin.z).toBeCloseTo(shotsFine[0].origin.z, 5);
        expect(shotsBig[0].direction.x).toBeCloseTo(shotsFine[0].direction.x, 5);
        expect(shotsBig[0].direction.y).toBeCloseTo(shotsFine[0].direction.y, 5);
        expect(shotsBig[0].direction.z).toBeCloseTo(shotsFine[0].direction.z, 5);
    });

    it('8. Verifies CameraHead has 0% influence on Physical Shot Pipeline', () => {
        // Weapon without head recoil
        const noHeadWeapon = JSON.parse(JSON.stringify(mockWeaponData));
        delete noHeadWeapon.recoil.camera.hipCameraHead;

        const engineNormal = new SimulationEngine({ weaponData: mockWeaponData, seed: 555 });
        engineNormal.pushFireInput(0.0);
        engineNormal.advanceTo(0.1);

        const engineNoHead = new SimulationEngine({ weaponData: noHeadWeapon, seed: 555 });
        engineNoHead.pushFireInput(0.0);
        engineNoHead.advanceTo(0.1);

        const shotNormal = engineNormal.physicalShots[0];
        const shotNoHead = engineNoHead.physicalShots[0];

        // Physical Shot origin & direction MUST BE 100% IDENTICAL
        expect(shotNormal.origin.x).toBe(shotNoHead.origin.x);
        expect(shotNormal.origin.y).toBe(shotNoHead.origin.y);
        expect(shotNormal.origin.z).toBe(shotNoHead.origin.z);
        expect(shotNormal.direction.x).toBe(shotNoHead.direction.x);
        expect(shotNormal.direction.y).toBe(shotNoHead.direction.y);
        expect(shotNormal.direction.z).toBe(shotNoHead.direction.z);

        // However, Player View v187 (which includes Head Recoil) MUST BE DIFFERENT
        const viewNormal = engineNormal.getPlayerViewSnapshot(0.1);
        const viewNoHead = engineNoHead.getPlayerViewSnapshot(0.1);
        expect(viewNormal.v187.equals(viewNoHead.v187)).toBe(false);
    });

    it('9. Verifies CameraBody HAS influence on Physical Shot Pipeline', () => {
        const bodyWeapon = JSON.parse(JSON.stringify(mockWeaponData));
        bodyWeapon.recoildelay = 0.0; // Ensure recoil impulse executes at t_fire = 0 before t_shot = 0.02

        const noBodyWeapon = JSON.parse(JSON.stringify(mockWeaponData));
        noBodyWeapon.recoildelay = 0.0;
        delete noBodyWeapon.recoil.camera.hipCameraBody;

        const engineNormal = new SimulationEngine({ weaponData: bodyWeapon, seed: 777 });
        engineNormal.pushFireInput(0.0);
        engineNormal.advanceTo(0.1);

        const engineNoBody = new SimulationEngine({ weaponData: noBodyWeapon, seed: 777 });
        engineNoBody.pushFireInput(0.0);
        engineNoBody.advanceTo(0.1);

        const shotNormal = engineNormal.physicalShots[0];
        const shotNoBody = engineNoBody.physicalShots[0];

        // Physical Shot origin or direction MUST CHANGE when CameraBody changes
        const isDifferent =
            shotNormal.origin.x !== shotNoBody.origin.x ||
            shotNormal.origin.y !== shotNoBody.origin.y ||
            shotNormal.direction.x !== shotNoBody.direction.x ||
            shotNormal.direction.y !== shotNoBody.direction.y;

        expect(isDifferent).toBe(true);
    });

    it('10. Generates v474, origin, and direction at SHOT_GENERATE time', () => {
        const engine = new SimulationEngine({
            weaponData: mockWeaponData,
            seed: 888,
            rootCFrame: CFrame.newPos(new Vector3(0, 5, 0)),
            barrelOffset: CFrame.newPos(new Vector3(0, 0, -2))
        });

        engine.pushFireInput(0.0);
        engine.advanceTo(0.1);

        expect(engine.physicalShots.length).toBe(1);
        const shot = engine.physicalShots[0];

        expect(shot.v474).toBeDefined();
        expect(shot.origin).toBeDefined();
        expect(shot.direction).toBeDefined();

        // Direction must be a normalized unit vector (|dir| ≈ 1.0)
        const magnitude = Math.sqrt(
            shot.direction.x * shot.direction.x +
            shot.direction.y * shot.direction.y +
            shot.direction.z * shot.direction.z
        );
        expect(magnitude).toBeCloseTo(1.0, 5);
    });
});
