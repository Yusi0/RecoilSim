import * as fs from 'fs';
import { loadCompiledC25Data } from '../src/app/c25DataLoader';

const compiledC25 = loadCompiledC25Data();

console.log('=== RecoilSim WeaponCompiler Output for C25 (Base Weapon, No Attachments) ===');
console.log('firerate:', compiledC25.firerate);
console.log('recoildelay:', compiledC25.recoildelay || 0);
console.log('camerarecoilmult:', compiledC25.camerarecoilmult);
console.log('hipfirespread:', compiledC25.hipfirespread);
console.log('hipfirespreadrecover:', compiledC25.hipfirespreadrecover);
console.log('hipfirestability:', compiledC25.hipfirestability);

console.log('\n--- Recoil Tables (Original with Variance) ---');
console.log('aimTranslation:', JSON.stringify(compiledC25.recoil.aimTranslation, null, 2));
console.log('aimRotation:', JSON.stringify(compiledC25.recoil.aimRotation, null, 2));
console.log('aimCameraHead:', JSON.stringify(compiledC25.recoil.aimCameraHead, null, 2));
console.log('aimCameraBody:', JSON.stringify(compiledC25.recoil.aimCameraBody, null, 2));

// Compare against step 5057 hardcoded tables:
const hardcodedAimTranslation = {
    x: [ [ 0.9, 25, 0, 0 ] ],
    y: [ [ 0.9, 25, -0.5, 0 ] ],
    z: [ [ 1.1, 25, 7.1, 0 ] ]
};

const hardcodedAimRotation = {
    x: [ [ 0.3, 35, -0.7, 0 ] ],
    y: [ [ 0.3, 45, -0.25, 0 ] ],
    z: [ [ 0.4, 42, 0.1, 0 ] ]
};

const hardcodedAimCameraHead = {
    x: [ [ 0.35, 50, 0, 0 ] ],
    y: [ [ 0.35, 60, 0, 0 ] ],
    z: [ [ 0.35, 80, 0, 0 ] ]
};

const hardcodedAimCameraBody = {
    x: [ [ 1, 30, 1.92, 0 ], [ 3.45, 5, 0.1, 0 ] ],
    y: [ [ 0.75, 15, -0.1, 0 ] ],
    z: [ [ 0.45, 50, 1.9, 0 ] ]
};

function zeroOutVariance(obj: any): any {
    const copy = JSON.parse(JSON.stringify(obj));
    for (const key in copy) {
        if (Array.isArray(copy[key])) {
            for (const layer of copy[key]) {
                if (Array.isArray(layer) && layer.length >= 4) {
                    layer[3] = 0;
                }
            }
        }
    }
    return copy;
}

const compiledZeroAimTrans = zeroOutVariance(compiledC25.recoil.aimTranslation);
const compiledZeroAimRot = zeroOutVariance(compiledC25.recoil.aimRotation);
const compiledZeroAimCamHead = zeroOutVariance(compiledC25.recoil.aimCameraHead);
const compiledZeroAimCamBody = zeroOutVariance(compiledC25.recoil.aimCameraBody);

function compareRecoilTables(name: string, a: any, b: any) {
    let exact = true;
    let maxDiff = 0;
    const axes = ['x', 'y', 'z'];
    for (const axis of axes) {
        const layersA = a[axis] || [];
        const layersB = b[axis] || [];
        if (layersA.length !== layersB.length) {
            exact = false;
            console.log(`[${name}] Axis ${axis} layer length mismatch: A=${layersA.length}, B=${layersB.length}`);
            continue;
        }
        for (let i = 0; i < layersA.length; i++) {
            const layerA = layersA[i];
            const layerB = layersB[i];
            for (let j = 0; j < 4; j++) {
                const diff = Math.abs(layerA[j] - layerB[j]);
                if (diff > maxDiff) maxDiff = diff;
                if (diff > 1e-9) exact = false;
            }
        }
    }
    console.log(`[${name}] Exact Equal: ${exact} | Max Abs Diff: ${maxDiff.toExponential(4)}`);
}

console.log('\n=== Field-by-Field Component Numerical Comparison ===');
compareRecoilTables('aimTranslation', compiledZeroAimTrans, hardcodedAimTranslation);
compareRecoilTables('aimRotation', compiledZeroAimRot, hardcodedAimRotation);
compareRecoilTables('aimCameraHead', compiledZeroAimCamHead, hardcodedAimCameraHead);
compareRecoilTables('aimCameraBody', compiledZeroAimCamBody, hardcodedAimCameraBody);

