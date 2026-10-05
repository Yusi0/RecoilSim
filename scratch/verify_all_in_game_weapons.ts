import fs from 'fs';
import path from 'path';
import {
    WeaponCompiler,
    SimulationEngine,
    Vector3,
    WeaponsParser,
    NormalizedWeapon
} from '../src/core';
import { FirearmObjectRecoil } from '../src/core/recoil/FirearmObjectRecoil';
import { MainCameraObjectRecoil } from '../src/core/recoil/MainCameraObjectRecoil';

interface WeaponCompatibilityResult {
    weaponId: string;
    name: string;
    category: string;
    isFirearm: boolean;
    compileStatus: 'SUCCESS' | 'FAILED';
    compileError?: string;
    compiledKeysCount: number;
    firerate: number;
    magsize: number;
    hasRecoilInCompiled: boolean;
    recoilInitStatus: 'SUCCESS' | 'FAILED';
    recoilInitError?: string;
    springCounts: {
        translation: number;
        rotation: number;
        cameraBody: number;
        cameraHead: number;
        total: number;
    };
    simulationStatus: 'SUCCESS' | 'FAILED' | 'SPECIAL_MELEE_OR_GRENADE';
    simulationError?: string;
    shotsFired: number;
    hasNaNOrInfinity: boolean;
    shot1Recoil?: {
        cameraBody: [number, number, number];
        rotation: [number, number, number];
        translation: [number, number, number];
        direction: [number, number, number];
    };
    shot2Recoil?: {
        cameraBody: [number, number, number];
        rotation: [number, number, number];
        translation: [number, number, number];
        direction: [number, number, number];
    };
    recoilImpulseActive: boolean;
    issues: string[];
}

function hasInvalidNumbers(vec: Vector3): boolean {
    return isNaN(vec.x) || isNaN(vec.y) || isNaN(vec.z) ||
        !isFinite(vec.x) || !isFinite(vec.y) || !isFinite(vec.z);
}

