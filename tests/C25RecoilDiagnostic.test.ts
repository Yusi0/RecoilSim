import fs from 'fs';
import path from 'path';
import { SimulationEngine, Vector3, CFrame, WeaponsParser, WeaponCompiler } from '../src/core';

function wrapTo180(deg: number): number {
    let d = deg % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
}

describe('C25 Recoil PhysicalShotSnapshot Diagnostic', () => {
    test('Generate C25 10-Shot Diagnostic Log', () => {
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

        const engine = new SimulationEngine({
            weaponData: compiledC25Data,
            seed: 2026,
            baseCameraOrientation: CFrame.IDENTITY
        });

        // Set Aiming mode for C25 (ADS / Stand / Mouse / seed 2026)
        engine.pushAimInput(true, 0.0);
        engine.advanceTo(0.3);

        // Fire 10 rounds at 800 RPM (0.075s interval)
        const interval = 60 / 800; // 0.075s
        for (let i = 0; i < 10; i++) {
            const fireTime = 0.3 + i * interval;
            engine.pushFireInput(fireTime);
        }

        engine.advanceTo(1.1);

        const shots = engine.physicalShots;
        expect(shots.length).toBe(10);

        const diagnosticResults: any[] = [];

        console.log('\n=== C25 RECOIL DIAGNOSTIC ===\n');

        for (let i = 0; i < shots.length; i++) {
            const shot = shots[i];
            const shotIndex = i + 1;
            const timestamp = Number(shot.timestamp.toFixed(4));

            const origin = {
                x: Number(shot.origin.x.toFixed(6)),
                y: Number(shot.origin.y.toFixed(6)),
                z: Number(shot.origin.z.toFixed(6))
            };

            const direction = {
                x: Number(shot.direction.x.toFixed(6)),
                y: Number(shot.direction.y.toFixed(6)),
                z: Number(shot.direction.z.toFixed(6))
            };

            const zVec = shot.v474.zVector;
            const v474ZVector = {
                x: Number(zVec.x.toFixed(6)),
                y: Number(zVec.y.toFixed(6)),
                z: Number(zVec.z.toFixed(6))
            };

            const cameraBodyRecoilVec = {
                x: Number(shot.cameraBodyRecoilVec.x.toFixed(6)),
                y: Number(shot.cameraBodyRecoilVec.y.toFixed(6)),
                z: Number(shot.cameraBodyRecoilVec.z.toFixed(6))
            };

            const rotationRecoilVec = {
                x: Number(shot.rotationRecoilVec.x.toFixed(6)),
                y: Number(shot.rotationRecoilVec.y.toFixed(6)),
                z: Number(shot.rotationRecoilVec.z.toFixed(6))
            };

            const translationRecoilVec = {
                x: Number(shot.translationRecoilVec.x.toFixed(6)),
                y: Number(shot.translationRecoilVec.y.toFixed(6)),
                z: Number(shot.translationRecoilVec.z.toFixed(6))
            };

            const spreadRecoilVec = {
                x: Number(shot.spreadSpringVec.x.toFixed(6)),
                y: Number(shot.spreadSpringVec.y.toFixed(6)),
                z: Number(shot.spreadSpringVec.z.toFixed(6))
            };

            let previousDirection: any = null;
            let directionDelta: any = null;
            let angleBetweenDirections: number | null = null;
            let deltaX: number | null = null;
            let deltaY: number | null = null;
            let deltaDistance: number | null = null;
            let angleFromX: number | null = null;
            let deviationFromUp: number | null = null;
            let deviationFromUpRightPositive: number | null = null;

            if (i > 0) {
                const prevShot = shots[i - 1];
                previousDirection = {
                    x: Number(prevShot.direction.x.toFixed(6)),
                    y: Number(prevShot.direction.y.toFixed(6)),
                    z: Number(prevShot.direction.z.toFixed(6))
                };

                const deltaVec = shot.direction.sub(prevShot.direction);
                directionDelta = {
                    x: Number(deltaVec.x.toFixed(6)),
                    y: Number(deltaVec.y.toFixed(6)),
                    z: Number(deltaVec.z.toFixed(6))
                };

                const dot = prevShot.direction.x * shot.direction.x +
                            prevShot.direction.y * shot.direction.y +
                            prevShot.direction.z * shot.direction.z;
                const magPrev = prevShot.direction.magnitude;
                const magCur = shot.direction.magnitude;
                const cosAngle = Math.max(-1, Math.min(1, dot / (magPrev * magCur)));
                angleBetweenDirections = Number((Math.acos(cosAngle) * (180 / Math.PI)).toFixed(4));

                deltaX = Number((shot.direction.x - prevShot.direction.x).toFixed(6));
                deltaY = Number((shot.direction.y - prevShot.direction.y).toFixed(6));
                deltaDistance = Number(Math.sqrt(deltaX * deltaX + deltaY * deltaY).toFixed(6));

                const rad = Math.atan2(deltaY, deltaX);
                angleFromX = Number((rad * (180 / Math.PI)).toFixed(2));
                // deviationFromUp = wrapTo180(angleFromX - 90)
                deviationFromUp = Number(wrapTo180(angleFromX - 90).toFixed(2));
                // Right positive: 90 - angleFromX
                deviationFromUpRightPositive = Number(wrapTo180(90 - angleFromX).toFixed(2));
            }

            const item = {
                shotIndex,
                timestamp,
                origin,
                direction,
                v474ZVector,
                cameraBodyRecoilVec,
                rotationRecoilVec,
                translationRecoilVec,
                spreadRecoilVec,
                previousDirection,
                directionDelta,
                angleBetweenDirections,
                deltaX,
                deltaY,
                deltaDistance,
                angleFromX,
                deviationFromUp,
                deviationFromUpRightPositive
            };

            diagnosticResults.push(item);

            console.log(`Shot #${shotIndex} @ ${timestamp.toFixed(3)}s`);
            console.log(`  origin: (${origin.x}, ${origin.y}, ${origin.z})`);
            console.log(`  direction: (${direction.x}, ${direction.y}, ${direction.z})`);
            console.log(`  v474.zVector: (${v474ZVector.x}, ${v474ZVector.y}, ${v474ZVector.z})`);
            console.log(`  cameraBodyRecoilVec: (${cameraBodyRecoilVec.x}, ${cameraBodyRecoilVec.y}, ${cameraBodyRecoilVec.z})`);
            console.log(`  rotationRecoilVec: (${rotationRecoilVec.x}, ${rotationRecoilVec.y}, ${rotationRecoilVec.z})`);
            console.log(`  translationRecoilVec: (${translationRecoilVec.x}, ${translationRecoilVec.y}, ${translationRecoilVec.z})`);
            console.log(`  spreadRecoilVec: (${spreadRecoilVec.x}, ${spreadRecoilVec.y}, ${spreadRecoilVec.z})`);
            if (i === 0) {
                console.log(`  previousDirection: null`);
                console.log(`  directionDelta: null`);
                console.log(`  angleBetweenDirections: null`);
                console.log(`  deltaX: null, deltaY: null, deltaDistance: null`);
                console.log(`  angleFromX: null`);
                console.log(`  deviationFromUp: null`);
            } else {
                console.log(`  previousDirection: (${previousDirection.x}, ${previousDirection.y}, ${previousDirection.z})`);
                console.log(`  directionDelta: (${directionDelta.x}, ${directionDelta.y}, ${directionDelta.z})`);
                console.log(`  deltaX: ${deltaX}, deltaY: ${deltaY}, deltaDistance: ${deltaDistance}`);
                console.log(`  angleBetweenDirections: ${angleBetweenDirections}°`);
                console.log(`  angleFromX: ${angleFromX}°`);
                console.log(`  deviationFromUp: ${deviationFromUp}° (Formula: angleFromX - 90)`);
                const rightPosStr = deviationFromUpRightPositive !== null && deviationFromUpRightPositive > 0 ? '+' : '';
                console.log(`  (right-positive relative to Up: ${rightPosStr}${deviationFromUpRightPositive}° right)`);
            }
            console.log('');
        }

        console.log('=== JSON OUTPUT ===');
        console.log(JSON.stringify(diagnosticResults, null, 2));
    });
});
