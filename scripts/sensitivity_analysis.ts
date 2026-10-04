import { RecommendationEngine } from '../src/recommendation/RecommendationEngine';
import { getWeaponRecommendationProfile } from '../src/recommendation/WeaponRecommendationProfiles';
import { loadCompiledWeaponData } from '../src/app/c25DataLoader';
import { computeParetoFrontier } from '../src/recommendation/ParetoFrontier';
import { CandidateEvaluation } from '../src/recommendation/RecommendationTypes';
import { canonicalizeAttachments } from '../src/recommendation/RecommendationCache';

interface CandidatePhysics {
    id: string;
    attachments: Record<string, string>;
    rpm: number;
    deltaTtkMs: number;
    deltaAdsMs: number;
    deltaSprintMs: number;
    deltaAimWalkSpeed: number;
    evaluation?: CandidateEvaluation;
}

interface WeaponPhysicsProfile {
    weaponId: string;
    baseRpm: number;
    baseBtk: number;
    baseTtkMs: number;
    baseAdsMs: number;
    baseSprintMs: number;
    baseAimWalk: number;
    candidates: CandidatePhysics[];
}

const WEAPONS = ['c25', 'ak105', 'm16a3', 'm231'];

function getPhysics(weaponData: any) {
    const rpm = weaponData.firerate || weaponData.rpm || 800;
    const damage0 = weaponData.damage0 || 30;
    const btk = Math.ceil(100 / damage0);
    const shotIntervalMs = 60000 / rpm;
    const ttkMs = (btk - 1) * shotIntervalMs;

    const aimspeed = weaponData.aimspeed || 16;
    const adsMs = 4743.8645 / aimspeed; // sightaimspring d=1.0

    const sprintspeed = weaponData.sprintspeed || 14;
    const sprintMs = 4015.0 / sprintspeed; // sprintspring d=0.90

    const walkspeed = weaponData.walkspeed || 14;
    const aimwalkmult = weaponData.aimwalkspeedmult || 0.7;
    const aimWalkSpeed = walkspeed * aimwalkmult;

    return { rpm, btk, ttkMs, adsMs, sprintMs, aimWalkSpeed };
}

