import { RecommendationEngine } from '../src/recommendation/RecommendationEngine';
import { getWeaponRecommendationProfile } from '../src/recommendation/WeaponRecommendationProfiles';
import { loadCompiledWeaponData } from '../src/app/c25DataLoader';
import { canonicalizeAttachments } from '../src/recommendation/RecommendationCache';
import { computeParetoFrontier, getObjectivesForRole } from '../src/recommendation/ParetoFrontier';
import { CandidateEvaluation, RecommendationRole } from '../src/recommendation/RecommendationTypes';
import { DispersionStatistics } from '../src/montecarlo/MonteCarloTypes';

interface DetailedCandidate {
    id: string;
    weaponId: string;
    attachments: Record<string, string>;
    evaluation: CandidateEvaluation;
    stats: DispersionStatistics;
    rpm: number;
    ttkMs: number;
    adsMs: number;
    sprintMs: number;
    aimWalkSpeed: number;
    deltaR95: number;
    deltaCenteredR95: number;
    deltaTtkMs: number;
    deltaAdsMs: number;
    deltaSprintMs: number;
    deltaAimWalkSpeed: number;
    // Hurdle
    hurdlePassed: boolean;
    failedHurdles: string[];
    // Pareto
    isPareto5D: boolean;
    isPareto7D: boolean;
}

const WEAPONS = ['c25', 'ak105', 'm16a3', 'm231'];

const HURDLES = {
    ttk: 20.0,
    ads: 35.0,
    sprint: 45.0,
    walk: 1.1
};

function getPhysics(weaponData: any) {
    const rpm = weaponData.firerate || weaponData.rpm || 800;
    const damage0 = weaponData.damage0 || 30;
    const btk = Math.ceil(100 / damage0);
    const shotIntervalMs = 60000 / rpm;
    const ttkMs = (btk - 1) * shotIntervalMs;

    const aimspeed = weaponData.aimspeed || 16;
    const adsMs = 4743.8645 / aimspeed;

    const sprintspeed = weaponData.sprintspeed || 14;
    const sprintMs = 4015.0 / sprintspeed;

    const walkspeed = weaponData.walkspeed || 14;
    const aimwalkmult = weaponData.aimwalkspeedmult || 0.7;
    const aimWalkSpeed = walkspeed * aimwalkmult;

    return { rpm, btk, ttkMs, adsMs, sprintMs, aimWalkSpeed };
}

function dominates(a: number[], b: number[]): boolean {
    let strictlyBetter = false;
    const eps = 1e-6;
    for (let i = 0; i < a.length; i++) {
        if (a[i] > b[i] + eps) return false;
        if (a[i] < b[i] - eps) strictlyBetter = true;
    }
    return strictlyBetter;
}

function computeFrontier(candidates: DetailedCandidate[], getVec: (c: DetailedCandidate) => number[]): DetailedCandidate[] {
    const vectors = candidates.map(getVec);
    const frontier: DetailedCandidate[] = [];
    for (let i = 0; i < candidates.length; i++) {
        let isDominated = false;
        for (let j = 0; j < candidates.length; j++) {
            if (i === j) continue;
            if (dominates(vectors[j], vectors[i])) {
                isDominated = true;
                break;
            }
        }
        if (!isDominated) {
            frontier.push(candidates[i]);
        }
    }
    return frontier;
}

// Select by role from a set of evaluations
function runRoleSelection(
    engine: RecommendationEngine,
    pool: CandidateEvaluation[],
    roleFrontiers?: {
        overall?: CandidateEvaluation[];
        vertical?: CandidateEvaluation[];
        horizontal?: CandidateEvaluation[];
    }
) {
    const oFrontier = roleFrontiers?.overall ?? computeParetoFrontier(pool, 'overall');
    const vFrontier = roleFrontiers?.vertical ?? computeParetoFrontier(pool, 'vertical');
    const hFrontier = roleFrontiers?.horizontal ?? computeParetoFrontier(pool, 'horizontal');

    return engine.selectByRole(pool, oFrontier, vFrontier, hFrontier);
}

function formatCand(cand: CandidateEvaluation | null): string {
    if (!cand) return 'None';
    const b = cand.attachments.Barrel || 'none';
    const u = cand.attachments.Underbarrel || 'none';
    return `${b} + ${u}`.replace('none + none', 'Stock (None)');
}

