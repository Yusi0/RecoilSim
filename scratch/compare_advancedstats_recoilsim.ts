import * as fs from 'fs';
import * as path from 'path';
import { loadCompiledC25Data } from '../src/app/c25DataLoader';
import { Vector3, CFrame, Spring, Vector3Spring, CFrameMath } from '../src/core/math';
import { FirearmObjectRecoil } from '../src/core/recoil/FirearmObjectRecoil';
import { MainCameraObjectRecoil } from '../src/core/recoil/MainCameraObjectRecoil';

// Read generated AdvancedStats Reference JSON Dataset from step 5058 output file
const referencePath = 'C:\\Users\\choez\\.gemini\\antigravity-ide\\brain\\3352400c-e873-4af6-ab0d-a96fb6785f89\\.system_generated\\steps\\5058\\output.txt';
const refRaw = fs.readFileSync(referencePath, 'utf8');
const refData = JSON.parse(refRaw);

// Zero out variance in compiled C25 data for RecoilSim Zero-Variance Mode
const compiledC25 = loadCompiledC25Data();

function setZeroVariance(obj: any) {
    if (typeof obj !== 'object' || obj === null) return;
    for (const key in obj) {
        const val = obj[key];
        if (Array.isArray(val)) {
            for (const item of val) {
                if (Array.isArray(item) && item.length >= 4) {
                    item[3] = 0.0; // variance = 0
                }
            }
        } else if (typeof val === 'object') {
            setZeroVariance(val);
        }
    }
}
setZeroVariance(compiledC25);

// RecoilSim Simulation Setup for C25 (matching AdvancedStats conditions)
let virtualTime = 0;
const clockFn = () => virtualTime;
const zeroRngFn = (mean: number, _variance: number) => mean; // Zero variance

const firearmRecoil = new FirearmObjectRecoil(compiledC25, clockFn, zeroRngFn);
const cameraRecoil = new MainCameraObjectRecoil(
    compiledC25.cameraRecoil || compiledC25.recoil,
    clockFn,
    zeroRngFn
);

firearmRecoil.setStance('stand');
firearmRecoil.setDevice('mouse');
firearmRecoil.setAim(true, 0);
cameraRecoil.setAim(true, 0);

const totalShots = 30;
const rpm = 800;
const shotInterval = 60 / rpm;
const headPos = new Vector3(0, 0, 0);
const aimOffset = CFrame.newPos(new Vector3(0, -0.5, -1.2)); // AdvancedStats cFrame2

const recoilsimShots: any[] = [];

for (let i = 1; i <= totalShots; i++) {
    virtualTime = (i - 1) * shotInterval;

    // Advance physics clocks
    firearmRecoil.step(virtualTime);
    cameraRecoil.step(virtualTime);

    // Apply impulses
    firearmRecoil.fire(virtualTime);
    cameraRecoil.applyImpulse(1.0, virtualTime);

    // Read Spring Positions and Velocities
    const firearmPV = firearmRecoil.getPositionsAndVelocities(virtualTime);
    const cameraCFs = cameraRecoil.computeCFrames(CFrame.IDENTITY, Vector3.ZERO, virtualTime);

    const transP = firearmPV.translation;
    const transV = firearmRecoil.translationSprings.getV(virtualTime);
    const rotP = firearmPV.rotation;
    const rotV = firearmRecoil.rotationSprings.getV(virtualTime);
    const camHeadP = cameraCFs.headRecoilVec;
    const camHeadV = cameraRecoil.cameraHeadSprings.getV(virtualTime);
    const camBodyP = cameraCFs.bodyRecoilVec;
    const camBodyV = cameraRecoil.cameraBodySprings.vector3Springs[0].v;

    // AdvancedStats getStateCFrames math matching AdvancedStats
    const v142 = CFrame.fromAxisAngle(rotP).addPos(transP);
    const v143 = CFrame.fromAxisAngle(camBodyP);
    
    // Gun pose CFrame matching AdvancedStats: (CFrame.Angles(0, pi, 0) * v143 + headPos) * aimOffset * v142
    const v149 = CFrame.fromAxisAngle(new Vector3(0, Math.PI, 0)).mul(v143).addPos(headPos).mul(aimOffset).mul(v142);
    const p = v149.p;
    const lookVector = v149.zVector.neg();

    // Target plane intersection at Z=10
    const dotZ = lookVector.dot(new Vector3(0, 0, 1));
    const intersectP = dotZ !== 0 ? p.add(lookVector.mul((10 - p.z) / dotZ)) : p;
    const v169 = p.sub(intersectP).mul(new Vector3(1, 1, 0));
    const impactX = v169.x * 80;
    const impactY = v169.y * 80;

    recoilsimShots.push({
        shotIndex: i,
        timestamp: virtualTime,
        translationP: [transP.x, transP.y, transP.z],
        translationV: [transV.x, transV.y, transV.z],
        rotationP: [rotP.x, rotP.y, rotP.z],
        rotationV: [rotV.x, rotV.y, rotV.z],
        cameraHeadP: [camHeadP.x, camHeadP.y, camHeadP.z],
        cameraHeadV: [camHeadV.x, camHeadV.y, camHeadV.z],
        cameraBodyP: [camBodyP.x, camBodyP.y, camBodyP.z],
        cameraBodyV: [camBodyV.x, camBodyV.y, camBodyV.z],
        lookVector: [lookVector.x, lookVector.y, lookVector.z],
        impact: {
            x: impactX,
            y: impactY
        }
    });
}