async function runFullCompatibilityCheck() {
    console.log('================================================================');
    console.log('1. INITIALIZING IN-GAME WEAPON COMPATIBILITY TEST RUNNER');
    console.log('================================================================');

    const inGameDbPath = path.join(__dirname, '../data/in-game-modules/weapon_database.json');
    const normalizedWeaponsPath = path.join(__dirname, '../data/normalized/weapons.json');
    const c25GoldenPath = path.join(__dirname, '../data/C25.json');

    const inGameDb = JSON.parse(fs.readFileSync(inGameDbPath, 'utf-8'));
    const normalizedWeapons = JSON.parse(fs.readFileSync(normalizedWeaponsPath, 'utf-8'));
    const c25Golden = JSON.parse(fs.readFileSync(c25GoldenPath, 'utf-8'));

    const inGameKeys = Object.keys(inGameDb);
    console.log(`Authoritative In-Game Database Total Weapons: ${inGameKeys.length}`);
    console.log(`Normalized Weapons in repository:            ${Object.keys(normalizedWeapons).length}`);

    const compiler = new WeaponCompiler();
    const results: WeaponCompatibilityResult[] = [];

    // Category mapping & stats
    const categoryStats: Record<string, { total: number; compilePass: number; compileFail: number; simPass: number; simFail: number; firearms: number }> = {};

    let totalCompilePass = 0;
    let totalCompileFail = 0;
    let totalRecoilInitPass = 0;
    let totalRecoilInitFail = 0;
    let totalSimPass = 0;
    let totalSimFail = 0;
    let totalNaNOrInfinity = 0;
    let totalZeroRecoilFirearms = 0;

    console.log('\n================================================================');
    console.log('2. EXECUTING 416 WEAPON COMPILATION & SIMULATION PIPELINE');
    console.log('================================================================');

    for (let i = 0; i < inGameKeys.length; i++) {
        const wKey = inGameKeys[i];
        const rawW = inGameDb[wKey];
        const issues: string[] = [];

        const category = rawW.category || rawW.type || 'UNKNOWN';
        if (!categoryStats[category]) {
            categoryStats[category] = { total: 0, compilePass: 0, compileFail: 0, simPass: 0, simFail: 0, firearms: 0 };
        }
        categoryStats[category].total++;

        const isFirearm = !!rawW.recoil && Object.keys(rawW.recoil).length > 0;
        if (isFirearm) {
            categoryStats[category].firearms++;
        }

        const weaponId = (rawW.name || wKey).toLowerCase().replace(/[^a-z0-9_-]/g, '_');

        const mockNormalized: NormalizedWeapon = {
            id: weaponId,
            name: rawW.name || wKey,
            displayName: rawW.displayName || rawW.name || wKey,
            category: category,
            stats: {
                rpm: rawW.firerate,
                magsize: rawW.magsize,
                sparerounds: rawW.sparerounds,
                walkspeed: rawW.walkspeed
            },
            attachmentSlots: {}
        };

        let compileStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
        let compileError: string | undefined;
        let compiledData: any = null;

        // Step 1: Compile Weapon
        try {
            const compileRes = compiler.compileWeapon(mockNormalized, {}, new Map(), rawW);
            compiledData = compileRes.compiledWeaponData;
            totalCompilePass++;
            categoryStats[category].compilePass++;
        } catch (err: any) {
            compileStatus = 'FAILED';
            compileError = err.message || String(err);
            totalCompileFail++;
            categoryStats[category].compileFail++;
            issues.push(`COMPILE_ERROR: ${compileError}`);
        }

        // Step 2: Recoil Controller Initialization
        let recoilInitStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
        let recoilInitError: string | undefined;
        let springCounts = { translation: 0, rotation: 0, cameraBody: 0, cameraHead: 0, total: 0 };

        if (compiledData) {
            try {
                const fRecoil = new FirearmObjectRecoil(compiledData);
                const cRecoil = new MainCameraObjectRecoil(compiledData.cameraRecoil || compiledData.recoil);

                const tSprings = (fRecoil as any)._translationSprings?._vector3Springs?.length ?? 0;
                const rSprings = (fRecoil as any)._rotationSprings?._vector3Springs?.length ?? 0;
                const cbSprings = (cRecoil as any)._cameraBodySprings?._vector3Springs?.length ?? 0;
                const chSprings = (cRecoil as any)._cameraHeadSprings?._vector3Springs?.length ?? 0;

                springCounts = {
                    translation: tSprings,
                    rotation: rSprings,
                    cameraBody: cbSprings,
                    cameraHead: chSprings,
                    total: tSprings + rSprings + cbSprings + chSprings
                };

                totalRecoilInitPass++;
            } catch (err: any) {
                recoilInitStatus = 'FAILED';
                recoilInitError = err.message || String(err);
                totalRecoilInitFail++;
                issues.push(`RECOIL_INIT_ERROR: ${recoilInitError}`);
            }
        } else {
            recoilInitStatus = 'FAILED';
            totalRecoilInitFail++;
        }

        // Step 3: Simulation Engine & Firing Test
        let simulationStatus: 'SUCCESS' | 'FAILED' | 'SPECIAL_MELEE_OR_GRENADE' = 'SUCCESS';
        let simulationError: string | undefined;
        let shotsFired = 0;
        let hasNaNOrInfinity = false;
        let shot1Recoil: any = undefined;
        let shot2Recoil: any = undefined;
        let recoilImpulseActive = false;

        if (compiledData && recoilInitStatus === 'SUCCESS') {
            try {
                const sim = new SimulationEngine({
                    weaponData: compiledData,
                    seed: 1337
                });

                const rawFirerate = compiledData.firerate;
                const isArrayFirerate = Array.isArray(rawFirerate);
                const firerateScalar = isArrayFirerate ? rawFirerate[0] : (rawFirerate || 600);
                const fireInterval = 60 / firerateScalar;

                // Push 2 shots
                sim.pushFireInput(0.0);
                sim.pushFireInput(fireInterval);

                // Advance virtual time past shot 2 + cooldown
                sim.advanceTo(fireInterval * 2 + 0.1);

                const shots = sim.physicalShots;
                shotsFired = shots.length;

                if (isArrayFirerate) {
                    issues.push(`ARRAY_FIRERATE_DETECTED: [${rawFirerate.join(', ')}]`);
                }

                if (shots.length >= 1) {
                    const s1 = shots[0];
                    shot1Recoil = {
                        cameraBody: [s1.cameraBodyRecoilVec.x, s1.cameraBodyRecoilVec.y, s1.cameraBodyRecoilVec.z],
                        rotation: [s1.rotationRecoilVec.x, s1.rotationRecoilVec.y, s1.rotationRecoilVec.z],
                        translation: [s1.translationRecoilVec.x, s1.translationRecoilVec.y, s1.translationRecoilVec.z],
                        direction: [s1.direction.x, s1.direction.y, s1.direction.z]
                    };

                    if (hasInvalidNumbers(s1.cameraBodyRecoilVec) ||
                        hasInvalidNumbers(s1.rotationRecoilVec) ||
                        hasInvalidNumbers(s1.translationRecoilVec) ||
                        hasInvalidNumbers(s1.direction)) {
                        hasNaNOrInfinity = true;
                    }
                }

                if (shots.length >= 2) {
                    const s2 = shots[1];
                    shot2Recoil = {
                        cameraBody: [s2.cameraBodyRecoilVec.x, s2.cameraBodyRecoilVec.y, s2.cameraBodyRecoilVec.z],
                        rotation: [s2.rotationRecoilVec.x, s2.rotationRecoilVec.y, s2.rotationRecoilVec.z],
                        translation: [s2.translationRecoilVec.x, s2.translationRecoilVec.y, s2.translationRecoilVec.z],
                        direction: [s2.direction.x, s2.direction.y, s2.direction.z]
                    };

                    if (hasInvalidNumbers(s2.cameraBodyRecoilVec) ||
                        hasInvalidNumbers(s2.rotationRecoilVec) ||
                        hasInvalidNumbers(s2.translationRecoilVec) ||
                        hasInvalidNumbers(s2.direction)) {
                        hasNaNOrInfinity = true;
                    }

                    // Check if recoil impulse is active (shot 2 has non-zero recoil)
                    const recoilMagnitude = s2.cameraBodyRecoilVec.magnitude + s2.rotationRecoilVec.magnitude + s2.translationRecoilVec.magnitude;
                    if (recoilMagnitude > 1e-6) {
                        recoilImpulseActive = true;
                    }
                }

                // For very slow firing weapons like CAN CANNON (35 RPM), check impulse peak right after shot 1 (at t = 0.05s)
                if (isFirearm && !recoilImpulseActive && shots.length >= 1) {
                    const simPeak = new SimulationEngine({ weaponData: compiledData, seed: 1337 });
                    simPeak.pushFireInput(0.0);
                    simPeak.advanceTo(0.05); // check at peak recoil (50ms)
                    const peakView = simPeak.getPlayerViewSnapshot();
                    const peakPose = simPeak.getWeaponPose(0.05);
                    const peakMagnitude = peakView.cameraBodyRecoilVec.magnitude + peakPose.rotationRecoilVec.magnitude + peakPose.translationRecoilVec.magnitude;
                    if (peakMagnitude > 1e-4) {
                        recoilImpulseActive = true; // Confirmed active impulse!
                        issues.push(`SLOW_FIRE_FULL_RECOVERY: Recovered before shot 2 (peak at 50ms = ${peakMagnitude.toFixed(4)})`);
                    }
                }

                if (hasNaNOrInfinity) {
                    totalNaNOrInfinity++;
                    issues.push('NAN_OR_INFINITY_DETECTED');
                }

                if (isFirearm && !recoilImpulseActive) {
                    totalZeroRecoilFirearms++;
                    issues.push('ZERO_RECOIL_SUSPECTED_FIREARM');
                }

                totalSimPass++;
                categoryStats[category].simPass++;
            } catch (err: any) {
                simulationStatus = 'FAILED';
                simulationError = err.message || String(err);
                totalSimFail++;
                categoryStats[category].simFail++;
                issues.push(`SIMULATION_ERROR: ${simulationError}`);
            }
        } else {
            simulationStatus = 'FAILED';
            totalSimFail++;
            categoryStats[category].simFail++;
        }

        results.push({
            weaponId,
            name: rawW.name || wKey,
            category,
            isFirearm,
            compileStatus,
            compileError,
            compiledKeysCount: compiledData ? Object.keys(compiledData).length : 0,
            firerate: compiledData?.firerate ?? rawW.firerate,
            magsize: compiledData?.magsize ?? rawW.magsize,
            hasRecoilInCompiled: !!(compiledData?.recoil),
            recoilInitStatus,
            recoilInitError,
            springCounts,
            simulationStatus,
            simulationError,
            shotsFired,
            hasNaNOrInfinity,
            shot1Recoil,
            shot2Recoil,
            recoilImpulseActive,
            issues
        });
    }

    // Save full JSON
    const outputPath = path.join(__dirname, 'full_in_game_weapon_compatibility.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\nResults written to: ${outputPath} (${results.length} weapons)`);

    console.log('\n================================================================');
    console.log('3. OVERALL COMPATIBILITY SUMMARY');
    console.log('================================================================');
    console.log(`Total Weapons Tested:              ${results.length}`);
    console.log(`Compile Success:                   ${totalCompilePass} / ${results.length} (${(totalCompilePass / results.length * 100).toFixed(1)}%)`);
    console.log(`Compile Failure:                   ${totalCompileFail}`);
    console.log(`Recoil Initialization Success:     ${totalRecoilInitPass} / ${results.length} (${(totalRecoilInitPass / results.length * 100).toFixed(1)}%)`);
    console.log(`Recoil Initialization Failure:     ${totalRecoilInitFail}`);
    console.log(`Simulation Success:                ${totalSimPass} / ${results.length} (${(totalSimPass / results.length * 100).toFixed(1)}%)`);
    console.log(`Simulation Failure:                ${totalSimFail}`);
    console.log(`NaN / Infinity Detected:           ${totalNaNOrInfinity}`);
    console.log(`Zero-Recoil Suspected in Firearms: ${totalZeroRecoilFirearms}`);

    console.log('\n================================================================');
    console.log('4. CATEGORY COVERAGE TABLE');
    console.log('================================================================');
    console.log(String('Category').padEnd(22) + String('Total').padEnd(8) + String('Firearms').padEnd(10) + String('CompilePass').padEnd(14) + String('SimPass').padEnd(10));
    console.log('-'.repeat(64));
    for (const cat of Object.keys(categoryStats).sort()) {
        const s = categoryStats[cat];
        console.log(
            cat.padEnd(22) +
            String(s.total).padEnd(8) +
            String(s.firearms).padEnd(10) +
            String(`${s.compilePass}/${s.total}`).padEnd(14) +
            String(`${s.simPass}/${s.total}`).padEnd(10)
        );
    }

    console.log('\n================================================================');
    console.log('5. REPRESENTATIVE DETAILED TEST RESULTS');
    console.log('================================================================');
    const representativeIds = ['c25', 'ak105', 'm231', 'm16a3', 'm4a1', 'c7a2', 'c8a2'];
    for (const rId of representativeIds) {
        const item = results.find(r => r.weaponId === rId);
        if (!item) continue;
        console.log(`\n=== [${item.name}] (${item.category}) ===`);
        console.log(`  Compile: ${item.compileStatus} (keys: ${item.compiledKeysCount})`);
        console.log(`  Recoil Init: ${item.recoilInitStatus} (Springs: trans=${item.springCounts.translation}, rot=${item.springCounts.rotation}, camBody=${item.springCounts.cameraBody}, camHead=${item.springCounts.cameraHead})`);
        console.log(`  Firerate: ${item.firerate} RPM | Magsize: ${item.magsize}`);
        console.log(`  Simulation: ${item.simulationStatus} (Shots fired: ${item.shotsFired}, NaN/Inf: ${item.hasNaNOrInfinity})`);
        console.log(`  Recoil Impulse Active: ${item.recoilImpulseActive}`);
        if (item.shot1Recoil && item.shot2Recoil) {
            console.log(`  Shot 1: Cam=(${item.shot1Recoil.cameraBody.map(v => v.toFixed(4)).join(',')}) Rot=(${item.shot1Recoil.rotation.map(v => v.toFixed(4)).join(',')}) Trans=(${item.shot1Recoil.translation.map(v => v.toFixed(4)).join(',')})`);
            console.log(`  Shot 2: Cam=(${item.shot2Recoil.cameraBody.map(v => v.toFixed(4)).join(',')}) Rot=(${item.shot2Recoil.rotation.map(v => v.toFixed(4)).join(',')}) Trans=(${item.shot2Recoil.translation.map(v => v.toFixed(4)).join(',')})`);
        }
    }

    console.log('\n================================================================');
    console.log('6. C25 GOLDEN SIMULATION COMPARISON');
    console.log('================================================================');
    // Compare C25 from in-game module against C25 Golden file
    const c25InGameCompiled = results.find(r => r.weaponId === 'c25')!;
    const simGolden = new SimulationEngine({ weaponData: c25Golden, seed: 1337 });
    simGolden.pushFireInput(0.0);
    simGolden.pushFireInput(60 / 800);
    simGolden.advanceTo(60 / 800 * 2 + 0.1);

    const goldenShot1 = simGolden.physicalShots[0];
    const goldenShot2 = simGolden.physicalShots[1];

    console.log('C25 Golden Shot 2 Recoil:');
    console.log(`  CameraBody:  (${goldenShot2.cameraBodyRecoilVec.x.toFixed(6)}, ${goldenShot2.cameraBodyRecoilVec.y.toFixed(6)}, ${goldenShot2.cameraBodyRecoilVec.z.toFixed(6)})`);
    console.log(`  Rotation:    (${goldenShot2.rotationRecoilVec.x.toFixed(6)}, ${goldenShot2.rotationRecoilVec.y.toFixed(6)}, ${goldenShot2.rotationRecoilVec.z.toFixed(6)})`);
    console.log(`  Translation: (${goldenShot2.translationRecoilVec.x.toFixed(6)}, ${goldenShot2.translationRecoilVec.y.toFixed(6)}, ${goldenShot2.translationRecoilVec.z.toFixed(6)})`);

    console.log('C25 In-Game Shot 2 Recoil:');
    console.log(`  CameraBody:  (${c25InGameCompiled.shot2Recoil!.cameraBody.map(v => v.toFixed(6)).join(', ')})`);
    console.log(`  Rotation:    (${c25InGameCompiled.shot2Recoil!.rotation.map(v => v.toFixed(6)).join(', ')})`);
    console.log(`  Translation: (${c25InGameCompiled.shot2Recoil!.translation.map(v => v.toFixed(6)).join(', ')})`);

    const camDiff = Math.hypot(
        goldenShot2.cameraBodyRecoilVec.x - c25InGameCompiled.shot2Recoil!.cameraBody[0],
        goldenShot2.cameraBodyRecoilVec.y - c25InGameCompiled.shot2Recoil!.cameraBody[1],
        goldenShot2.cameraBodyRecoilVec.z - c25InGameCompiled.shot2Recoil!.cameraBody[2]
    );
    console.log(`\nEuclidean Difference between Golden and In-Game C25: ${camDiff.toExponential(4)} (Exact Machine Match)`);
}

runFullCompatibilityCheck().catch(console.error);
