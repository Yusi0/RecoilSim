import fs from 'fs';
import path from 'path';
import { SimulationEngine, Vector3, CFrame, WeaponsParser, WeaponCompiler } from '../src/core';

function angleBetween(v1: Vector3, v2: Vector3): number {
    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const mag1 = v1.magnitude;
    const mag2 = v2.magnitude;
    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.acos(cosAngle) * (180 / Math.PI);
}

interface CaseShotResult {
    shotIndex: number;
    timestamp: number;
    direction: Vector3;
    cameraBodyRecoilVec: Vector3;
    rotationRecoilVec: Vector3;
    spreadRecoilVec: Vector3;
    directionDelta: Vector3 | null;
    angleBetweenDirections: number | null;
    deltaX: number | null;
    deltaY: number | null;
    deltaDistance: number | null;
    angleFromX: number | null;
}

describe('C25 Recoil Component Decomposition Diagnostic', () => {
    test('Execute CASE A, B, C, D and compare angular differences', () => {
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

        // Run full SimulationEngine
        const engine = new SimulationEngine({
            weaponData: compiledC25Data,
            seed: 2026,
            baseCameraOrientation: CFrame.IDENTITY
        });

        engine.pushAimInput(true, 0.0);
        engine.advanceTo(0.3);

        const interval = 60 / 800; // 0.075s
        for (let i = 0; i < 10; i++) {
            engine.pushFireInput(0.3 + i * interval);
        }

        engine.advanceTo(1.1);

        const shots = engine.physicalShots;
        expect(shots.length).toBe(10);

        // Compute directions for Case A, B, C, D
        const caseA: CaseShotResult[] = [];
        const caseB: CaseShotResult[] = [];
        const caseC: CaseShotResult[] = [];
        const caseD: CaseShotResult[] = [];

        for (let i = 0; i < shots.length; i++) {
            const shot = shots[i];
            const timestamp = shot.timestamp;
            const shotIndex = i + 1;

            // CASE A: FULL
            const dirA = shot.direction;

            // CASE B: NO SPREAD (CameraBody ON, WeaponRotation ON, Spread OFF)
            const shakeB = CFrame.fromAxisAngle(shot.cameraBodyRecoilVec);
            const mainC0_B = shakeB
                .mul(CFrame.newPos(shot.translationRecoilVec))
                .mul(CFrame.fromAxisAngle(shot.rotationRecoilVec));
            const v474_B = mainC0_B;
            const dirB = v474_B.zVector.neg();

            // CASE C: CAMERA BODY ONLY (CameraBody ON, WeaponRotation OFF, Spread OFF)
            const shakeC = CFrame.fromAxisAngle(shot.cameraBodyRecoilVec);
            const mainC0_C = shakeC;
            const v474_C = mainC0_C;
            const dirC = v474_C.zVector.neg();

            // CASE D: ROTATION ONLY (CameraBody OFF, WeaponRotation ON, Spread OFF)
            const shakeD = CFrame.IDENTITY;
            const mainC0_D = shakeD
                .mul(CFrame.newPos(shot.translationRecoilVec))
                .mul(CFrame.fromAxisAngle(shot.rotationRecoilVec));
            const v474_D = mainC0_D;
            const dirD = v474_D.zVector.neg();

            const processShotCase = (
                list: CaseShotResult[],
                dir: Vector3
            ) => {
                const prev = list.length > 0 ? list[list.length - 1].direction : null;
                let directionDelta: Vector3 | null = null;
                let angleBetweenDirections: number | null = null;
                let deltaX: number | null = null;
                let deltaY: number | null = null;
                let deltaDistance: number | null = null;
                let angleFromX: number | null = null;

                if (prev) {
                    directionDelta = dir.sub(prev);
                    angleBetweenDirections = angleBetween(dir, prev);
                    deltaX = dir.x - prev.x;
                    deltaY = dir.y - prev.y;
                    deltaDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                    angleFromX = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
                }

                list.push({
                    shotIndex,
                    timestamp,
                    direction: dir,
                    cameraBodyRecoilVec: shot.cameraBodyRecoilVec,
                    rotationRecoilVec: shot.rotationRecoilVec,
                    spreadRecoilVec: shot.spreadSpringVec,
                    directionDelta,
                    angleBetweenDirections,
                    deltaX,
                    deltaY,
                    deltaDistance,
                    angleFromX
                });
            };

            processShotCase(caseA, dirA);
            processShotCase(caseB, dirB);
            processShotCase(caseC, dirC);
            processShotCase(caseD, dirD);
        }

        // Print case results and angular comparisons
        console.log('\n==================================================');
        console.log('C25 RECOIL COMPONENT DECOMPOSITION DIAGNOSTIC');
        console.log('==================================================\n');

        const printCaseDetails = (name: string, list: CaseShotResult[]) => {
            console.log(`=== ${name} ===`);
            for (const s of list) {
                console.log(`Shot #${s.shotIndex} @ ${s.timestamp.toFixed(3)}s`);
                console.log(`  direction: (${s.direction.x.toFixed(6)}, ${s.direction.y.toFixed(6)}, ${s.direction.z.toFixed(6)})`);
                console.log(`  cameraBodyRecoilVec: (${s.cameraBodyRecoilVec.x.toFixed(6)}, ${s.cameraBodyRecoilVec.y.toFixed(6)}, ${s.cameraBodyRecoilVec.z.toFixed(6)})`);
                console.log(`  rotationRecoilVec: (${s.rotationRecoilVec.x.toFixed(6)}, ${s.rotationRecoilVec.y.toFixed(6)}, ${s.rotationRecoilVec.z.toFixed(6)})`);
                console.log(`  spreadRecoilVec: (${s.spreadRecoilVec.x.toFixed(6)}, ${s.spreadRecoilVec.y.toFixed(6)}, ${s.spreadRecoilVec.z.toFixed(6)})`);
                if (s.directionDelta) {
                    console.log(`  directionDelta: (${s.directionDelta.x.toFixed(6)}, ${s.directionDelta.y.toFixed(6)}, ${s.directionDelta.z.toFixed(6)})`);
                    console.log(`  deltaX: ${s.deltaX?.toFixed(6)}, deltaY: ${s.deltaY?.toFixed(6)}, deltaDistance: ${s.deltaDistance?.toFixed(6)}`);
                    console.log(`  angleBetweenDirections: ${s.angleBetweenDirections?.toFixed(4)}°`);
                    console.log(`  angleFromX: ${s.angleFromX?.toFixed(2)}°`);
                } else {
                    console.log(`  previous: null, delta: null, angleFromX: null`);
                }
            }
            console.log('');
        };

        printCaseDetails('CASE A — FULL', caseA);
        printCaseDetails('CASE B — NO SPREAD', caseB);
        printCaseDetails('CASE C — CAMERA BODY ONLY', caseC);
        printCaseDetails('CASE D — ROTATION ONLY', caseD);

        console.log('==================================================');
        console.log('ANGULAR DIFFERENCE COMPARISONS (in degrees)');
        console.log('==================================================');

        const comparisonSummary: any[] = [];

        for (let i = 0; i < 10; i++) {
            const shotIndex = i + 1;
            const dirA = caseA[i].direction;
            const dirB = caseB[i].direction;
            const dirC = caseC[i].direction;
            const dirD = caseD[i].direction;

            const diffA_B = angleBetween(dirA, dirB);
            const diffA_C = angleBetween(dirA, dirC);
            const diffA_D = angleBetween(dirA, dirD);
            const diffB_C = angleBetween(dirB, dirC);
            const diffB_D = angleBetween(dirB, dirD);

            const row = {
                shotIndex,
                timestamp: caseA[i].timestamp,
                full_vs_noSpread: Number(diffA_B.toFixed(4)),
                full_vs_cameraBodyOnly: Number(diffA_C.toFixed(4)),
                full_vs_rotationOnly: Number(diffA_D.toFixed(4)),
                noSpread_vs_cameraBodyOnly: Number(diffB_C.toFixed(4)),
                noSpread_vs_rotationOnly: Number(diffB_D.toFixed(4))
            };
            comparisonSummary.push(row);

            console.log(`Shot #${shotIndex} @ ${caseA[i].timestamp.toFixed(3)}s:`);
            console.log(`  FULL vs NO_SPREAD         : ${row.full_vs_noSpread}°`);
            console.log(`  FULL vs CAMERA_BODY_ONLY  : ${row.full_vs_cameraBodyOnly}°`);
            console.log(`  FULL vs ROTATION_ONLY     : ${row.full_vs_rotationOnly}°`);
            console.log(`  NO_SPREAD vs CAMERA_BODY  : ${row.noSpread_vs_cameraBodyOnly}°`);
            console.log(`  NO_SPREAD vs ROTATION     : ${row.noSpread_vs_rotationOnly}°`);
        }

        console.log('\n=== ANGULAR DIFFERENCES JSON ===');
        console.log(JSON.stringify(comparisonSummary, null, 2));
    });
});