async function run() {
    console.log('Compiling and analyzing candidate physics metrics...');
    const engine = new RecommendationEngine();

    const profiles: WeaponPhysicsProfile[] = [];

    for (const weaponId of WEAPONS) {
        const baseData = loadCompiledWeaponData(weaponId, {});
        const basePhys = getPhysics(baseData);

        const profile = getWeaponRecommendationProfile(weaponId);
        const rawCandidates = (engine as any).generateCandidates(profile);

        // Run 32-trial CRN exploration to get recoil statistics & objective vectors
        const evals = engine.evaluateCandidates(weaponId, {}, rawCandidates, {
            masterSeed: 2026,
            explorationTrials: 32
        });

        const candPhysics: CandidatePhysics[] = [];

        for (const cand of rawCandidates) {
            const compiled = loadCompiledWeaponData(weaponId, cand);
            const phys = getPhysics(compiled);
            const id = canonicalizeAttachments(cand) || 'none';
            const ev = evals.find((e: any) => e.id === id);

            candPhysics.push({
                id,
                attachments: cand,
                rpm: phys.rpm,
                deltaTtkMs: phys.ttkMs - basePhys.ttkMs,
                deltaAdsMs: phys.adsMs - basePhys.adsMs,
                deltaSprintMs: phys.sprintMs - basePhys.sprintMs,
                deltaAimWalkSpeed: basePhys.aimWalkSpeed - phys.aimWalkSpeed, // speed reduction
                evaluation: ev
            });
        }

        profiles.push({
            weaponId,
            baseRpm: basePhys.rpm,
            baseBtk: basePhys.btk,
            baseTtkMs: basePhys.ttkMs,
            baseAdsMs: basePhys.adsMs,
            baseSprintMs: basePhys.sprintMs,
            baseAimWalk: basePhys.aimWalkSpeed,
            candidates: candPhysics
        });
    }

    console.log('================================================================================');
    console.log('1. INDIVIDUAL THRESHOLD SENSITIVITY ANALYSIS');
    console.log('================================================================================');

    const ttkThresholds = [8, 16.7, 25, 33];
    const adsThresholds = [15, 25, 35, 50];
    const sprintThresholds = [20, 30, 40, 50, 60];
    const walkThresholds = [0.5, 1.0, 1.5, 2.0];

    function evaluateHurdle(
        name: string,
        filterFn: (c: CandidatePhysics, p: WeaponPhysicsProfile) => boolean
    ) {
        console.log(`\n--- ${name} ---`);
        let totalCands = 0;
        let totalPruned = 0;
        const weaponStats: string[] = [];

        for (const p of profiles) {
            const initial = p.candidates.length;
            const remaining = p.candidates.filter(c => filterFn(c, p));
            const pruned = initial - remaining.length;
            const prunedPct = ((pruned / initial) * 100).toFixed(1);
            totalCands += initial;
            totalPruned += pruned;
            weaponStats.push(`${p.weaponId}: ${remaining.length}/${initial} (-${prunedPct}%)`);
        }
        const totalPct = ((totalPruned / totalCands) * 100).toFixed(1);
        console.log(`Overall Pruned: ${totalPruned}/${totalCands} (${totalPct}%) | Details: ${weaponStats.join(', ')}`);
    }

    console.log('\n[A. Firerate -> deltaTTK Thresholds]');
    for (const t of ttkThresholds) {
        evaluateHurdle(`TTK Hurdle <= ${t} ms`, (c) => c.deltaTtkMs < t + 0.1);
    }

    console.log('\n[B. Aimspeed -> deltaADS Thresholds]');
    for (const t of adsThresholds) {
        evaluateHurdle(`ADS Hurdle <= ${t} ms`, (c) => c.deltaAdsMs < t + 0.1);
    }

    console.log('\n[C. Sprintspeed -> deltaSprint Thresholds]');
    for (const t of sprintThresholds) {
        evaluateHurdle(`Sprint Hurdle <= ${t} ms`, (c) => c.deltaSprintMs < t + 0.1);
    }

    console.log('\n[D. Aimwalkspeedmult -> deltaAimWalk Thresholds]');
    for (const t of walkThresholds) {
        evaluateHurdle(`AimWalk Hurdle <= ${t} studs/s`, (c) => c.deltaAimWalkSpeed < t + 0.05);
    }

    console.log('\n================================================================================');
    console.log('2. SPECIFIC ATTACHMENT SURVIVAL INSPECTION');
    console.log('================================================================================');
    // Check how key attachments are affected across weapons
    const targetAtts = ['Romanian Grip', 'Muffler', 'Oil Filter', 'Compensator', 'Muzzle Brake', 'Angled Grip', 'Stubby Grip', 'Folding Grip'];

    for (const att of targetAtts) {
        console.log(`\n>> Attachment: [${att}]`);
        for (const p of profiles) {
            const matches = p.candidates.filter(c => Object.values(c.attachments).includes(att));
            if (matches.length === 0) continue;
            // Solo attachment candidate
            const solo = matches.find(c => Object.keys(c.attachments).length === 1);
            if (solo) {
                console.log(`  ${p.weaponId} (Solo): dTTK=${solo.deltaTtkMs.toFixed(1)}ms, dADS=${solo.deltaAdsMs.toFixed(1)}ms, dSprint=${solo.deltaSprintMs.toFixed(1)}ms, dWalk=${solo.deltaAimWalkSpeed.toFixed(2)}s/s`);
            }
            // Combo attachments average/max penalties
            const maxTtk = Math.max(...matches.map(m => m.deltaTtkMs));
            const maxAds = Math.max(...matches.map(m => m.deltaAdsMs));
            const maxSprint = Math.max(...matches.map(m => m.deltaSprintMs));
            const maxWalk = Math.max(...matches.map(m => m.deltaAimWalkSpeed));
            console.log(`  ${p.weaponId} (Combos max): dTTK=${maxTtk.toFixed(1)}ms, dADS=${maxAds.toFixed(1)}ms, dSprint=${maxSprint.toFixed(1)}ms, dWalk=${maxWalk.toFixed(2)}s/s (Total ${matches.length} pairs)`);
        }
    }

    console.log('\n================================================================================');
    console.log('3. COMBINED MULTI-AXIS HURDLE SCENARIOS & RECOMMENDATION IMPACT');
    console.log('================================================================================');

    interface Scenario {
        name: string;
        maxTtkMs: number;
        maxAdsMs: number;
        maxSprintMs: number;
        maxWalkStuds: number;
    }

    const scenarios: Scenario[] = [
        { name: 'Baseline (No Hurdles)', maxTtkMs: 999, maxAdsMs: 999, maxSprintMs: 999, maxWalkStuds: 999 },
        { name: 'Strict (16.7ms TTK, 25ms ADS, 30ms Sprint, 0.8s/s Walk)', maxTtkMs: 16.7, maxAdsMs: 25, maxSprintMs: 30, maxWalkStuds: 0.8 },
        { name: 'Balanced Standard (20.0ms TTK, 35ms ADS, 45ms Sprint, 1.1s/s Walk)', maxTtkMs: 20.0, maxAdsMs: 35, maxSprintMs: 45, maxWalkStuds: 1.1 },
        { name: 'Targeted Penalty Elimination (24.0ms TTK, 38ms ADS, 52ms Sprint, 1.25s/s Walk)', maxTtkMs: 24.0, maxAdsMs: 38, maxSprintMs: 52, maxWalkStuds: 1.25 },
        { name: 'Permissive (30.0ms TTK, 45ms ADS, 55ms Sprint, 1.5s/s Walk)', maxTtkMs: 30.0, maxAdsMs: 45, maxSprintMs: 55, maxWalkStuds: 1.5 }
    ];

    for (const sc of scenarios) {
        console.log(`\n--------------------------------------------------------------------------------`);
        console.log(`SCENARIO: ${sc.name}`);
        console.log(`Thresholds: TTK < ${sc.maxTtkMs}ms, ADS < ${sc.maxAdsMs}ms, Sprint < ${sc.maxSprintMs}ms, Walk < ${sc.maxWalkStuds}s/s`);
        console.log(`--------------------------------------------------------------------------------`);

        let emptyPoolCount = 0;
        let criticalPoolCount = 0; // 1-2 remaining

        for (const p of profiles) {
            const filtered = p.candidates.filter(c =>
                c.deltaTtkMs <= sc.maxTtkMs + 0.1 &&
                c.deltaAdsMs <= sc.maxAdsMs + 0.1 &&
                c.deltaSprintMs <= sc.maxSprintMs + 0.1 &&
                c.deltaAimWalkSpeed <= sc.maxWalkStuds + 0.05
            );

            const count = filtered.length;
            if (count === 0) emptyPoolCount++;
            if (count >= 1 && count <= 2) criticalPoolCount++;

            // Run Pareto Selection on filtered candidate evaluations
            const evals = filtered.map(f => f.evaluation!).filter(Boolean);
            const overallFrontier = computeParetoFrontier(evals, 'overall');
            const verticalFrontier = computeParetoFrontier(evals, 'vertical');
            const horizontalFrontier = computeParetoFrontier(evals, 'horizontal');

            const selected = engine.selectByRole(evals, overallFrontier, verticalFrontier, horizontalFrontier);

            const formatRec = (rec: CandidateEvaluation | null) => {
                if (!rec) return 'None';
                const parts = Object.entries(rec.attachments).map(([s, a]) => `${s}: ${a}`).join(', ');
                return parts || 'Stock (None)';
            };

            const survivalPct = ((count / p.candidates.length) * 100).toFixed(1);
            console.log(`[${p.weaponId.toUpperCase()}] Pool: ${count}/${p.candidates.length} (${survivalPct}%)`);
            console.log(`  - Overall:    ${formatRec(selected.overall)}`);
            console.log(`  - Vertical:   ${formatRec(selected.vertical)}`);
            console.log(`  - Horizontal: ${formatRec(selected.horizontal)}`);
        }

        console.log(`Summary: Empty Pools = ${emptyPoolCount}, Critical Pools (1-2) = ${criticalPoolCount}`);
    }
}

run().catch(console.error);
