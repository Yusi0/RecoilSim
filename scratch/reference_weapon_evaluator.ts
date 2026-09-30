import fs from 'fs';
import path from 'path';
import { SimulationEngine, Vector3, CFrame, WeaponsParser, WeaponCompiler, PhysicalShotSnapshot } from '../src/core';
import { TargetPlaneProjector } from '../src/montecarlo/TargetPlaneProjector';

const rawFilePath = path.join(__dirname, '../data/raw/weapons.json');
const detailsDir = path.join(__dirname, '../data/raw/weapon-details');

const rawWeaponsData = JSON.parse(fs.readFileSync(rawFilePath, 'utf-8'));
const parser = new WeaponsParser();
const parseResult = parser.parse(rawWeaponsData);
const compiler = new WeaponCompiler();

const files = fs.readdirSync(detailsDir).filter(f => f.endsWith('.json'));

export interface EvalResult {
    id: string;
    name: string;
    rpm: number;
    magsize: number;
    cbXParam: number[];
    cbXRecParam: any;
    rotXParam: number[];
    rotYParam: number[];
    cbPxShots: number[]; // shot 1, 5, 10, 20, 30
    cbTotalRise: number;
    cbMax: number;
    cbMin: number;
    recoveryRatio: number; // how much cb.p.x is retained at shot 2 vs shot 1
    impactYRange: number;
    impactYShots: number[]; // shot 1, 5, 10, 20, 30
    cbMonotonicity: number; // correlation of cb.p.x with shot index
    impactYMonotonicity: number; // correlation of impactY with shot index
    rotXStd: number;
    rotYStd: number;
    separationScore: number;
    group: 'A' | 'B' | 'C';
}

function pearsonCorr(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;
    const mx = x.reduce((a, b) => a + b, 0) / n;
    const my = y.reduce((a, b) => a + b, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - mx;
        const dy = y[i] - my;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
    }
    const den = Math.sqrt(denX * denY);
    return den < 1e-9 ? 0 : num / den;
}

const evaluated: EvalResult[] = [];

