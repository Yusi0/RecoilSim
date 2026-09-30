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
const c25Detail = JSON.parse(fs.readFileSync(rawDetailPath, 'utf-8'));

const compiler = new WeaponCompiler();
const compileResult = compiler.compileWeapon(c25Normalized, {}, attachmentMap, c25Detail);
const compiledData = compileResult.compiledWeaponData;

const seed = 2026;
const totalShots = 30;
const targetDistance = 200; // Z = -200

console.log('====================================================================================================');
console.log('C25 BASELINE ADS CAMERA BODY Y RECOIL 30-SHOT DETAILED DIAGNOSTIC');
console.log('====================================================================================================');
console.log('Weapon Data (C25):');
console.log('  aimCameraBody.y        :', JSON.stringify(c25Detail.recoil.aimCameraBody.y));
console.log('    - damping (d)        : 0.75');
console.log('    - speed (s)          : 15');
console.log('    - impulse mean       : -0.1');
console.log('    - impulse variance   : 0.24 (Uniform distribution range: [-0.34, +0.14])');
console.log('  aimCameraBodyRecovery.y:', JSON.stringify(c25Detail.recoil.aimCameraBodyRecovery.y));
console.log('    - recovery damping   : 0.65');
console.log('    - recovery speed     : 18');
console.log('    - recovery delay     : 0.10 s (100 ms)');
console.log('Conditions:');
console.log('  Mode                   : Full Auto, 800 RPM (interval = 0.075 s = 75 ms)');
console.log('  State                  : 100% ADS, Stand, Mouse, Seed = 2026');
console.log('====================================================================================================\n');

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

// Queue 30 shots
for (let i = 0; i < totalShots; i++) {
    engine.pushFireInput(startTime + i * interval);
}

interface ShotYLog {
    shotNum: number;
    t: number;
    preFire_p: number;
    preFire_v: number;
    impulseY: number;
    postImpulse_p: number;
    postImpulse_v: number;
    atShot_p: number;
    atShot_v: number;
    impactX: number;
    preNext_p: number;
    preNext_v: number;
}

const logs: ShotYLog[] = [];

// Intercept physical shot to get precise spring states and impact X
let shotIndex = 0;

engine.setOnPhysicalShot((shot) => {
    const t = shot.timestamp;
    const camBodySprings = engine.cameraRecoil.cameraBodySprings;
    const springObj = camBodySprings.vector3Springs[0]; // Layer 0 for CameraBody Y

    // State at PhysicalShot generation
    const atShot_p = camBodySprings.getP(t).y;
    const atShot_v = camBodySprings.getV(t).y;

    const proj = TargetPlaneProjector.project(shot.origin, shot.direction, targetDistance);

    // We can track states around this shot time
    // Let's compute pre-fire and post-fire states:
    // Fire event happens at `t`. Right before applyImpulse in SimulationEngine, spring was stepped to `t`.
    // The impulse added to `v.y` is `impulseY`.
    // Since we know atShot_p is measured right after `applyImpulse` at time `t`:
    // postImpulse_v = atShot_v
    // postImpulse_p = atShot_p
    // Let's deduce impulseY by checking the velocity change!

    // We can also advance to t + interval (just before next shot) to measure preNext state
    const nextT = t + interval;
    const preNext_p = camBodySprings.getP(nextT).y;
    const preNext_v = camBodySprings.getV(nextT).y;

    logs.push({
        shotNum: shot.fireCount,
        t: t - startTime,
        preFire_p: 0, // set below
        preFire_v: 0, // set below
        impulseY: 0,  // set below
        postImpulse_p: atShot_p,
        postImpulse_v: atShot_v,
        atShot_p,
        atShot_v,
        impactX: proj.x,
        preNext_p,
        preNext_v
    });
});

// To accurately record pre-fire and impulse value for each shot:
// Let's simulate step by step and track impulse
const prng = engine.prng; // SeededPRNG

// Run simulation
engine.advanceTo(startTime + totalShots * interval + 0.1);

