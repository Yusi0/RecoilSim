import fs from 'fs';
import path from 'path';
import { SimulationEngine, Vector3, CFrame, WeaponsParser, WeaponCompiler } from '../src/core';

describe('C25 WeaponPose Architecture Validation', () => {
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

    test('1. Viewmodel final forward matches WeaponPose forward', () => {
        const engine = new SimulationEngine({
            weaponData: compiledC25Data,
            seed: 2026,
            baseCameraOrientation: CFrame.IDENTITY,
            positionOffset: new Vector3(0, 1.5, 0),
            hipOffset: CFrame.newPos(new Vector3(0.18, -0.15, -0.42)),
            aimOffset: CFrame.newPos(new Vector3(0, -0.08, -0.32))
        });

        // Test in ADS during firing
        engine.pushAimInput(true, 0);
        engine.advanceTo(0.3); // settle into ADS
        engine.pushFireInput(0.3);
        engine.advanceTo(0.34); // during recoil movement

        const poseADS = engine.getWeaponPose(0.34);

        // When WeaponPose.weaponCFrame is rendered in Three.js Viewmodel:
        // Three.js forward (0, 0, -1) transformed by rotation matrix is (-r02, -r12, -r22)
        const viewmodelForwardADS = new Vector3(-poseADS.weaponCFrame.r[2], -poseADS.weaponCFrame.r[5], -poseADS.weaponCFrame.r[8]);
        const poseForwardADS = poseADS.forward;

        expect(Math.abs(viewmodelForwardADS.x - poseForwardADS.x)).toBeLessThan(1e-6);
        expect(Math.abs(viewmodelForwardADS.y - poseForwardADS.y)).toBeLessThan(1e-6);
        expect(Math.abs(viewmodelForwardADS.z - poseForwardADS.z)).toBeLessThan(1e-6);

        // Test in Hipfire
        engine.pushAimInput(false, 0.5);
        engine.advanceTo(0.8);
        engine.pushFireInput(0.8);
        engine.advanceTo(0.84);

        const poseHip = engine.getWeaponPose(0.84);
        const viewmodelForwardHip = new Vector3(-poseHip.weaponCFrame.r[2], -poseHip.weaponCFrame.r[5], -poseHip.weaponCFrame.r[8]);
        const poseForwardHip = poseHip.forward;

        expect(Math.abs(viewmodelForwardHip.x - poseForwardHip.x)).toBeLessThan(1e-6);
        expect(Math.abs(viewmodelForwardHip.y - poseForwardHip.y)).toBeLessThan(1e-6);
        expect(Math.abs(viewmodelForwardHip.z - poseForwardHip.z)).toBeLessThan(1e-6);
    });

    test('2. PhysicalShot direction matches forward derived from WeaponPose.v474', () => {
        // Zero RNG bullet spread so direction directly tests the barrel forward axis
        const zeroSpreadData = JSON.parse(JSON.stringify(compiledC25Data));
        zeroSpreadData.spread = 0;

        const engine = new SimulationEngine({
            weaponData: zeroSpreadData,
            seed: 2026,
            baseCameraOrientation: CFrame.IDENTITY,
            positionOffset: new Vector3(0, 1.5, 0)
        });

        engine.pushAimInput(true, 0);
        engine.advanceTo(0.3);
        engine.pushFireInput(0.3);
        engine.advanceTo(0.31);

        expect(engine.physicalShots.length).toBe(1);
        const shot = engine.physicalShots[0];
        const pose = shot.weaponPose!;

        expect(pose).toBeDefined();

        // PhysicalShotSnapshot derives directly from WeaponPose.v474
        expect(shot.v474.equals(pose.v474, 1e-6)).toBe(true);
        expect(shot.origin.equals(pose.v474.p, 1e-6)).toBe(true);

        // Shot direction must match barrel forward (-Z of pose.v474)
        const poseBarrelForward = pose.barrelForward;
        expect(Math.abs(shot.direction.x - poseBarrelForward.x)).toBeLessThan(1e-6);
        expect(Math.abs(shot.direction.y - poseBarrelForward.y)).toBeLessThan(1e-6);
        expect(Math.abs(shot.direction.z - poseBarrelForward.z)).toBeLessThan(1e-6);

        // In standard C25 with identity activeOffset rotation, weapon forward and barrel forward match
        expect(Math.abs(pose.forward.x - poseBarrelForward.x)).toBeLessThan(1e-6);
        expect(Math.abs(pose.forward.y - poseBarrelForward.y)).toBeLessThan(1e-6);
        expect(Math.abs(pose.forward.z - poseBarrelForward.z)).toBeLessThan(1e-6);
    });

    test('3. Hipfire spreadSpring rotates both Viewmodel and PhysicalShot reference frame identically', () => {
        const engine = new SimulationEngine({
            weaponData: compiledC25Data,
            seed: 2026,
            baseCameraOrientation: CFrame.IDENTITY,
            positionOffset: new Vector3(0, 1.5, 0)
        });

        // Fire 2 rounds in hipfire at 800 RPM (0.075s interval)
        engine.pushAimInput(false, 0);
        engine.advanceTo(0.1);
        engine.pushFireInput(0.1);
        engine.pushFireInput(0.175);
        engine.advanceTo(0.25); // shot 2 generated after spread spring integration

        expect(engine.physicalShots.length).toBe(2);
        const shot = engine.physicalShots[1]; // inspect shot 2
        const pose = shot.weaponPose!;

        // spreadSpring must be active in hipfire by shot 2
        expect(pose.spreadSpringVec.magnitude).toBeGreaterThan(0);

        // In PF architecture:
        // mainC0 = shakeCFrame * mainOffset * spreadSpring * translation * rotation
        // Both Viewmodel (from mainC0) and PhysicalShot (from v474 = root * mainC0 * activeOffset)
        // are rotated by spreadSpring together!
        const viewmodelForward = pose.weaponCFrame.zVector.neg();
        const barrelBaseForward = pose.v474.zVector.neg();

        expect(Math.abs(viewmodelForward.x - barrelBaseForward.x)).toBeLessThan(1e-6);
        expect(Math.abs(viewmodelForward.y - barrelBaseForward.y)).toBeLessThan(1e-6);
        expect(Math.abs(viewmodelForward.z - barrelBaseForward.z)).toBeLessThan(1e-6);

        // And projectile shot.direction is centered around this barrelBaseForward
        const dotProduct = shot.direction.dot(barrelBaseForward);
        expect(dotProduct).toBeGreaterThan(0.999);
    });

    test('4. CameraHead recoil has 0% influence on WeaponPose and Viewmodel', () => {
        // Run two identical C25 simulations, but engineB has heavily boosted CameraHead recoil
        const standardData = JSON.parse(JSON.stringify(compiledC25Data));
        const boostedHeadData = JSON.parse(JSON.stringify(compiledC25Data));
        boostedHeadData.recoil.aimCameraHead.x = [[0.35, 50, 100.0, 0]]; // Huge head recoil

        const engineA = new SimulationEngine({
            weaponData: standardData,
            seed: 2026,
            positionOffset: new Vector3(0, 1.5, 0)
        });
        const engineB = new SimulationEngine({
            weaponData: boostedHeadData,
            seed: 2026,
            positionOffset: new Vector3(0, 1.5, 0)
        });

        // Aim and fire 5 rounds in both
        engineA.pushAimInput(true, 0);
        engineB.pushAimInput(true, 0);
        engineA.advanceTo(0.3);
        engineB.advanceTo(0.3);

        const interval = 60 / 800; // 0.075s
        for (let i = 0; i < 5; i++) {
            engineA.pushFireInput(0.3 + i * interval);
            engineB.pushFireInput(0.3 + i * interval);
        }

        engineA.advanceTo(0.7);
        engineB.advanceTo(0.7);

        // Verify PlayerViewSnapshot: CameraHead is active and different between A and B
        const viewA = engineA.getPlayerViewSnapshot(0.7);
        const viewB = engineB.getPlayerViewSnapshot(0.7);
        expect(viewA.cameraHeadRecoilVec.magnitude).toBeLessThan(viewB.cameraHeadRecoilVec.magnitude);
        expect(viewA.v187.equals(viewB.v187, 1e-4)).toBe(false);

        // Verify WeaponPose: EXACTLY identical between A and B (0% influence from CameraHead)
        const poseA = engineA.getWeaponPose(0.7);
        const poseB = engineB.getWeaponPose(0.7);

        expect(poseA.mainC0.equals(poseB.mainC0, 1e-6)).toBe(true);
        expect(poseA.weaponCFrame.equals(poseB.weaponCFrame, 1e-6)).toBe(true);
        expect(poseA.v474.equals(poseB.v474, 1e-6)).toBe(true);
        expect(poseA.forward.equals(poseB.forward, 1e-6)).toBe(true);
        expect(poseA.barrelForward.equals(poseB.barrelForward, 1e-6)).toBe(true);

        // Verify PhysicalShotSnapshots: origin, direction, and v474 are 100% identical
        expect(engineA.physicalShots.length).toBe(engineB.physicalShots.length);
        for (let i = 0; i < engineA.physicalShots.length; i++) {
            const shotA = engineA.physicalShots[i];
            const shotB = engineB.physicalShots[i];
            expect(shotA.origin.equals(shotB.origin, 1e-6)).toBe(true);
            expect(shotA.direction.equals(shotB.direction, 1e-6)).toBe(true);
            expect(shotA.v474.equals(shotB.v474, 1e-6)).toBe(true);
            expect(shotA.weaponPose!.weaponCFrame.equals(shotB.weaponPose!.weaponCFrame, 1e-6)).toBe(true);
        }
    });
});