// Compare against Reference Dataset
const refShots = refData.shots;

interface CategoryStats {
    maxError: number;
    sumError: number;
    count: number;
    firstDivergentShot: number | null;
    firstDivergentComponent: string | null;
}

function createStats(): CategoryStats {
    return { maxError: 0, sumError: 0, count: 0, firstDivergentShot: null, firstDivergentComponent: null };
}

const categories: Record<string, CategoryStats> = {
    translationP: createStats(),
    translationV: createStats(),
    rotationP: createStats(),
    rotationV: createStats(),
    cameraHeadP: createStats(),
    cameraHeadV: createStats(),
    cameraBodyP: createStats(),
    cameraBodyV: createStats(),
    lookVector: createStats(),
    impact: createStats()
};

const components = ['X', 'Y', 'Z'];

console.log('================================================================');
console.log(' C25 ZERO-VARIANCE NUMERICAL VALIDATION SUMMARY ');
console.log('================================================================');

for (let i = 0; i < totalShots; i++) {
    const ref = refShots[i];
    const sim = recoilsimShots[i];
    const shotIdx = i + 1;

    // 1. Translation P
    for (let c = 0; c < 3; c++) {
        const err = Math.abs(ref.translationP[c] - sim.translationP[c]);
        const stat = categories.translationP;
        stat.sumError += err;
        stat.count++;
        if (err > stat.maxError) stat.maxError = err;
        if (err > 1e-4 && stat.firstDivergentShot === null) {
            stat.firstDivergentShot = shotIdx;
            stat.firstDivergentComponent = `translationP.${components[c]}`;
        }
    }

    // 2. Translation V
    for (let c = 0; c < 3; c++) {
        const err = Math.abs(ref.translationV[c] - sim.translationV[c]);
        const stat = categories.translationV;
        stat.sumError += err;
        stat.count++;
        if (err > stat.maxError) stat.maxError = err;
        if (err > 1e-4 && stat.firstDivergentShot === null) {
            stat.firstDivergentShot = shotIdx;
            stat.firstDivergentComponent = `translationV.${components[c]}`;
        }
    }

    // 3. Rotation P
    for (let c = 0; c < 3; c++) {
        const err = Math.abs(ref.rotationP[c] - sim.rotationP[c]);
        const stat = categories.rotationP;
        stat.sumError += err;
        stat.count++;
        if (err > stat.maxError) stat.maxError = err;
        if (err > 1e-4 && stat.firstDivergentShot === null) {
            stat.firstDivergentShot = shotIdx;
            stat.firstDivergentComponent = `rotationP.${components[c]}`;
        }
    }

    // 4. Rotation V
    for (let c = 0; c < 3; c++) {
        const err = Math.abs(ref.rotationV[c] - sim.rotationV[c]);
        const stat = categories.rotationV;
        stat.sumError += err;
        stat.count++;
        if (err > stat.maxError) stat.maxError = err;
        if (err > 1e-4 && stat.firstDivergentShot === null) {
            stat.firstDivergentShot = shotIdx;
            stat.firstDivergentComponent = `rotationV.${components[c]}`;
        }
    }

    // 5. CameraHead P
    for (let c = 0; c < 3; c++) {
        const err = Math.abs(ref.cameraHeadP[c] - sim.cameraHeadP[c]);
        const stat = categories.cameraHeadP;
        stat.sumError += err;
        stat.count++;
        if (err > stat.maxError) stat.maxError = err;
        if (err > 1e-4 && stat.firstDivergentShot === null) {
            stat.firstDivergentShot = shotIdx;
            stat.firstDivergentComponent = `cameraHeadP.${components[c]}`;
        }
    }

    // 6. CameraHead V
    for (let c = 0; c < 3; c++) {
        const err = Math.abs(ref.cameraHeadV[c] - sim.cameraHeadV[c]);
        const stat = categories.cameraHeadV;
        stat.sumError += err;
        stat.count++;
        if (err > stat.maxError) stat.maxError = err;
        if (err > 1e-4 && stat.firstDivergentShot === null) {
            stat.firstDivergentShot = shotIdx;
            stat.firstDivergentComponent = `cameraHeadV.${components[c]}`;
        }
    }

    // 7. CameraBody P
    for (let c = 0; c < 3; c++) {
        const err = Math.abs(ref.cameraBodyP[c] - sim.cameraBodyP[c]);
        const stat = categories.cameraBodyP;
        stat.sumError += err;
        stat.count++;
        if (err > stat.maxError) stat.maxError = err;
        if (err > 1e-4 && stat.firstDivergentShot === null) {
            stat.firstDivergentShot = shotIdx;
            stat.firstDivergentComponent = `cameraBodyP.${components[c]}`;
        }
    }

    // 8. CameraBody V
    for (let c = 0; c < 3; c++) {
        const err = Math.abs(ref.cameraBodyV[c] - sim.cameraBodyV[c]);
        const stat = categories.cameraBodyV;
        stat.sumError += err;
        stat.count++;
        if (err > stat.maxError) stat.maxError = err;
        if (err > 1e-4 && stat.firstDivergentShot === null) {
            stat.firstDivergentShot = shotIdx;
            stat.firstDivergentComponent = `cameraBodyV.${components[c]}`;
        }
    }

    // 9. LookVector
    for (let c = 0; c < 3; c++) {
        const err = Math.abs(ref.lookVector[c] - sim.lookVector[c]);
        const stat = categories.lookVector;
        stat.sumError += err;
        stat.count++;
        if (err > stat.maxError) stat.maxError = err;
        if (err > 1e-4 && stat.firstDivergentShot === null) {
            stat.firstDivergentShot = shotIdx;
            stat.firstDivergentComponent = `lookVector.${components[c]}`;
        }
    }

    // 10. Impact X/Y
    const errX = Math.abs(ref.impact.x - sim.impact.x);
    const errY = Math.abs(ref.impact.y - sim.impact.y);
    const statImp = categories.impact;
    statImp.sumError += errX + errY;
    statImp.count += 2;
    if (errX > statImp.maxError) statImp.maxError = errX;
    if (errY > statImp.maxError) statImp.maxError = errY;
    if ((errX > 1e-3 || errY > 1e-3) && statImp.firstDivergentShot === null) {
        statImp.firstDivergentShot = shotIdx;
        statImp.firstDivergentComponent = errX > 1e-3 ? 'impact.X' : 'impact.Y';
    }
}

