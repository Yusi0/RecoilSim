import fs from 'fs';
import path from 'path';
import { SimulationEngine, Vector3, CFrame, WeaponsParser, WeaponCompiler } from '../src/core';

function runGoldenSimulation() {
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

    // Run Scenarios: Single Shot, 3-Shot Burst, 10-Shot Burst + Recovery
    const seed = 2026;

    // 1. Single Shot (ADS, Stand, Mouse)
    const engine1 = new SimulationEngine({ weaponData: compiledC25Data, seed });
    engine1.pushAimInput(true, 0.0);
    engine1.advanceTo(0.3);
    engine1.pushFireInput(0.3);
    engine1.advanceTo(0.5);

    // 2. 3-Shot Burst
    const engine3 = new SimulationEngine({ weaponData: compiledC25Data, seed });
    engine3.pushAimInput(true, 0.0);
    engine3.advanceTo(0.3);
    const interval = 60 / 800; // 0.075s
    for (let i = 0; i < 3; i++) {
        engine3.pushFireInput(0.3 + i * interval);
    }
    engine3.advanceTo(0.6);

    // 3. 10-Shot Burst + Recovery
    const engine10 = new SimulationEngine({ weaponData: compiledC25Data, seed });
    engine10.pushAimInput(true, 0.0);
    engine10.advanceTo(0.3);
    for (let i = 0; i < 10; i++) {
        engine10.pushFireInput(0.3 + i * interval);
    }
    engine10.advanceTo(3.0); // Recovery up to 3.0s

    const recoveryPos = engine10.firearmRecoil.getPositions(3.0);
    const recoveryView = engine10.getPlayerViewSnapshot(3.0);

    const exportData = {
        seed,
        compiledWeaponData: compiledC25Data,
        singleShot: {
            shots: engine1.physicalShots,
            view: engine1.getPlayerViewSnapshot(0.5)
        },
        burst3: {
            shots: engine3.physicalShots,
            view: engine3.getPlayerViewSnapshot(0.6)
        },
        burst10: {
            shots: engine10.physicalShots,
            recovery: {
                timestamp: 3.0,
                translationRecoilVec: recoveryPos.translation,
                rotationRecoilVec: recoveryPos.rotation,
                cameraBodyRecoilVec: recoveryView.cameraBodyRecoilVec,
                cameraHeadRecoilVec: recoveryView.cameraHeadRecoilVec
            }
        }
    };

    const outPath = path.join(__dirname, 'ts_c25_golden_export.json');
    fs.writeFileSync(outPath, JSON.stringify(exportData, null, 2));
    console.log('TS Golden Simulation Export saved to:', outPath);
}

runGoldenSimulation();
