import fs from 'fs';
import path from 'path';
import {
    WeaponsParser,
    WeaponCompiler,
    SimulationEngine,
    Vector3
} from '../src/core';

async function main() {
    console.log('======================================================');
    console.log('1. API-BASED WEAPON RECOIL PIPELINE TRACE');
    console.log('======================================================');

    const rawWeaponsPath = path.join(__dirname, '../data/raw/weapons.json');
    const inGameDbPath = path.join(__dirname, '../data/in-game-modules/weapon_database.json');
    const c25DetailPath = path.join(__dirname, '../data/raw/weapon-details/c25.json');

    const rawWeapons = JSON.parse(fs.readFileSync(rawWeaponsPath, 'utf-8'));
    const inGameDb = JSON.parse(fs.readFileSync(inGameDbPath, 'utf-8'));
    const c25Detail = JSON.parse(fs.readFileSync(c25DetailPath, 'utf-8'));

    const parser = new WeaponsParser();
    const parseResult = parser.parse(rawWeapons);
    const c25Norm = parseResult.weapons.get('c25')!;

    console.log('C25 Normalized Summary from API weapons.json:');
    console.log('  - name:', c25Norm.name);
    console.log('  - category:', c25Norm.category);
    console.log('  - firerate:', c25Norm.firerate);
    console.log('  - magsize:', c25Norm.magsize);
    console.log('  - does normalized have recoil property?:', 'recoil' in (c25Norm as any));

    // Case A: Pure API Compilation
    // In pure API usage without separate sidecar detail files, baseWeaponData is either the raw weapon object or empty/normalized object
    let rawC25FromWeaponsJson: any = null;
    for (const cat of Object.keys(rawWeapons)) {
        const list = Array.isArray(rawWeapons[cat]) ? rawWeapons[cat] : Object.values(rawWeapons[cat]);
        const found = list.find((w: any) => w && (w.name === 'C25' || w.name_key === 'c25' || w.displayName === 'C25'));
        if (found) {
            rawC25FromWeaponsJson = found;
            break;
        }
    }
    console.log('\nRaw C25 in weapons.json keys count:', Object.keys(rawC25FromWeaponsJson || {}).length);
    console.log('Does raw C25 in weapons.json have recoil?:', 'recoil' in (rawC25FromWeaponsJson || {}));

    const compiler = new WeaponCompiler();

    // Compile Case A1: passing raw weapons.json object as baseWeaponData
    const compileResultA1 = compiler.compileWeapon(c25Norm, {}, parseResult.attachments, rawC25FromWeaponsJson);
    const compiledA1 = compileResultA1.compiledWeaponData;

    console.log('\n--- Case A1: Compiled with API raw weapons.json ---');
    console.log('compiledA1.recoil exists?:', compiledA1.recoil !== undefined);
    console.log('compiledA1.recoil value:', JSON.stringify(compiledA1.recoil));

    // Now test SimulationEngine initialization with compiledA1
    console.log('\nInitializing SimulationEngine with compiledA1 (pure API)...');
    const simEngineA1 = new SimulationEngine({
        weaponData: compiledA1,
        seed: 1337
    });

    const fRecoilA1 = (simEngineA1 as any)._firearmRecoil;
    const cRecoilA1 = (simEngineA1 as any)._cameraRecoil;

    console.log('FirearmObjectRecoil _translationSprings count:', fRecoilA1._translationSprings._vector3Springs.length);
    console.log('FirearmObjectRecoil _rotationSprings count:   ', fRecoilA1._rotationSprings._vector3Springs.length);
    console.log('MainCameraObjectRecoil _cameraBodySprings count:', cRecoilA1._cameraBodySprings._vector3Springs.length);
    console.log('MainCameraObjectRecoil _cameraHeadSprings count:', cRecoilA1._cameraHeadSprings._vector3Springs.length);

    // Fire 5 continuous shots in API-based engine
    console.log('\nFiring 5 continuous shots in API-based engine...');
    const fireIntervalA1 = 60 / (compiledA1.firerate || 800);
    for (let i = 0; i < 5; i++) {
        simEngineA1.pushFireInput(i * fireIntervalA1);
    }
    simEngineA1.advanceTo(5 * fireIntervalA1 + 0.1);

    const shotsA1 = simEngineA1.physicalShots;
    console.log(`Shots generated in API engine: ${shotsA1.length}`);
    for (let i = 0; i < shotsA1.length; i++) {
        const s = shotsA1[i];
        console.log(`  Shot ${i + 1} (t=${s.timestamp.toFixed(3)}s):`);
        console.log(`    cameraBodyRecoilVec: (${s.cameraBodyRecoilVec.x}, ${s.cameraBodyRecoilVec.y}, ${s.cameraBodyRecoilVec.z})`);
        console.log(`    rotationRecoilVec:   (${s.rotationRecoilVec.x}, ${s.rotationRecoilVec.y}, ${s.rotationRecoilVec.z})`);
        console.log(`    translationRecoilVec:(${s.translationRecoilVec.x}, ${s.translationRecoilVec.y}, ${s.translationRecoilVec.z})`);
        console.log(`    spreadSpringVec:     (${s.spreadSpringVec.x}, ${s.spreadSpringVec.y}, ${s.spreadSpringVec.z})`);
        console.log(`    direction:           (${s.direction.x.toFixed(6)}, ${s.direction.y.toFixed(6)}, ${s.direction.z.toFixed(6)})`);
    }

    console.log('\n======================================================');
    console.log('2. IN-GAME WEAPON DATABASE SOURCE RECOIL PIPELINE');
    console.log('======================================================');

    const inGameC25 = inGameDb['C25'];
    console.log('In-Game C25 Module keys count:', Object.keys(inGameC25).length);
    console.log('In-Game C25 recoil keys:', Object.keys(inGameC25.recoil || {}));

    // Compile Case B: passing in-game C25 directly into WeaponCompiler!
    const compileResultB = compiler.compileWeapon(c25Norm, {}, parseResult.attachments, inGameC25);
    const compiledB = compileResultB.compiledWeaponData;

    console.log('\n--- Case B: Compiled directly from In-Game WeaponDatabase ---');
    console.log('compiledB.recoil exists?:', compiledB.recoil !== undefined);
    console.log('compiledB.recoil springs count:', Object.keys(compiledB.recoil || {}).length);
    console.log('compiledB.aimCameraBody.x:', JSON.stringify(compiledB.recoil?.aimCameraBody?.x));
    console.log('compiledB.aimRotation.x:  ', JSON.stringify(compiledB.recoil?.aimRotation?.x));
    console.log('compiledB.aimCameraHeadRecovery.x:', JSON.stringify(compiledB.recoil?.aimCameraHeadRecovery?.x));

    // Now test SimulationEngine initialization with compiledB
    console.log('\nInitializing SimulationEngine with compiledB (In-Game Source)...');
    let simEngineB: SimulationEngine | null = null;
    let inGameSimError: any = null;
    try {
        simEngineB = new SimulationEngine({
            weaponData: compiledB,
            seed: 1337
        });
    } catch (err: any) {
        inGameSimError = err;
        console.error('Error instantiating SimulationEngine with inGame data:', err);
    }

    if (simEngineB) {
        const fRecoilB = (simEngineB as any)._firearmRecoil;
        const cRecoilB = (simEngineB as any)._cameraRecoil;

        console.log('FirearmObjectRecoil _translationSprings count:', fRecoilB._translationSprings._vector3Springs.length);
        console.log('FirearmObjectRecoil _rotationSprings count:   ', fRecoilB._rotationSprings._vector3Springs.length);
        console.log('MainCameraObjectRecoil _cameraBodySprings count:', cRecoilB._cameraBodySprings._vector3Springs.length);
        console.log('MainCameraObjectRecoil _cameraHeadSprings count:', cRecoilB._cameraHeadSprings._vector3Springs.length);

        console.log('\nFiring 5 continuous shots in In-Game-based engine...');
        const fireIntervalB = 60 / (compiledB.firerate || 800);
        for (let i = 0; i < 5; i++) {
            simEngineB.pushFireInput(i * fireIntervalB);
        }
        simEngineB.advanceTo(5 * fireIntervalB + 0.1);

        const shotsB = simEngineB.physicalShots;
        console.log(`Shots generated in In-Game engine: ${shotsB.length}`);
        for (let i = 0; i < shotsB.length; i++) {
            const s = shotsB[i];
            console.log(`  Shot ${i + 1} (t=${s.timestamp.toFixed(3)}s):`);
            console.log(`    cameraBodyRecoilVec: (${s.cameraBodyRecoilVec.x.toFixed(6)}, ${s.cameraBodyRecoilVec.y.toFixed(6)}, ${s.cameraBodyRecoilVec.z.toFixed(6)})`);
            console.log(`    rotationRecoilVec:   (${s.rotationRecoilVec.x.toFixed(6)}, ${s.rotationRecoilVec.y.toFixed(6)}, ${s.rotationRecoilVec.z.toFixed(6)})`);
            console.log(`    translationRecoilVec:(${s.translationRecoilVec.x.toFixed(6)}, ${s.translationRecoilVec.y.toFixed(6)}, ${s.translationRecoilVec.z.toFixed(6)})`);
            console.log(`    spreadSpringVec:     (${s.spreadSpringVec.x.toFixed(6)}, ${s.spreadSpringVec.y.toFixed(6)}, ${s.spreadSpringVec.z.toFixed(6)})`);
            console.log(`    direction:           (${s.direction.x.toFixed(6)}, ${s.direction.y.toFixed(6)}, ${s.direction.z.toFixed(6)})`);
        }
    }

    console.log('\n======================================================');
    console.log('3. COMPILATION OF OTHER WEAPONS FROM IN-GAME DATABASE');
    console.log('======================================================');
    const sampleWeapons = ['AK105', 'M231', 'M16A3', 'M4A1', 'C7A2', 'C8A2'];
    for (const wKey of sampleWeapons) {
        const rawW = inGameDb[wKey];
        if (!rawW) {
            console.log(`Weapon ${wKey} not found in inGameDb`);
            continue;
        }
        try {
            const res = compiler.compileWeapon(
                { name: wKey, displayName: wKey, category: rawW.type, attachmentSlots: {} } as any,
                {},
                parseResult.attachments,
                rawW
            );
            const sim = new SimulationEngine({ weaponData: res.compiledWeaponData, seed: 42 });
            sim.pushFireInput(0.0);
            sim.advanceTo(0.2);
            console.log(`Weapon ${wKey}: SUCCESS! Compiled keys: ${Object.keys(res.compiledWeaponData).length}, Shots fired: ${sim.physicalShots.length}`);
            if (sim.physicalShots.length > 0) {
                const s = sim.physicalShots[0];
                console.log(`  Shot 1 cameraBodyRecoil: (${s.cameraBodyRecoilVec.x.toFixed(4)}, ${s.cameraBodyRecoilVec.y.toFixed(4)}, ${s.cameraBodyRecoilVec.z.toFixed(4)})`);
            }
        } catch (e: any) {
            console.log(`Weapon ${wKey}: FAILED - ${e.message}`);
        }
    }
}

main().catch(console.error);
