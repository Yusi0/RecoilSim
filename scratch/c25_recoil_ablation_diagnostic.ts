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

function createDetail(modFn: (r: any, d: any) => void) {
    const detail = JSON.parse(JSON.stringify(c25DetailOriginal));
    if (detail.recoil) {
        modFn(detail.recoil, detail);
    }
    return detail;
}

const emptyAxis = { x: [], y: [], z: [] };

// Ablation Configurations
const ablationConfigs = [
    {
        name: 'CameraBody Y ONLY',
        detail: createDetail((r, d) => {
            r.aimCameraBody = { x: [], y: r.aimCameraBody.y, z: [] };
            r.hipCameraBody = { x: [], y: r.hipCameraBody.y, z: [] };
            r.aimCameraHead = emptyAxis;
            r.hipCameraHead = emptyAxis;
            r.aimRotation = emptyAxis;
            r.hipRotation = emptyAxis;
            r.aimTranslation = emptyAxis;
            r.hipTranslation = emptyAxis;
            d.hipfirespread = 0;
        })
    },
    {
        name: 'CameraBody ALL ONLY',
        detail: createDetail((r, d) => {
            r.aimCameraHead = emptyAxis;
            r.hipCameraHead = emptyAxis;
            r.aimRotation = emptyAxis;
            r.hipRotation = emptyAxis;
            r.aimTranslation = emptyAxis;
            r.hipTranslation = emptyAxis;
            d.hipfirespread = 0;
        })
    },
    {
        name: 'Weapon Rotation ONLY',
        detail: createDetail((r, d) => {
            r.aimCameraBody = emptyAxis;
            r.hipCameraBody = emptyAxis;
            r.aimCameraHead = emptyAxis;
            r.hipCameraHead = emptyAxis;
            r.aimTranslation = emptyAxis;
            r.hipTranslation = emptyAxis;
            d.hipfirespread = 0;
        })
    },
    {
        name: 'Weapon Translation ONLY',
        detail: createDetail((r, d) => {
            r.aimCameraBody = emptyAxis;
            r.hipCameraBody = emptyAxis;
            r.aimCameraHead = emptyAxis;
            r.hipCameraHead = emptyAxis;
            r.aimRotation = emptyAxis;
            r.hipRotation = emptyAxis;
            d.hipfirespread = 0;
        })
    },
    {
        name: 'Baseline (Full Recoil)',
        detail: c25DetailOriginal
    }
];

const seed = 2026;
const totalShots = 30;
const targetDistance = 200; // Z = -200 studs

interface ShotRecord {
    shotNum: number;
    t: number;
    cbPy: number;
    cbVy: number;
    impulseY: number;
    impactX: number;
    impactY: number;
}

const results: Record<string, ShotRecord[]> = {};

for (const cfg of ablationConfigs) {
    const compiled = compiler.compileWeapon(c25Normalized, {}, attachmentMap, cfg.detail).compiledWeaponData;

    const engine = new SimulationEngine({
        weaponData: compiled,
        seed,
        baseCameraOrientation: CFrame.IDENTITY,
        positionOffset: new Vector3(0, 1.5, 0)
    });

    engine.setStance('stand');
    engine.setDevice('mouse');

    // 100% ADS
    engine.pushAimInput(true, 0.0);
    engine.advanceTo(1.0);

    const interval = 60 / compiled.firerate;
    const startTime = 1.0;

    for (let i = 0; i < totalShots; i++) {
        engine.pushFireInput(startTime + i * interval);
    }

    const shots: ShotRecord[] = [];

    engine.setOnPhysicalShot((shot) => {
        const t = shot.timestamp;
        const cbSprings = engine.cameraRecoil.cameraBodySprings;
        const cbP = cbSprings.getP(t);
        const cbV = cbSprings.getV(t);

        const proj = TargetPlaneProjector.project(shot.origin, shot.direction, targetDistance);

        shots.push({
            shotNum: shot.fireCount,
            t: t - startTime,
            cbPy: cbP.y,
            cbVy: cbV.y,
            impulseY: 0, // calculated later
            impactX: proj.x,
            impactY: proj.y
        });
    });

    engine.advanceTo(startTime + totalShots * interval + 0.1);

    // Calculate impulse Y for CameraBody Y ONLY
    for (let i = 0; i < shots.length; i++) {
        if (i === 0) {
            shots[i].impulseY = shots[i].cbVy;
        } else {
            // Approx velocity step plus damping loss
            shots[i].impulseY = shots[i].cbVy - (shots[i - 1].cbVy * 0.5); // log velocity difference
        }
    }

    results[cfg.name] = shots;
}

console.log('====================================================================================================');
console.log('C25 RECOIL LAYER ABLATION DIAGNOSTIC REPORT (30 SHOTS, SEED=2026, TARGET Z=-200)');
console.log('====================================================================================================\n');

