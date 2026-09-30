import fs from 'fs';
import path from 'path';
import { SimulationEngine, Vector3, CFrame, WeaponsParser, WeaponCompiler } from '../src/core';
import { TargetPlaneProjector } from '../src/montecarlo/TargetPlaneProjector';

const rawFilePath = path.join(__dirname, '../data/raw/weapons.json');
const rawDetailPath = path.join(__dirname, '../data/raw/weapon-details/c25.json');

const rawWeaponsData = JSON.parse(fs.readFileSync(rawFilePath, 'utf-8'));
const parser = new WeaponsParser();
const parseResult = parser.parse(rawWeaponsData);

const c25Normalized = parseResult.weapons.get('c25')!;
const attachmentMap = parseResult.attachments;
const c25DetailOriginal = JSON.parse(fs.readFileSync(rawDetailPath, 'utf-8'));

const compiler = new WeaponCompiler();

// Helper to deep clone weapon detail JSON and modify recoil
function createModifiedDetail(modifierFn: (recoil: any) => void) {
    const detail = JSON.parse(JSON.stringify(c25DetailOriginal));
    if (detail.recoil) {
        modifierFn(detail.recoil);
    }
    return detail;
}

// 5 conditions:
// 1. Normal (Baseline)
// 2. CameraBody ALL OFF
// 3. CameraBody X OFF
// 4. CameraBody Y OFF
// 5. CameraBody Z OFF

const conditions = [
    {
        name: 'Normal (Baseline)',
        detail: c25DetailOriginal
    },
    {
        name: 'CameraBody ALL OFF',
        detail: createModifiedDetail(r => {
            r.aimCameraBody = { x: [], y: [], z: [] };
            r.hipCameraBody = { x: [], y: [], z: [] };
        })
    },
    {
        name: 'CameraBody X OFF',
        detail: createModifiedDetail(r => {
            if (r.aimCameraBody) r.aimCameraBody.x = [];
            if (r.hipCameraBody) r.hipCameraBody.x = [];
        })
    },
    {
        name: 'CameraBody Y OFF',
        detail: createModifiedDetail(r => {
            if (r.aimCameraBody) r.aimCameraBody.y = [];
            if (r.hipCameraBody) r.hipCameraBody.y = [];
        })
    },
    {
        name: 'CameraBody Z OFF',
        detail: createModifiedDetail(r => {
            if (r.aimCameraBody) r.aimCameraBody.z = [];
            if (r.hipCameraBody) r.hipCameraBody.z = [];
        })
    }
];

const seed = 2026;
const totalShots = 30;
const targetDistance = 200; // Z = -200

interface ShotData {
    fireCount: number;
    t: number;
    impactX: number;
    impactY: number;
    poseForwardX: number;
    poseForwardY: number;
    poseForwardZ: number;
    rotPx: number;
    rotPy: number;
    rotPz: number;
    cbPx: number;
    cbPy: number;
    cbPz: number;
}

const allResults: Record<string, ShotData[]> = {};

for (const cond of conditions) {
    const compileResult = compiler.compileWeapon(c25Normalized, {}, attachmentMap, cond.detail);
    const compiledData = compileResult.compiledWeaponData;

    const engine = new SimulationEngine({
        weaponData: compiledData,
        seed,
        baseCameraOrientation: CFrame.IDENTITY,
        positionOffset: new Vector3(0, 1.5, 0)
    });

    engine.setStance('stand');
    engine.setDevice('mouse');

    // Enter 100% ADS
    engine.pushAimInput(true, 0.0);
    engine.advanceTo(1.0);

    const interval = 60 / compiledData.firerate; // 0.075s
    const startTime = 1.0;

    for (let i = 0; i < totalShots; i++) {
        engine.pushFireInput(startTime + i * interval);
    }

    const shots: ShotData[] = [];

    engine.setOnPhysicalShot((shot) => {
        const t = shot.timestamp;
        const pose = engine.getWeaponPose(t);

        const rotSpring = engine.firearmRecoil.rotationSprings;
        const camBodySpring = engine.cameraRecoil.cameraBodySprings;

        const rot_p = rotSpring.getP(t);
        const cb_p = camBodySpring.getP(t);

        const proj = TargetPlaneProjector.project(shot.origin, shot.direction, targetDistance);

        shots.push({
            fireCount: shot.fireCount,
            t: t - startTime,
            impactX: proj.x,
            impactY: proj.y,
            poseForwardX: pose.forward.x,
            poseForwardY: pose.forward.y,
            poseForwardZ: pose.forward.z,
            rotPx: rot_p.x,
            rotPy: rot_p.y,
            rotPz: rot_p.z,
            cbPx: cb_p.x,
            cbPy: cb_p.y,
            cbPz: cb_p.z
        });
    });

    engine.advanceTo(startTime + totalShots * interval + 0.1);
    allResults[cond.name] = shots;
}

