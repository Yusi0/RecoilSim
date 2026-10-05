import fs from 'fs';
import path from 'path';
import { WeaponCompiler, SimulationEngine } from '../src/core';

async function main() {
    const inGameDb = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/in-game-modules/weapon_database.json'), 'utf-8'));
    const c25Detail = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/raw/weapon-details/c25.json'), 'utf-8'));
    const inGameC25 = inGameDb['C25'];

    const compiler = new WeaponCompiler();

    const mockNorm = {
        id: 'c25',
        name: 'C25',
        displayName: 'C25',
        category: 'CARBINE',
        attachmentSlots: {}
    } as any;

    const compiledFromDetail = compiler.compileWeapon(mockNorm, {}, new Map(), c25Detail).compiledWeaponData;
    const compiledFromInGame = compiler.compileWeapon(mockNorm, {}, new Map(), inGameC25).compiledWeaponData;

    console.log('--- Compiled Weapon Comparison ---');
    console.log('Detail recoil springs count:', Object.keys(compiledFromDetail.recoil || {}).length);
    console.log('InGame recoil springs count:', Object.keys(compiledFromInGame.recoil || {}).length);

    // Simulate both
    const simDetail = new SimulationEngine({ weaponData: compiledFromDetail, seed: 1337 });
    const simInGame = new SimulationEngine({ weaponData: compiledFromInGame, seed: 1337 });

    const fireInterval = 60 / 800; // 0.075s
    for (let i = 0; i < 5; i++) {
        simDetail.pushFireInput(i * fireInterval);
        simInGame.pushFireInput(i * fireInterval);
    }

    simDetail.advanceTo(5 * fireInterval + 0.1);
    simInGame.advanceTo(5 * fireInterval + 0.1);

    console.log('\n--- Simulation Trajectory Comparison (5 shots) ---');
    console.log('Detail shots count:', simDetail.physicalShots.length);
    console.log('InGame shots count:', simInGame.physicalShots.length);

    for (let i = 0; i < 5; i++) {
        const sD = simDetail.physicalShots[i];
        const sI = simInGame.physicalShots[i];
        console.log(`\nShot ${i + 1} (t=${sD.timestamp.toFixed(3)}s):`);
        console.log(`  Detail: cameraBodyRecoil=(${sD.cameraBodyRecoilVec.x.toFixed(6)}, ${sD.cameraBodyRecoilVec.y.toFixed(6)}, ${sD.cameraBodyRecoilVec.z.toFixed(6)})`);
        console.log(`  InGame: cameraBodyRecoil=(${sI.cameraBodyRecoilVec.x.toFixed(6)}, ${sI.cameraBodyRecoilVec.y.toFixed(6)}, ${sI.cameraBodyRecoilVec.z.toFixed(6)})`);
        console.log(`  Detail: rotRecoil=       (${sD.rotationRecoilVec.x.toFixed(6)}, ${sD.rotationRecoilVec.y.toFixed(6)}, ${sD.rotationRecoilVec.z.toFixed(6)})`);
        console.log(`  InGame: rotRecoil=       (${sI.rotationRecoilVec.x.toFixed(6)}, ${sI.rotationRecoilVec.y.toFixed(6)}, ${sI.rotationRecoilVec.z.toFixed(6)})`);
        console.log(`  Detail: transRecoil=     (${sD.translationRecoilVec.x.toFixed(6)}, ${sD.translationRecoilVec.y.toFixed(6)}, ${sD.translationRecoilVec.z.toFixed(6)})`);
        console.log(`  InGame: transRecoil=     (${sI.translationRecoilVec.x.toFixed(6)}, ${sI.translationRecoilVec.y.toFixed(6)}, ${sI.translationRecoilVec.z.toFixed(6)})`);
        console.log(`  Detail: direction=       (${sD.direction.x.toFixed(6)}, ${sD.direction.y.toFixed(6)}, ${sD.direction.z.toFixed(6)})`);
        console.log(`  InGame: direction=       (${sI.direction.x.toFixed(6)}, ${sI.direction.y.toFixed(6)}, ${sI.direction.z.toFixed(6)})`);

        const diffCam = sD.cameraBodyRecoilVec.sub(sI.cameraBodyRecoilVec).magnitude;
        const diffRot = sD.rotationRecoilVec.sub(sI.rotationRecoilVec).magnitude;
        const diffTrans = sD.translationRecoilVec.sub(sI.translationRecoilVec).magnitude;
        const diffDir = sD.direction.sub(sI.direction).magnitude;
        console.log(`  Delta: cam=${diffCam.toExponential(3)}, rot=${diffRot.toExponential(3)}, trans=${diffTrans.toExponential(3)}, dir=${diffDir.toExponential(3)}`);
    }
}

main().catch(console.error);