// 1. CameraBody Y ONLY Detailed Table
console.log('=== 1. CameraBody Y ONLY DETAILED SHOT-BY-SHOT TRACE ===');
console.log('----------------------------------------------------------------------------------------------------');
console.log('Shot | Time (s) | CameraBody Y p.y | CameraBody Y v.y | Impact X (studs) | Impact Y (studs)');
console.log('----------------------------------------------------------------------------------------------------');
for (const s of results['CameraBody Y ONLY']) {
    const sNum = `#${s.shotNum.toString().padStart(2)}`;
    const tStr = s.t.toFixed(3);
    const pyStr = `${s.cbPy >= 0 ? '+' : ''}${s.cbPy.toFixed(6)}`;
    const vyStr = `${s.cbVy >= 0 ? '+' : ''}${s.cbVy.toFixed(6)}`;
    const impX = `${s.impactX >= 0 ? '+' : ''}${s.impactX.toFixed(4)}`;
    const impY = `${s.impactY >= 0 ? '+' : ''}${s.impactY.toFixed(4)}`;
    console.log(`${sNum}  | ${tStr}s   | ${pyStr.padEnd(16)} | ${vyStr.padEnd(16)} | ${impX.padEnd(16)} | ${impY}`);
}
console.log('----------------------------------------------------------------------------------------------------\n');

// 2. Lateral Trajectory (Impact X) Comparison Table across All Ablation Layers
console.log('=== 2. LATERAL TRAJECTORY (IMPACT X in studs) COMPARISON ACROSS ABLATION LAYERS ===');
let header = 'Shot | CameraBody Y ONLY | CameraBody ALL ONLY | Weapon Rotation ONLY | Weapon Translation ONLY | Baseline (Full)';
console.log(header);
console.log('-'.repeat(header.length));

for (let i = 0; i < totalShots; i++) {
    const sNum = `#${(i + 1).toString().padStart(2)}`;
    const cbY = results['CameraBody Y ONLY'][i]?.impactX ?? 0;
    const cbAll = results['CameraBody ALL ONLY'][i]?.impactX ?? 0;
    const rot = results['Weapon Rotation ONLY'][i]?.impactX ?? 0;
    const trans = results['Weapon Translation ONLY'][i]?.impactX ?? 0;
    const base = results['Baseline (Full Recoil)'][i]?.impactX ?? 0;

    const format = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(4);

    console.log(`${sNum}  | ${format(cbY).padEnd(17)} | ${format(cbAll).padEnd(19)} | ${format(rot).padEnd(20)} | ${format(trans).padEnd(23)} | ${format(base)}`);
}
console.log('-'.repeat(header.length) + '\n');

// 3. Vertical Trajectory (Impact Y) Comparison Table across All Ablation Layers
console.log('=== 3. VERTICAL TRAJECTORY (IMPACT Y in studs) COMPARISON ACROSS ABLATION LAYERS ===');
header = 'Shot | CameraBody Y ONLY | CameraBody ALL ONLY | Weapon Rotation ONLY | Weapon Translation ONLY | Baseline (Full)';
console.log(header);
console.log('-'.repeat(header.length));

for (let i = 0; i < totalShots; i++) {
    const sNum = `#${(i + 1).toString().padStart(2)}`;
    const cbY = results['CameraBody Y ONLY'][i]?.impactY ?? 0;
    const cbAll = results['CameraBody ALL ONLY'][i]?.impactY ?? 0;
    const rot = results['Weapon Rotation ONLY'][i]?.impactY ?? 0;
    const trans = results['Weapon Translation ONLY'][i]?.impactY ?? 0;
    const base = results['Baseline (Full Recoil)'][i]?.impactY ?? 0;

    const format = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(4);

    console.log(`${sNum}  | ${format(cbY).padEnd(17)} | ${format(cbAll).padEnd(19)} | ${format(rot).padEnd(20)} | ${format(trans).padEnd(23)} | ${format(base)}`);
}
console.log('-'.repeat(header.length) + '\n');

// 4. Statistical Metrics Summary
console.log('=== 4. ABLATION LAYER STATISTICAL METRICS SUMMARY ===');
for (const cfg of ablationConfigs) {
    const shots = results[cfg.name];
    const xs = shots.map(s => s.impactX);
    const ys = shots.map(s => s.impactY);

    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const stdX = Math.sqrt(xs.reduce((a, b) => a + (b - meanX) ** 2, 0) / xs.length);
    const rangeX = Math.max(...xs) - Math.min(...xs);

    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
    const stdY = Math.sqrt(ys.reduce((a, b) => a + (b - meanY) ** 2, 0) / ys.length);
    const rangeY = Math.max(...ys) - Math.min(...ys);

    let totalTravelX = 0;
    for (let i = 1; i < xs.length; i++) {
        totalTravelX += Math.abs(xs[i] - xs[i - 1]);
    }

    console.log(`Layer: [${cfg.name}]`);
    console.log(`  Lateral  (Impact X): Mean=${(meanX>=0?'+':'')+meanX.toFixed(4)} | Std=${stdX.toFixed(4)} | RangeWidth=${rangeX.toFixed(4)} studs | Total Travel ∑|ΔX|=${totalTravelX.toFixed(4)} studs`);
    console.log(`  Vertical (Impact Y): Mean=${(meanY>=0?'+':'')+meanY.toFixed(4)} | Std=${stdY.toFixed(4)} | RangeWidth=${rangeY.toFixed(4)} studs [Min: ${Math.min(...ys).toFixed(4)}, Max: ${Math.max(...ys).toFixed(4)}]\n`);
}