for (const file of files) {
    try {
        const detail = JSON.parse(fs.readFileSync(path.join(detailsDir, file), 'utf-8'));
        const r = detail.recoil;
        if (!r) continue;

        // 1. Full auto check
        const fm = detail.firemodes;
        const isAuto = Array.isArray(fm) ? fm.includes(true) || fm.includes('auto') : (fm === true || fm === 'auto');
        if (!isAuto) continue;

        const magsize = detail.magsize || 0;
        if (magsize < 25) continue;

        const rpm = detail.firerate || detail.rpm;
        if (typeof rpm !== 'number' || rpm <= 0) continue;

        // 4. Special modifiers
        if (detail.camerarecoilmult !== undefined || detail.weightrecoilmult !== undefined || detail.disablecamerarecoil !== undefined) continue;

        // 5. Single Layer check
        const countLayers = (obj: any) => {
            if (!obj) return 0;
            return Math.max(...['x', 'y', 'z'].map(ax => obj[ax] ? obj[ax].length : 0));
        };
        const rotL = countLayers(r.aimRotation);
        const transL = countLayers(r.aimTranslation);
        const bodyL = countLayers(r.aimCameraBody);
        const headL = countLayers(r.aimCameraHead);

        if (rotL !== 1 || transL !== 1 || bodyL !== 1) continue;

        // 6. CameraHead is zero or negligible
        let headSum = 0;
        if (r.aimCameraHead) {
            for (const ax of ['x', 'y', 'z']) {
                if (r.aimCameraHead[ax]) {
                    for (const l of r.aimCameraHead[ax]) {
                        headSum += Math.abs(l[2] || 0) + Math.abs(l[3] || 0);
                    }
                }
            }
        }
        if (headSum > 0.01) continue;

        // 7. CameraBody X mean > 0
        const cbX = r.aimCameraBody.x ? r.aimCameraBody.x[0] : [0, 0, 0, 0];
        if (!cbX || cbX[2] <= 0) continue;

        // Compile weapon
        const weaponId = file.replace('.json', '');
        const norm = parseResult.weapons.get(weaponId);
        if (!norm) continue;

        const compiledResult = compiler.compileWeapon(norm, {}, parseResult.attachments, detail);
        const weaponData = compiledResult.compiledWeaponData;

        // Run simulation
        const seed = 2026;
        const engine = new SimulationEngine({
            weaponData,
            seed,
            baseCameraOrientation: CFrame.IDENTITY,
            positionOffset: new Vector3(0, 1.5, 0)
        });

        engine.setStance('stand');
        engine.setDevice('mouse');

        // Enter ADS
        engine.pushAimInput(true, 0.0);
        engine.advanceTo(1.0);

        const interval = 60 / rpm;
        const totalShots = 30;
        const startTime = 1.0;

        for (let i = 0; i < totalShots; i++) {
            engine.pushFireInput(startTime + i * interval);
        }

        const capturedShots: Array<{
            fireCount: number;
            t: number;
            cbPx: number;
            cbVx: number;
            rotPx: number;
            rotPy: number;
            impactY: number;
        }> = [];

        engine.setOnPhysicalShot((shot) => {
            const t = shot.timestamp;
            const camBodySpring = engine.cameraRecoil.cameraBodySprings;
            const rotSpring = engine.firearmRecoil.rotationSprings;

            const cb_p = camBodySpring.getP(t);
            const cb_v = camBodySpring.getV(t);
            const rot_p = rotSpring.getP(t);
            const rot_v = rotSpring.getV(t);

            const proj = TargetPlaneProjector.project(shot.origin, shot.direction, 200);

            capturedShots.push({
                fireCount: shot.fireCount,
                t,
                cbPx: cb_p.x,
                cbVx: cb_v.x,
                rotPx: rot_p.x,
                rotPy: rot_p.y,
                impactY: proj.y
            });
        });

        engine.advanceTo(startTime + totalShots * interval + 0.1);

        if (capturedShots.length < 30) continue;

        const cbPx = capturedShots.map(s => s.cbPx);
        const rotPx = capturedShots.map(s => s.rotPx);
        const rotPy = capturedShots.map(s => s.rotPy);
        const impactsY = capturedShots.map(s => s.impactY);
        const shotIndices = capturedShots.map(s => s.fireCount);

        // Metrics calculation
        const cbMin = Math.min(...cbPx);
        const cbMax = Math.max(...cbPx);
        const cbTotalRise = cbPx[cbPx.length - 1] - cbPx[0];

        // Recovery ratio: CameraBody.p.x at shot 2 vs shot 1
        const retention = cbPx[0] !== 0 ? (cbPx[1] / cbPx[0]) : 1;

        const impactMinY = Math.min(...impactsY);
        const impactMaxY = Math.max(...impactsY);
        const impactYRange = impactMaxY - impactMinY;

        const cbMonotonicity = pearsonCorr(shotIndices, cbPx);
        const impactYMonotonicity = pearsonCorr(shotIndices, impactsY);

        // Weapon rotation variation
        const mRotX = rotPx.reduce((a, b) => a + b, 0) / rotPx.length;
        const mRotY = rotPy.reduce((a, b) => a + b, 0) / rotPy.length;
        const rotXStd = Math.sqrt(rotPx.reduce((a, b) => a + (b - mRotX) ** 2, 0) / rotPx.length);
        const rotYStd = Math.sqrt(rotPy.reduce((a, b) => a + (b - mRotY) ** 2, 0) / rotPy.length);

        // Target indices: shot 1, 5, 10, 20, 30 (0, 4, 9, 19, 29)
        const targetIndices = [0, 4, 9, 19, 29];
        const cbPxShots = targetIndices.map(idx => cbPx[idx] ?? 0);
        const impactYShots = targetIndices.map(idx => impactsY[idx] ?? 0);

        // Separation score: average step between consecutive shots in Y
        let stepSum = 0;
        for (let i = 1; i < impactsY.length; i++) {
            stepSum += Math.abs(impactsY[i] - impactsY[i - 1]);
        }
        const separationScore = stepSum / (impactsY.length - 1);

        let group: 'A' | 'B' | 'C' = 'C';
        // Criteria for Group A:
        // Strong sustained rise across 30 shots:
        // cbTotalRise > 0.08, cbMonotonicity > 0.8, impactYRange > 8
        if (cbTotalRise > 0.08 && cbMonotonicity > 0.8 && impactYRange > 8) {
            group = 'A';
        } else if (cbTotalRise > 0.03 && impactYRange > 4) {
            group = 'B';
        } else {
            group = 'C';
        }

        evaluated.push({
            id: weaponId,
            name: detail.name || detail.displayname || weaponId,
            rpm,
            magsize,
            cbXParam: cbX,
            cbXRecParam: r.aimCameraBodyRecovery ? r.aimCameraBodyRecovery.x : null,
            rotXParam: r.aimRotation.x ? r.aimRotation.x[0] : [],
            rotYParam: r.aimRotation.y ? r.aimRotation.y[0] : [],
            cbPxShots,
            cbTotalRise,
            cbMax,
            cbMin,
            recoveryRatio: retention,
            impactYRange,
            impactYShots,
            cbMonotonicity,
            impactYMonotonicity,
            rotXStd,
            rotYStd,
            separationScore,
            group
        });

    } catch (e) {
        // skip
    }
}

// Sort by cbTotalRise descending
evaluated.sort((a, b) => b.cbTotalRise - a.cbTotalRise);

console.log(`Evaluated ${evaluated.length} single-layer auto weapons.`);
console.log(`Group A (Strong accumulation): ${evaluated.filter(e => e.group === 'A').length}`);
console.log(`Group B (Moderate accumulation): ${evaluated.filter(e => e.group === 'B').length}`);
console.log(`Group C (Quick convergence/clump): ${evaluated.filter(e => e.group === 'C').length}\n`);

console.log('=== ALL EVALUATED WEAPONS (Sorted by cbTotalRise) ===');
for (const e of evaluated) {
    console.log(`[${e.group}] ${e.name} (${e.id}) RPM:${e.rpm} cbRise:${e.cbTotalRise.toFixed(4)} cbMono:${e.cbMonotonicity.toFixed(2)} impYRange:${e.impactYRange.toFixed(2)} impYMono:${e.impactYMonotonicity.toFixed(2)} cbShots:[${e.cbPxShots.map(v => v.toFixed(3)).join(', ')}] rotXStd:${e.rotXStd.toFixed(3)} rotYStd:${e.rotYStd.toFixed(3)}`);
}