async function runPolicyComparison() {
    const engine = new RecommendationEngine();

    for (const weaponId of WEAPONS) {
        console.log('================================================================================');
        console.log(`WEAPON: ${weaponId.toUpperCase()}`);
        console.log('================================================================================');

        const baseCompiled = loadCompiledWeaponData(weaponId, {});
        const basePhys = getPhysics(baseCompiled);
        const profile = getWeaponRecommendationProfile(weaponId);
        const rawCandidates = (engine as any).generateCandidates(profile);

        const evals = engine.evaluateCandidates(weaponId, {}, rawCandidates, {
            masterSeed: 2026,
            explorationTrials: 32,
            targetDistance: 50,
            burstSize: 30
        });

        const stockEval = evals.find(e => Object.keys(e.attachments).length === 0 || canonicalizeAttachments(e.attachments) === '') || evals[0];
        const stockStats = stockEval.statistics;

        const candidateList: DetailedCandidate[] = [];

        for (const cand of rawCandidates) {
            const compiled = loadCompiledWeaponData(weaponId, cand);
            const phys = getPhysics(compiled);
            const id = canonicalizeAttachments(cand) || 'none';
            const ev = evals.find(e => e.id === id);
            if (!ev) continue;

            const stats = ev.statistics;
            const deltaR95 = stats.p95Radius - stockStats.p95Radius;
            const deltaCenteredR95 = stats.centeredP95Radius - stockStats.centeredP95Radius;

            const deltaTtkMs = phys.ttkMs - basePhys.ttkMs;
            const deltaAdsMs = phys.adsMs - basePhys.adsMs;
            const deltaSprintMs = phys.sprintMs - basePhys.sprintMs;
            const deltaAimWalkSpeed = basePhys.aimWalkSpeed - phys.aimWalkSpeed;

            const failedHurdles: string[] = [];
            if (deltaTtkMs >= HURDLES.ttk) failedHurdles.push('TTK');
            if (deltaAdsMs >= HURDLES.ads) failedHurdles.push('ADS');
            if (deltaSprintMs >= HURDLES.sprint) failedHurdles.push('Sprint');
            if (deltaAimWalkSpeed >= HURDLES.walk) failedHurdles.push('AimWalk');

            candidateList.push({
                id,
                weaponId,
                attachments: cand,
                evaluation: ev,
                stats,
                rpm: phys.rpm,
                ttkMs: phys.ttkMs,
                adsMs: phys.adsMs,
                sprintMs: phys.sprintMs,
                aimWalkSpeed: phys.aimWalkSpeed,
                deltaR95,
                deltaCenteredR95,
                deltaTtkMs,
                deltaAdsMs,
                deltaSprintMs,
                deltaAimWalkSpeed,
                hurdlePassed: failedHurdles.length === 0,
                failedHurdles,
                isPareto5D: false,
                isPareto7D: false
            });
        }

        // Compute 5D and 7D Pareto
        const frontier5D = computeFrontier(candidateList, c => [
            c.stats.p95Radius,
            Math.max(0, c.deltaTtkMs),
            Math.max(0, c.deltaAdsMs),
            Math.max(0, c.deltaSprintMs),
            Math.max(0, c.deltaAimWalkSpeed)
        ]);
        const set5D = new Set(frontier5D.map(c => c.id));

        const frontier7D = computeFrontier(candidateList, c => [
            c.stats.p95Radius,
            c.stats.stdX,
            c.stats.stdY,
            Math.max(0, c.deltaTtkMs),
            Math.max(0, c.deltaAdsMs),
            Math.max(0, c.deltaSprintMs),
            Math.max(0, c.deltaAimWalkSpeed)
        ]);
        const set7D = new Set(frontier7D.map(c => c.id));

        candidateList.forEach(c => {
            c.isPareto5D = set5D.has(c.id);
            c.isPareto7D = set7D.has(c.id);
        });

        // -------------------------------------------------------------
        // Policy A: Balanced Hurdle
        // -------------------------------------------------------------
        const poolA = candidateList.filter(c => c.hurdlePassed).map(c => c.evaluation);
        const selA = runRoleSelection(engine, poolA);

        // -------------------------------------------------------------
        // Policy B: Pareto Only (7D non-dominated)
        // -------------------------------------------------------------
        const poolB = candidateList.filter(c => c.isPareto7D).map(c => c.evaluation);
        const selB = runRoleSelection(engine, poolB);

        // -------------------------------------------------------------
        // Policy C: Pareto + Extreme Penalty (7D Pareto + Balanced Hurdle)
        // -------------------------------------------------------------
        const poolC = candidateList.filter(c => c.isPareto7D && c.hurdlePassed).map(c => c.evaluation);
        const selC = runRoleSelection(engine, poolC);

        console.log(`Pool Sizes: Raw=${candidateList.length} | Policy A=${poolA.length} | Policy B=${poolB.length} | Policy C=${poolC.length}\n`);

        console.log('--- RECOMMENDATION RESULTS BY POLICY ---');
        console.log(`[Policy A: Balanced Hurdle]`);
        console.log(`  - Overall:    ${formatCand(selA.overall)}`);
        console.log(`  - Vertical:   ${formatCand(selA.vertical)}`);
        console.log(`  - Horizontal: ${formatCand(selA.horizontal)}`);

        console.log(`[Policy B: Pareto Only]`);
        console.log(`  - Overall:    ${formatCand(selB.overall)}`);
        console.log(`  - Vertical:   ${formatCand(selB.vertical)}`);
        console.log(`  - Horizontal: ${formatCand(selB.horizontal)}`);

        console.log(`[Policy C: Pareto + Extreme Penalty Guard]`);
        console.log(`  - Overall:    ${formatCand(selC.overall)}`);
        console.log(`  - Vertical:   ${formatCand(selC.vertical)}`);
        console.log(`  - Horizontal: ${formatCand(selC.horizontal)}`);
        console.log('\n');

        // Detailed Target Attachments Audit
        console.log('--- TARGET ATTACHMENTS DETAILED AUDIT ---');
        console.log('Candidate | R95 | centR95 | dTTK | dADS | dSprint | dWalk | 5D Par | 7D Par | Pol A | Pol B | Pol C | Role A | Role B | Role C');
        console.log('------------------------------------------------------------------------------------------------------------------------------------------------');

        for (const c of candidateList) {
            const b = c.attachments.Barrel || 'none';
            const u = c.attachments.Underbarrel || 'none';
            const name = `${b} + ${u}`.replace('none + none', 'Stock (None)');

            // Check if it's one of the target attachments requested by user
            let isTarget = false;
            if (weaponId === 'c25' || weaponId === 'm16a3') {
                if (b === 'Muzzle Brake' || b === 'Muffler' || b === 'T-Brake' || b === 'R2 Suppressor' || name.startsWith('Stock')) {
                    if (u === 'none' || u === 'Angled Grip' || u === 'Romanian Grip' || u === 'Stubby Grip') isTarget = true;
                }
            } else if (weaponId === 'm231') {
                if (b === 'Muzzle Brake' || b === 'R2 Suppressor' || b === 'T-Brake' || b === 'Oil Filter' || b === 'none' || name.startsWith('Stock')) {
                    if (u === 'none' || u === 'Romanian Grip' || u === 'Angled Grip') isTarget = true;
                }
            } else if (weaponId === 'ak105') {
                if (b === 'Muzzle Brake' || b === 'T-Brake' || b === 'Compensator' || name.startsWith('Stock')) {
                    if (u === 'none' || u === 'Angled Grip' || u === 'Romanian Grip') isTarget = true;
                }
            }

            if (isTarget) {
                const polAStatus = c.hurdlePassed ? 'PASS' : 'FAIL';
                const polBStatus = c.isPareto7D ? 'PASS' : 'FAIL';
                const polCStatus = (c.isPareto7D && c.hurdlePassed) ? 'PASS' : (c.isPareto7D ? 'FLAG_HURDLE' : 'FAIL_DOM');

                const getRoleStr = (sel: any) => {
                    if (sel.overall?.id === c.id) return 'Overall';
                    if (sel.vertical?.id === c.id) return 'Vertical';
                    if (sel.horizontal?.id === c.id) return 'Horizontal';
                    return '-';
                };

                const rA = getRoleStr(selA);
                const rB = getRoleStr(selB);
                const rC = getRoleStr(selC);

                const r95Str = c.stats.p95Radius.toFixed(2);
                const cR95Str = c.stats.centeredP95Radius.toFixed(2);
                const dTTK = (c.deltaTtkMs > 0 ? '+' : '') + c.deltaTtkMs.toFixed(1);
                const dADS = (c.deltaAdsMs > 0 ? '+' : '') + c.deltaAdsMs.toFixed(1);
                const dSp = (c.deltaSprintMs > 0 ? '+' : '') + c.deltaSprintMs.toFixed(1);
                const dW = c.deltaAimWalkSpeed.toFixed(2);
                const p5 = c.isPareto5D ? 'YES' : 'NO';
                const p7 = c.isPareto7D ? 'YES' : 'NO';

                console.log(
                    `${name.padEnd(25)} | ${r95Str.padStart(5)} | ${cR95Str.padStart(7)} | ${dTTK.padStart(5)} | ${dADS.padStart(5)} | ${dSp.padStart(7)} | ${dW.padStart(5)} | ${p5.padStart(6)} | ${p7.padStart(6)} | ${polAStatus.padStart(5)} | ${polBStatus.padStart(5)} | ${polCStatus.padEnd(11)} | ${rA.padEnd(7)} | ${rB.padEnd(7)} | ${rC.padEnd(7)}`
                );
            }
        }
        console.log('\n');
    }
}

runPolicyComparison().catch(err => {
    console.error(err);
    process.exit(1);
});