// Print comparison report
console.log('====================================================================================================');
console.log('C25 LATERAL ZIGZAG DIAGNOSTIC REPORT (30 SHOTS, SEED=2026, TARGET Z=-200)');
console.log('====================================================================================================\n');

// 1. Table of Impact X (Lateral trajectory) across all 5 conditions
console.log('--- 1. PHYSICAL SHOT IMPACT X (LATERAL TRAJECTORY in studs at Z=-200) ---');
let headerStr = 'Shot | ' + conditions.map(c => c.name.padEnd(20)).join(' | ');
console.log(headerStr);
console.log('-'.repeat(headerStr.length));

for (let i = 0; i < totalShots; i++) {
    let row = `#${(i + 1).toString().padStart(2)}  | `;
    row += conditions.map(c => {
        const val = allResults[c.name][i]?.impactX ?? 0;
        return (val >= 0 ? '+' : '') + val.toFixed(4).padEnd(19);
    }).join(' | ');
    console.log(row);
}

console.log('\n--- 2. PHYSICAL SHOT IMPACT Y (VERTICAL TRAJECTORY in studs at Z=-200) ---');
headerStr = 'Shot | ' + conditions.map(c => c.name.padEnd(20)).join(' | ');
console.log(headerStr);
console.log('-'.repeat(headerStr.length));

for (let i = 0; i < totalShots; i++) {
    let row = `#${(i + 1).toString().padStart(2)}  | `;
    row += conditions.map(c => {
        const val = allResults[c.name][i]?.impactY ?? 0;
        return (val >= 0 ? '+' : '') + val.toFixed(4).padEnd(19);
    }).join(' | ');
    console.log(row);
}

console.log('\n--- 3. WEAPON POSE FORWARD X (LATERAL DIRECTION) ---');
headerStr = 'Shot | ' + conditions.map(c => c.name.padEnd(20)).join(' | ');
console.log(headerStr);
console.log('-'.repeat(headerStr.length));

for (let i = 0; i < totalShots; i++) {
    let row = `#${(i + 1).toString().padStart(2)}  | `;
    row += conditions.map(c => {
        const val = allResults[c.name][i]?.poseForwardX ?? 0;
        return (val >= 0 ? '+' : '') + val.toFixed(6).padEnd(19);
    }).join(' | ');
    console.log(row);
}

console.log('\n--- 4. LATERAL ZIGZAG (DELTA X between consecutive shots) COMPARISON ---');
headerStr = 'Shot | ' + conditions.map(c => (c.name + ' ΔX').padEnd(20)).join(' | ');
console.log(headerStr);
console.log('-'.repeat(headerStr.length));

for (let i = 1; i < totalShots; i++) {
    let row = `#${(i + 1).toString().padStart(2)}  | `;
    row += conditions.map(c => {
        const cur = allResults[c.name][i]?.impactX ?? 0;
        const prev = allResults[c.name][i - 1]?.impactX ?? 0;
        const dx = cur - prev;
        return (dx >= 0 ? '+' : '') + dx.toFixed(4).padEnd(19);
    }).join(' | ');
    console.log(row);
}

// Statistical Summary
console.log('\n====================================================================================================');
console.log('SUMMARY OF LATERAL DISTRIBUTIONS & ZIGZAG METRICS');
console.log('====================================================================================================');
for (const cond of conditions) {
    const shots = allResults[cond.name];
    const xs = shots.map(s => s.impactX);
    const ys = shots.map(s => s.impactY);

    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const stdX = Math.sqrt(xs.reduce((a, b) => a + (b - meanX) ** 2, 0) / xs.length);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const rangeX = maxX - minX;

    // Total absolute lateral step distance (sum of |dx|)
    let totalAbsDx = 0;
    let directionChanges = 0;
    for (let i = 1; i < xs.length; i++) {
        const dx = xs[i] - xs[i - 1];
        totalAbsDx += Math.abs(dx);
        if (i > 1) {
            const prevDx = xs[i - 1] - xs[i - 2];
            if ((dx > 0 && prevDx < 0) || (dx < 0 && prevDx > 0)) {
                directionChanges++;
            }
        }
    }

    console.log(`Condition: [${cond.name}]`);
    console.log(`  Impact X Mean: ${meanX.toFixed(4)} | Std: ${stdX.toFixed(4)} | Range: [${minX.toFixed(4)}, ${maxX.toFixed(4)}] (Total Width: ${rangeX.toFixed(4)})`);
    console.log(`  Total Lateral Travel (Sum |ΔX|): ${totalAbsDx.toFixed(4)} studs | Direction Reversals (Zigzags): ${directionChanges} times`);
    console.log(`  Impact Y Mean: ${(ys.reduce((a,b)=>a+b,0)/ys.length).toFixed(4)} | Range: [${Math.min(...ys).toFixed(4)}, ${Math.max(...ys).toFixed(4)}]\n`);
}
