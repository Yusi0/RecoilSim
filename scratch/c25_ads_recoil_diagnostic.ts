import fs from 'fs';
import path from 'path';
import { SimulationEngine, Vector3, CFrame, WeaponsParser, WeaponCompiler } from '../src/core';

export function runAdsDiagnostic() {
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
    const compiledC25Data = compileResult.compiledWeaponData;

    console.log('================================================================================');
    console.log('C25 ADS RECOIL 14-SHOT DIAGNOSTIC');
    console.log('================================================================================');
    console.log('Conditions:');
    console.log('  Weapon               : C25');
    console.log('  ADS State            : 100% (aimProgress = 1.0)');
    console.log('  Stance               : Stand');
    console.log('  Device               : Mouse');
    console.log('  Firerate             : 800 RPM (interval = 0.075s)');
    console.log('  Shots                : 14 shots');
    console.log('  Seed                 : 2026');
    console.log('================================================================================\n');

    const seed = 2026;
    const engine = new SimulationEngine({
        weaponData: compiledC25Data,
        seed,
        baseCameraOrientation: CFrame.IDENTITY,
        positionOffset: new Vector3(0, 1.5, 0)
    });

    engine.setStance('stand');
    engine.setDevice('mouse');

    // Enter ADS and wait for aimSpring to reach 100% ADS (aimProgress = 1.0)
    engine.pushAimInput(true, 0.0);
    // C25 aims in ~0.2s, let's advance to 1.0s to ensure 100% steady ADS
    engine.advanceTo(1.0);

    const aimProgressAtStart = engine.getAimProgress();
    console.log(`Pre-fire Aim Progress at t=1.0s: ${aimProgressAtStart.toFixed(6)} (isAiming=${engine.isAiming()})\n`);

    const interval = 60 / compiledC25Data.firerate; // 0.075s
    const totalShots = 14;
    const startTime = 1.0;

    // Queue 14 shots
    for (let i = 0; i < totalShots; i++) {
        engine.pushFireInput(startTime + i * interval);
    }

    const capturedShots: any[] = [];

    engine.setOnPhysicalShot((shot) => {
        const t = shot.timestamp;
        const pose = engine.getWeaponPose(t);

        const rotSpring = engine.firearmRecoil.rotationSprings;
        const transSpring = engine.firearmRecoil.translationSprings;
        const camBodySpring = engine.cameraRecoil.cameraBodySprings;
        const camHeadSpring = engine.cameraRecoil.cameraHeadSprings;
        const spreadSpring = engine.spreadSpring;

        const rot_p = rotSpring.getP(t);
        const rot_v = rotSpring.getV(t);
        const trans_p = transSpring.getP(t);
        const trans_v = transSpring.getV(t);
        const camBody_p = camBodySpring.getP(t);
        const camBody_v = camBodySpring.getV(t);
        const camHead_p = camHeadSpring.getP(t);
        const camHead_v = camHeadSpring.getV(t);

        const weightMult = engine.firearmRecoil.computeWeightRecoilMult();
        const cameraRecoilMult = engine.firearmRecoil.computeCameraRecoilMultiplier();

        capturedShots.push({
            fireCount: shot.fireCount,
            t: t - startTime,
            aimProgressAtFire: shot.aimProgressAtFire,
            actualRecoilMult: {
                weightMult,
                cameraRecoilMult
            },
            spreadSpring_a: spreadSpring.a,
            spreadSpring_p: spreadSpring.p,
            rot_p,
            rot_v,
            trans_p,
            trans_v,
            camBody_p,
            camBody_v,
            camHead_p,
            camHead_v,
            poseForward: pose.forward,
            barrelForward: pose.barrelForward,
            shotDirection: shot.direction
        });
    });

    engine.advanceTo(startTime + totalShots * interval + 0.1);

    // Print detailed table per shot
    for (const s of capturedShots) {
        console.log(`--------------------------------------------------------------------------------`);
        console.log(`Shot #${s.fireCount} (t = ${s.t.toFixed(4)}s) | aimProgressAtFire = ${s.aimProgressAtFire.toFixed(4)}`);
        console.log(`  Actual Recoil Multiplier: weightMult=${s.actualRecoilMult.weightMult.toFixed(4)}, cameraRecoilMult=${s.actualRecoilMult.cameraRecoilMult.toFixed(4)}`);
        console.log(`  spreadSpring.a          : (${s.spreadSpring_a.x.toFixed(6)}, ${s.spreadSpring_a.y.toFixed(6)}, ${s.spreadSpring_a.z.toFixed(6)}) [mag=${s.spreadSpring_a.magnitude.toFixed(6)}]`);
        console.log(`  rotationSpring.p        : (${s.rot_p.x.toFixed(6)}, ${s.rot_p.y.toFixed(6)}, ${s.rot_p.z.toFixed(6)})`);
        console.log(`  rotationSpring.v        : (${s.rot_v.x.toFixed(6)}, ${s.rot_v.y.toFixed(6)}, ${s.rot_v.z.toFixed(6)})`);
        console.log(`  translationSpring.p     : (${s.trans_p.x.toFixed(6)}, ${s.trans_p.y.toFixed(6)}, ${s.trans_p.z.toFixed(6)})`);
        console.log(`  translationSpring.v     : (${s.trans_v.x.toFixed(6)}, ${s.trans_v.y.toFixed(6)}, ${s.trans_v.z.toFixed(6)})`);
        console.log(`  cameraBodySpring.p      : (${s.camBody_p.x.toFixed(6)}, ${s.camBody_p.y.toFixed(6)}, ${s.camBody_p.z.toFixed(6)})`);
        console.log(`  cameraBodySpring.v      : (${s.camBody_v.x.toFixed(6)}, ${s.camBody_v.y.toFixed(6)}, ${s.camBody_v.z.toFixed(6)})`);
        console.log(`  cameraHeadSpring.p      : (${s.camHead_p.x.toFixed(6)}, ${s.camHead_p.y.toFixed(6)}, ${s.camHead_p.z.toFixed(6)})`);
        console.log(`  cameraHeadSpring.v      : (${s.camHead_v.x.toFixed(6)}, ${s.camHead_v.y.toFixed(6)}, ${s.camHead_v.z.toFixed(6)})`);
        console.log(`  WeaponPose.forward      : (${s.poseForward.x.toFixed(6)}, ${s.poseForward.y.toFixed(6)}, ${s.poseForward.z.toFixed(6)})`);
        console.log(`  PhysicalShot.direction  : (${s.shotDirection.x.toFixed(6)}, ${s.shotDirection.y.toFixed(6)}, ${s.shotDirection.z.toFixed(6)})`);
    }
    console.log('================================================================================\n');
}

if (require.main === module) {
    runAdsDiagnostic();
}
