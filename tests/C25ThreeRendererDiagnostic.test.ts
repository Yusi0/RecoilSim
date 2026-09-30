import fs from 'fs';
import path from 'path';
import { SimulationEngine, Vector3, CFrame, WeaponsParser, WeaponCompiler, PhysicalShotSnapshot } from '../src/core';

describe('C25 Three.js Renderer Diagnostic Verification', () => {
    test('Verify PhysicalShotSnapshot to Three.js transformation and projection', () => {
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

        // Run full SimulationEngine (C25 / ADS / Stand / Mouse / seed 2026 / 10-shot)
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

        const targetDistance = 50; // default 50m
        const targetZ = -targetDistance;

        // Three.js Camera specification matching FPSCanvas (ADS FOV 48, aspect 16/9, viewport 1920x1080)
        const width = 1920;
        const height = 1080;
        const aspect = width / height;
        const fovRad = (48 * Math.PI) / 180;
        const camPos = { x: 0, y: 1.5, z: 0 }; // FPSCanvas camera position

        console.log('\n==================================================');
        console.log('1. CORE RESULTS (SimulationEngine PhysicalShotSnapshot)');
        console.log('==================================================\n');

        const diagnosticRows: any[] = [];

        for (let i = 0; i < shots.length; i++) {
            const shot = shots[i];
            const origin = shot.origin;
            const dir = shot.direction;
            const zVec = shot.v474.zVector;
            const body = shot.cameraBodyRecoilVec;
            const rot = shot.rotationRecoilVec;
            const trans = shot.translationRecoilVec;
            const spread = shot.spreadSpringVec;

            // 2. Three.js Input: How FPSCanvas lines 370-377 computes endpoint & passes to Three.js
            const distToTarget = Math.abs((targetZ - origin.z) / (dir.z === 0 ? -1 : dir.z));
            const endPointX = origin.x + dir.x * distToTarget;
            const endPointY = origin.y + dir.y * distToTarget;
            const endPointZ = targetZ;

            // Reconstruct rendered direction vector in Three.js space from origin to impact point
            const rDirX = endPointX - origin.x;
            const rDirY = endPointY - origin.y;
            const rDirZ = endPointZ - origin.z;
            const rMag = Math.sqrt(rDirX * rDirX + rDirY * rDirY + rDirZ * rDirZ);
            const renderedDir = {
                x: rDirX / rMag,
                y: rDirY / rMag,
                z: rDirZ / rMag
            };

            // Angular difference between CORE direction and RENDERED direction in Three.js
            const dot = dir.x * renderedDir.x + dir.y * renderedDir.y + dir.z * renderedDir.z;
            const angleDiffDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);

            // 5. Screen coordinates projection
            // Depth along camera forward (-Z)
            const depth = targetDistance; // 50m
            const halfH = depth * Math.tan(fovRad / 2);
            const halfW = halfH * aspect;

            // CORE direction projected on target plane relative to camera view center (0, 1.5, -50)
            const coreWorldX = camPos.x + dir.x * distToTarget;
            const coreWorldY = camPos.y + dir.y * distToTarget;
            const coreDeltaScreenX = ((coreWorldX - camPos.x) / halfW) * (width / 2);
            const coreDeltaScreenY = ((coreWorldY - camPos.y) / halfH) * (height / 2); // +Y = UP
            const coreAngleFromX = Math.atan2(coreDeltaScreenY, coreDeltaScreenX) * (180 / Math.PI);
            const coreAngleFromUp = 90 - coreAngleFromX;

            // Rendered impact position in FPSCanvas
            // Note: In FPSCanvas, mesh.position.set(endPointX, endPointY, targetZ)
            const renderDeltaScreenX = ((endPointX - camPos.x) / halfW) * (width / 2);
            const renderDeltaScreenY = ((endPointY - camPos.y) / halfH) * (height / 2); // +Y = UP
            const renderAngleFromX = Math.atan2(renderDeltaScreenY, renderDeltaScreenX) * (180 / Math.PI);
            const renderAngleFromUp = 90 - renderAngleFromX;

            const row = {
                shotIndex: i + 1,
                timestamp: Number(shot.timestamp.toFixed(4)),
                core: {
                    origin: { x: origin.x, y: origin.y, z: origin.z },
                    direction: { x: dir.x, y: dir.y, z: dir.z },
                    v474ZVector: { x: zVec.x, y: zVec.y, z: zVec.z },
                    cameraBodyRecoilVec: { x: body.x, y: body.y, z: body.z },
                    rotationRecoilVec: { x: rot.x, y: rot.y, z: rot.z },
                    translationRecoilVec: { x: trans.x, y: trans.y, z: trans.z },
                    spreadRecoilVec: { x: spread.x, y: spread.y, z: spread.z }
                },
                threeInput: {
                    direction: { x: dir.x, y: dir.y, z: dir.z },
                    renderedDirection: { x: renderedDir.x, y: renderedDir.y, z: renderedDir.z },
                    impactPosition: { x: endPointX, y: endPointY, z: endPointZ },
                    distToTarget: Number(distToTarget.toFixed(4))
                },
                comparison: {
                    angularDifferenceDeg: Number(angleDiffDeg.toFixed(6)),
                    sameDirection: angleDiffDeg < 1e-4
                },
                screenProjection: {
                    coreDirectionRay: {
                        deltaX_px: Number(coreDeltaScreenX.toFixed(2)),
                        deltaY_px: Number(coreDeltaScreenY.toFixed(2)),
                        angleFromX: Number(coreAngleFromX.toFixed(2)),
                        angleFromUp: Number(coreAngleFromUp.toFixed(2))
                    },
                    renderedMesh: {
                        deltaX_px: Number(renderDeltaScreenX.toFixed(2)),
                        deltaY_px: Number(renderDeltaScreenY.toFixed(2)),
                        angleFromX: Number(renderAngleFromX.toFixed(2)),
                        angleFromUp: Number(renderAngleFromUp.toFixed(2))
                    }
                }
            };

            diagnosticRows.push(row);

            console.log(`Shot #${i + 1} @ ${shot.timestamp.toFixed(3)}s`);
            console.log(`  CORE direction:   (${dir.x.toFixed(6)}, ${dir.y.toFixed(6)}, ${dir.z.toFixed(6)})`);
            console.log(`  v474.zVector:     (${zVec.x.toFixed(6)}, ${zVec.y.toFixed(6)}, ${zVec.z.toFixed(6)})`);
            console.log(`  THREE renderedDir:(${renderedDir.x.toFixed(6)}, ${renderedDir.y.toFixed(6)}, ${renderedDir.z.toFixed(6)})`);
            console.log(`  THREE impactPos:  (${endPointX.toFixed(4)}, ${endPointY.toFixed(4)}, ${endPointZ.toFixed(4)})`);
            console.log(`  Angular Diff:     ${angleDiffDeg.toFixed(6)}° (Identical: ${angleDiffDeg < 1e-4})`);
            console.log(`  CORE Screen:      (${coreDeltaScreenX.toFixed(1)}px, ${coreDeltaScreenY.toFixed(1)}px), angle: ${coreAngleFromX.toFixed(1)}°`);
            console.log(`  RENDER Screen:    (${renderDeltaScreenX.toFixed(1)}px, ${renderDeltaScreenY.toFixed(1)}px), angle: ${renderAngleFromX.toFixed(1)}°`);
            console.log('');
        }

        console.log('==================================================');
        console.log('SUMMARY JSON');
        console.log('==================================================');
        console.log(JSON.stringify(diagnosticRows, null, 2));
    });
});