console.log('\n--- DETAILED COMPARISON TABLE PER CATEGORY ---');
console.log('Category'.padEnd(16) + ' | Max Error'.padEnd(14) + ' | Mean Error'.padEnd(14) + ' | First Div Shot'.padEnd(18) + ' | First Div Comp');
console.log('-'.repeat(80));

for (const catKey of Object.keys(categories)) {
    const stat = categories[catKey];
    const meanErr = stat.sumError / stat.count;
    const divShotStr = stat.firstDivergentShot !== null ? `Shot ${stat.firstDivergentShot}` : 'None';
    const divCompStr = stat.firstDivergentComponent !== null ? stat.firstDivergentComponent : 'None';
    console.log(
        catKey.padEnd(16) + ' | ' +
        stat.maxError.toExponential(4).padEnd(14) + ' | ' +
        meanErr.toExponential(4).padEnd(14) + ' | ' +
        divShotStr.padEnd(18) + ' | ' +
        divCompStr
    );
}

console.log('\n--- FIRST 5 SHOTS COMPARISON SNAPSHOT ---');
for (let i = 0; i < 5; i++) {
    const ref = refShots[i];
    const sim = recoilsimShots[i];
    console.log(`Shot ${i + 1} (t=${ref.timestamp.toFixed(3)}s):`);
    console.log(`  Ref  Impact: X=${ref.impact.x.toFixed(4)}, Y=${ref.impact.y.toFixed(4)} | LookVector: [${ref.lookVector.map((n: number) => n.toFixed(5)).join(', ')}]`);
    console.log(`  Sim  Impact: X=${sim.impact.x.toFixed(4)}, Y=${sim.impact.y.toFixed(4)} | LookVector: [${sim.lookVector.map((n: number) => n.toFixed(5)).join(', ')}]`);
    console.log(`  Ref  camBodyV: [${ref.cameraBodyV.map((n: number) => n.toFixed(5)).join(', ')}]`);
    console.log(`  Sim  camBodyV: [${sim.cameraBodyV.map((n: number) => n.toFixed(5)).join(', ')}]`);
}

console.log('\n--- SHOT 30 COMPARISON SNAPSHOT ---');
const ref30 = refShots[29];
const sim30 = recoilsimShots[29];
console.log(`Shot 30 (t=${ref30.timestamp.toFixed(3)}s):`);
console.log(`  Ref  Impact: X=${ref30.impact.x.toFixed(4)}, Y=${ref30.impact.y.toFixed(4)} | LookVector: [${ref30.lookVector.map((n: number) => n.toFixed(5)).join(', ')}]`);
console.log(`  Sim  Impact: X=${sim30.impact.x.toFixed(4)}, Y=${sim30.impact.y.toFixed(4)} | LookVector: [${sim30.lookVector.map((n: number) => n.toFixed(5)).join(', ')}]`);
