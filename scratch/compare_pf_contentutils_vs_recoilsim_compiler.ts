import { loadCompiledC25Data } from '../src/app/c25DataLoader';

// Output received directly from Roblox Studio actual ContentUtils.compileWeaponData execution
const pfCompiledData = {
    name: "C25",
    displayname: "C25",
    category: "CARBINE",
    type: "ASSAULT",
    firerate: 800,
    recoildelay: 0,
    hipfirespread: 0.065,
    hipfirespreadrecover: 10,
    hipfirestability: 0.8,
    aimTranslation: {
        x: [ [ 0.9, 25, 0, 0.1 ] ],
        y: [ [ 0.9, 25, -0.5, 0.2 ] ],
        z: [ [ 1.1, 25, 7.1, 0.7 ] ]
    },
    aimRotation: {
        x: [ [ 0.3, 35, -0.7, 0.2 ] ],
        y: [ [ 0.3, 45, -0.25, 0.36 ] ],
        z: [ [ 0.4, 42, 0.1, 0.5 ] ]
    },
    aimCameraHead: {
        x: [ [ 0.35, 50, 0, 0 ] ],
        y: [ [ 0.35, 60, 0, 0 ] ],
        z: [ [ 0.35, 80, 0, 0 ] ]
    },
    aimCameraBody: {
        x: [ [ 1, 30, 1.92, 0.45 ], [ 3.45, 5, 0.1, 0.02 ] ],
        y: [ [ 0.75, 15, -0.1, 0.24 ] ],
        z: [ [ 0.45, 50, 1.9, 0.5 ] ]
    }
};

const recoilSimCompiledData = loadCompiledC25Data();

console.log('================================================================');
console.log(' PF ContentUtils.compileWeaponData vs RecoilSim WeaponCompiler ');
console.log('================================================================');

console.log('\n--- 1. Scalar Weapon Stats Comparison ---');
const scalarFields = ['name', 'displayname', 'category', 'type', 'firerate', 'hipfirespread', 'hipfirespreadrecover', 'hipfirestability'];
for (const field of scalarFields) {
    const pfVal = (pfCompiledData as any)[field];
    const tsVal = (recoilSimCompiledData as any)[field];
    const match = pfVal === tsVal;
    console.log(`Field '${field}': PF=${pfVal} | TS=${tsVal} | Match: ${match}`);
}

console.log('\n--- 2. Recoil Layer [d, s, m, v] Element-by-Element Comparison ---');
function compareLayers(tableName: string, pfTable: any, tsTable: any) {
    console.log(`\nTable: [${tableName}]`);
    let tableExact = true;
    let tableMaxDiff = 0;
    const axes = ['x', 'y', 'z'];
    for (const axis of axes) {
        const pfLayers = pfTable[axis] || [];
        const tsLayers = tsTable[axis] || [];
        if (pfLayers.length !== tsLayers.length) {
            console.log(`  Axis ${axis}: Layer count mismatch! PF=${pfLayers.length}, TS=${tsLayers.length}`);
            tableExact = false;
            continue;
        }
        for (let l = 0; l < pfLayers.length; l++) {
            const pfL = pfLayers[l];
            const tsL = tsLayers[l];
            for (let i = 0; i < 4; i++) {
                const diff = Math.abs(pfL[i] - tsL[i]);
                if (diff > tableMaxDiff) tableMaxDiff = diff;
                if (diff > 1e-9) tableExact = false;
            }
            console.log(`  Axis ${axis}[layer ${l}]: PF=[${pfL.join(', ')}] | TS=[${tsL.join(', ')}] | MaxDiff=${tableMaxDiff.toExponential(2)}`);
        }
    }
    console.log(`=> Summary [${tableName}]: Exact Match = ${tableExact} | Max Abs Diff = ${tableMaxDiff.toExponential(4)}`);
}

compareLayers('aimTranslation', pfCompiledData.aimTranslation, recoilSimCompiledData.recoil.aimTranslation);
compareLayers('aimRotation', pfCompiledData.aimRotation, recoilSimCompiledData.recoil.aimRotation);
compareLayers('aimCameraHead', pfCompiledData.aimCameraHead, recoilSimCompiledData.recoil.aimCameraHead);
compareLayers('aimCameraBody', pfCompiledData.aimCameraBody, recoilSimCompiledData.recoil.aimCameraBody);