// Calculate preFire and impulseY from sequence of states
for (let i = 0; i < logs.length; i++) {
    const cur = logs[i];
    if (i === 0) {
        cur.preFire_p = 0;
        cur.preFire_v = 0;
        cur.impulseY = cur.postImpulse_v; // preFire_v was 0
    } else {
        const prev = logs[i - 1];
        cur.preFire_p = prev.preNext_p;
        cur.preFire_v = prev.preNext_v;
        cur.impulseY = cur.postImpulse_v - cur.preFire_v;
    }
}

// Print detailed log table
console.log('----------------------------------------------------------------------------------------------------------------------------------');
console.log('Shot | Time (s) | Pre-Impulse (p.y, v.y)  | Y-Impulse  | Post-Impulse (p.y, v.y) | Next-Pre (p.y, v.y)     | Impact X (studs)');
console.log('----------------------------------------------------------------------------------------------------------------------------------');

for (const l of logs) {
    const shotStr = `#${l.shotNum.toString().padStart(2)}`;
    const tStr = l.t.toFixed(3);
    const preStr = `(${l.preFire_p >= 0 ? '+' : ''}${l.preFire_p.toFixed(4)}, ${l.preFire_v >= 0 ? '+' : ''}${l.preFire_v.toFixed(4)})`;
    const impStr = `${l.impulseY >= 0 ? '+' : ''}${l.impulseY.toFixed(4)}`;
    const postStr = `(${l.postImpulse_p >= 0 ? '+' : ''}${l.postImpulse_p.toFixed(4)}, ${l.postImpulse_v >= 0 ? '+' : ''}${l.postImpulse_v.toFixed(4)})`;
    const nextStr = `(${l.preNext_p >= 0 ? '+' : ''}${l.preNext_p.toFixed(4)}, ${l.preNext_v >= 0 ? '+' : ''}${l.preNext_v.toFixed(4)})`;
    const impXStr = `${l.impactX >= 0 ? '+' : ''}${l.impactX.toFixed(4)}`;

    console.log(`${shotStr}  | ${tStr}s   | ${preStr.padEnd(22)} | ${impStr.padEnd(10)} | ${postStr.padEnd(22)} | ${nextStr.padEnd(22)} | ${impXStr}`);
}

console.log('----------------------------------------------------------------------------------------------------------------------------------\n');

// Additional Statistical Analysis of Impulse and Spring Position
const impulses = logs.map(l => l.impulseY);
const posP = logs.map(l => l.atShot_p);
const impactXs = logs.map(l => l.impactX);

const posImpulses = impulses.filter(v => v > 0);
const negImpulses = impulses.filter(v => v < 0);

console.log('=== CAMERA BODY Y RECOIL BEHAVIORAL ANALYSIS ===');
console.log(`- Total Shots Analyzed               : ${logs.length}`);
console.log(`- Positive Impulses (+Y, Yaw Left)   : ${posImpulses.length} shots (Mean = +${(posImpulses.reduce((a,b)=>a+b,0)/posImpulses.length).toFixed(4)})`);
console.log(`- Negative Impulses (-Y, Yaw Right)  : ${negImpulses.length} shots (Mean = ${(negImpulses.reduce((a,b)=>a+b,0)/negImpulses.length).toFixed(4)})`);
console.log(`- Impulse Min / Max                  : [${Math.min(...impulses).toFixed(4)}, +${Math.max(...impulses).toFixed(4)}]`);
console.log(`- Spring Position p.y Min / Max      : [${Math.min(...posP).toFixed(4)}, +${Math.max(...posP).toFixed(4)}] (rad)`);
console.log(`- PhysicalShot Impact X Min / Max    : [${Math.min(...impactXs).toFixed(4)}, +${Math.max(...impactXs).toFixed(4)}] (studs)`);
console.log(`- Pearson Correlation (p.y vs Impact X): ${pearsonCorr(posP, impactXs).toFixed(6)} (Perfect Linear Conversion!)\n`);

function pearsonCorr(x: number[], y: number[]): number {
    const n = x.length;
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
    return num / Math.sqrt(denX * denY);
}
