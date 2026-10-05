import { TargetPlaneProjector } from '../src/montecarlo/TargetPlaneProjector';
import { MonteCarloEngine } from '../src/montecarlo/MonteCarloEngine';
import { SimulationEngine } from '../src/core/sim/SimulationEngine';
import { Vector3, CFrame } from '../src/core/math';
import { loadCompiledC25Data } from '../src/app/c25DataLoader';

function banner(title: string) {
    console.log('\n' + '='.repeat(70));
    console.log(`  ${title}`);
    console.log('='.repeat(70));
}

// ---------------------------------------------------------------------------
// Issue 1: aimProgress Verification
// ---------------------------------------------------------------------------
banner('ISSUE 1: aimProgress Verification');

const c25Data = loadCompiledC25Data();

console.log('[1-A] MonteCarloEngine aimProgress forwarding check:');
const testCases = [
    { label: 'aimProgress=0 (no aiming specified)', config: { aimProgress: 0 } },
    { label: 'aimProgress=0.25 (no aiming specified)', config: { aimProgress: 0.25 } },
    { label: 'aimProgress=0.5 (no aiming specified)', config: { aimProgress: 0.5 } },
    { label: 'aimProgress=1.0 (no aiming specified)', config: { aimProgress: 1.0 } },
    { label: 'aimProgress=0.25 with aiming=false', config: { aimProgress: 0.25, aiming: false } },
    { label: 'aimProgress=0.75 with aiming=true', config: { aimProgress: 0.75, aiming: true } }
];

for (const tc of testCases) {
    const mc = new MonteCarloEngine({
        weaponData: c25Data,
        trialCount: 1,
        masterSeed: 1337,
        burstSize: 2,
        ...tc.config
    });

    const res = mc.run();
    console.log(`\nCase: ${tc.label}`);
    console.log(`  - mc.config.aiming: ${mc.config.aiming}`);
    console.log(`  - mc.config.aimProgress: ${mc.config.aimProgress}`);
    console.log(`  - result.conditions.isAiming: ${res.conditions.isAiming}`);
    console.log(`  - result.conditions.aimProgress: ${res.conditions.aimProgress}`);
}

console.log('\n[1-B] Direct SimulationEngine inspection with various aimSpring values:');
// We test how SimulationEngine state changes when aimSpring.p is at 0, 0.25, 0.5, 1.0
// In SimulationEngine: aimSpeed = c25 aimspeed (~15).
// When pushAimInput(true, 0) is called, aimSpring moves from 0 towards 1.
// Let's find timestamps where aimSpring.p reaches ~0.0, ~0.25, ~0.5, ~1.0.

const testEngine = new SimulationEngine({
    weaponData: c25Data,
    seed: 1337,
    hipOffset: CFrame.newPos(new Vector3(0.18, -0.15, -0.42)),
    aimOffset: CFrame.newPos(new Vector3(0, -0.08, -0.32)),
});

// Check aim progress over time after pushAimInput(true)
testEngine.pushAimInput(true, 0.0);
console.log('Tracking aimSpring.p progression after pushAimInput(true, 0):');
const sampleTimes = [0.0, 0.02, 0.05, 0.1, 0.3];
for (const t of sampleTimes) {
    testEngine.advanceTo(t);
    const pose = testEngine.getWeaponPose(t);
    console.log(`  t=${t.toFixed(2)}s: aimProgress=${pose.aimProgress.toFixed(4)}, isAiming=${pose.isAiming}, mainOffset.p=(${pose.mainC0.p.x.toFixed(4)}, ${pose.mainC0.p.y.toFixed(4)}, ${pose.mainC0.p.z.toFixed(4)})`);
}

// ---------------------------------------------------------------------------
// Issue 2: firerate Verification
// ---------------------------------------------------------------------------
banner('ISSUE 2: firerate Verification');

console.log(`Authoritative weapon firerate for C25: ${c25Data.firerate} RPM`);

// Case A: Matching firerate (800 RPM)
const mcNormal = new MonteCarloEngine({
    weaponData: c25Data,
    trialCount: 1,
    masterSeed: 1337,
    burstSize: 10,
    firerate: 800
});
const resNormal = mcNormal.run();
console.log('\n[2-A] Normal Case (firerate = 800 RPM, burstSize = 10):');
console.log(`  - shotsPerTrial configured: ${resNormal.shotsPerTrial}`);
console.log(`  - totalShots recorded:      ${resNormal.totalShots}`);
console.log(`  - impacts length:           ${resNormal.impacts.length}`);

// Case B: Mismatched firerate (1600 RPM - double the weapon firerate)
const mcFast = new MonteCarloEngine({
    weaponData: c25Data,
    trialCount: 1,
    masterSeed: 1337,
    burstSize: 10,
    firerate: 1600
});
const resFast = mcFast.run();
console.log('\n[2-B] Mismatched Case (config firerate = 1600 RPM vs weapon firerate = 800 RPM, burstSize = 10):');
console.log(`  - shotsPerTrial configured: ${resFast.shotsPerTrial}`);
console.log(`  - totalShots recorded:      ${resFast.totalShots}`);
console.log(`  - impacts length:           ${resFast.impacts.length}`);

// Let's trace pushFireInput return values directly with firerate = 1600:
console.log('\n[2-C] Tracing engine.pushFireInput() return values with firerate = 1600 interval:');
const traceEngine = new SimulationEngine({
    weaponData: c25Data,
    seed: 1337
});
const interval1600 = 60 / 1600; // 0.0375s
const traceResults: { shotIdx: number; t: number; pushSuccess: boolean; physicalCount: number }[] = [];
for (let i = 0; i < 10; i++) {
    const fireT = i * interval1600;
    const ok = traceEngine.pushFireInput(fireT);
    traceEngine.advanceTo(fireT + interval1600);
    traceResults.push({
        shotIdx: i,
        t: fireT,
        pushSuccess: ok,
        physicalCount: traceEngine.physicalShots.length
    });
}
console.table(traceResults);

// ---------------------------------------------------------------------------
// Issue 3: TargetPlaneProjector Verification
// ---------------------------------------------------------------------------
banner('ISSUE 3: TargetPlaneProjector Verification');

const origin = new Vector3(0, 0, 0);
const targetDist = 50; // target at Z = -50

// Case 1: Normal forward ray (dir.z < 0)
const dirForward = new Vector3(0, 0, -1);
const projForward = TargetPlaneProjector.project(origin, dirForward, targetDist);
console.log('\n[3-A] Normal forward ray (dir.z < 0): direction = (0, 0, -1)');
console.log(`  -> Result: x=${projForward.x}, y=${projForward.y}, z=${projForward.z}, distToTarget=${projForward.distToTarget}`);

// Case 2: Opposite backward ray (dir.z > 0)
const dirBackward = new Vector3(0, 0, 1);
const projBackward = TargetPlaneProjector.project(origin, dirBackward, targetDist);
console.log('\n[3-B] Backward ray opposite to target (dir.z > 0): direction = (0, 0, 1)');
console.log(`  -> Result: x=${projBackward.x}, y=${projBackward.y}, z=${projBackward.z}, distToTarget=${projBackward.distToTarget}`);

// Case 2-Angled: Angled backward ray (dir.x=1, dir.y=1, dir.z=1).unit
const dirBackwardAngled = new Vector3(1, 1, 1).unit;
const projBackwardAngled = TargetPlaneProjector.project(origin, dirBackwardAngled, targetDist);
console.log('\n[3-B2] Angled backward ray (dir.z > 0): direction = (1, 1, 1).unit');
console.log(`  -> Result: x=${projBackwardAngled.x.toFixed(4)}, y=${projBackwardAngled.y.toFixed(4)}, z=${projBackwardAngled.z}, distToTarget=${projBackwardAngled.distToTarget.toFixed(4)}`);

// Case 3: Parallel ray (dir.z = 0)
const dirParallel = new Vector3(1, 0, 0);
const projParallel = TargetPlaneProjector.project(origin, dirParallel, targetDist);
console.log('\n[3-C] Parallel ray (dir.z = 0): direction = (1, 0, 0)');
console.log(`  -> Result: x=${projParallel.x}, y=${projParallel.y}, z=${projParallel.z}, distToTarget=${projParallel.distToTarget}`);
