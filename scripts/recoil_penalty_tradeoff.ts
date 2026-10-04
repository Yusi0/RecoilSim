import { RecommendationEngine } from '../src/recommendation/RecommendationEngine';
import { getWeaponRecommendationProfile } from '../src/recommendation/WeaponRecommendationProfiles';
import { loadCompiledWeaponData } from '../src/app/c25DataLoader';
import { canonicalizeAttachments } from '../src/recommendation/RecommendationCache';
import { DispersionStatistics } from '../src/montecarlo/MonteCarloTypes';

interface CandidateEvaluationFull {
    id: string;
    weaponId: string;
    attachments: Record<string, string>;
    stats: DispersionStatistics;
    rpm: number;
    ttkMs: number;
    adsMs: number;
    sprintMs: number;
    aimWalkSpeed: number;
    // Deltas vs stock
    deltaR95: number;
    deltaCenteredR95: number;
    deltaMeanRadius: number;
    deltaSigmaX: number;
    deltaSigmaY: number;
    // Penalty deltas vs stock
    deltaTtkMs: number;
    deltaAdsMs: number;
    deltaSprintMs: number;
    deltaAimWalkSpeed: number;
    // Hurdle status
    hurdlePassed: boolean;
    failedHurdles: string[];
    // Pareto statuses
    isPareto5D_R95: boolean;
    isPareto5D_Centered: boolean;
    isPareto7D: boolean;
    pairwiseParetoKeys: string[];
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
    const adsMs = 4743.8645 / aimspeed; // sightaimspring d=1.0

    const sprintspeed = weaponData.sprintspeed || 14;
    const sprintMs = 4015.0 / sprintspeed; // sprintspring d=0.90

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

function computeFrontierIndices(objectiveVectors: number[][]): boolean[] {
    const n = objectiveVectors.length;
    const isOptimal = new Array<boolean>(n).fill(true);

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            if (dominates(objectiveVectors[j], objectiveVectors[i])) {
                isOptimal[i] = false;
                break;
            }
        }
    }
    return isOptimal;
}

async function runTradeoffAnalysis() {
    console.log('Running Monte Carlo Recoil & Penalty Trade-off Analysis across weapons...\n');
    const engine = new RecommendationEngine();

    for (const weaponId of WEAPONS) {
        console.log(`================================================================================`);
        console.log(`WEAPON: ${weaponId.toUpperCase()}`);
        console.log(`================================================================================`);

        const baseCompiled = loadCompiledWeaponData(weaponId, {});
        const basePhys = getPhysics(baseCompiled);
        const profile = getWeaponRecommendationProfile(weaponId);
        const rawCandidates = (engine as any).generateCandidates(profile);

        // Run Monte Carlo evaluation (32 trials with CRN seed 2026, identical to production exploration)
        const evals = engine.evaluateCandidates(weaponId, {}, rawCandidates, {
            masterSeed: 2026,
            explorationTrials: 32,
            targetDistance: 50,
            burstSize: 30
        });

        // Find stock evaluation
        const stockEval = evals.find(e => Object.keys(e.attachments).length === 0 || canonicalizeAttachments(e.attachments) === '') || evals[0];
        const stockStats = stockEval.statistics;

        const candidateList: CandidateEvaluationFull[] = [];

        for (const cand of rawCandidates) {
            const compiled = loadCompiledWeaponData(weaponId, cand);
            const phys = getPhysics(compiled);
            const id = canonicalizeAttachments(cand) || 'none';
            const ev = evals.find(e => e.id === id);
            if (!ev) continue;

            const stats = ev.statistics;

            // Recoil Deltas vs Stock (Negative = Improvement)
            const deltaR95 = stats.p95Radius - stockStats.p95Radius;
            const deltaCenteredR95 = stats.centeredP95Radius - stockStats.centeredP95Radius;
            const deltaMeanRadius = stats.meanRadius - stockStats.meanRadius;
            const deltaSigmaX = stats.stdX - stockStats.stdX;
            const deltaSigmaY = stats.stdY - stockStats.stdY;

            // Penalty Deltas vs Stock (Positive = Penalty)
            const deltaTtkMs = phys.ttkMs - basePhys.ttkMs;
            const deltaAdsMs = phys.adsMs - basePhys.adsMs;
            const deltaSprintMs = phys.sprintMs - basePhys.sprintMs;
            const deltaAimWalkSpeed = basePhys.aimWalkSpeed - phys.aimWalkSpeed;

            // Hurdle verification
            const failedHurdles: string[] = [];
            if (deltaTtkMs >= HURDLES.ttk) failedHurdles.push('TTK');
            if (deltaAdsMs >= HURDLES.ads) failedHurdles.push('ADS');
            if (deltaSprintMs >= HURDLES.sprint) failedHurdles.push('Sprint');
            if (deltaAimWalkSpeed >= HURDLES.walk) failedHurdles.push('AimWalk');

            candidateList.push({
                id,
                weaponId,
                attachments: cand,
                stats,
                rpm: phys.rpm,
                ttkMs: phys.ttkMs,
                adsMs: phys.adsMs,
                sprintMs: phys.sprintMs,
                aimWalkSpeed: phys.aimWalkSpeed,
                deltaR95,
                deltaCenteredR95,
                deltaMeanRadius,
                deltaSigmaX,
                deltaSigmaY,
                deltaTtkMs,
                deltaAdsMs,
                deltaSprintMs,
                deltaAimWalkSpeed,
                hurdlePassed: failedHurdles.length === 0,
                failedHurdles,
                isPareto5D_R95: false,
                isPareto5D_Centered: false,
                isPareto7D: false,
                pairwiseParetoKeys: []
            });
        }

        // Pareto Analysis 1: 5D (R95 + 4 penalties)
        // Objectives to minimize: [stats.p95Radius, deltaTtkMs, deltaAdsMs, deltaSprintMs, deltaAimWalkSpeed]
        const vec5D_R95 = candidateList.map(c => [
            c.stats.p95Radius,
            Math.max(0, c.deltaTtkMs),
            Math.max(0, c.deltaAdsMs),
            Math.max(0, c.deltaSprintMs),
            Math.max(0, c.deltaAimWalkSpeed)
        ]);
        const frontier5D_R95 = computeFrontierIndices(vec5D_R95);

        // Pareto Analysis 2: 5D (centeredR95 + 4 penalties)
        const vec5D_Centered = candidateList.map(c => [
            c.stats.centeredP95Radius,
            Math.max(0, c.deltaTtkMs),
            Math.max(0, c.deltaAdsMs),
            Math.max(0, c.deltaSprintMs),
            Math.max(0, c.deltaAimWalkSpeed)
        ]);
        const frontier5D_Centered = computeFrontierIndices(vec5D_Centered);

        // Pareto Analysis 3: 7D (R95, sigmaX, sigmaY, 4 penalties)
        const vec7D = candidateList.map(c => [
            c.stats.p95Radius,
            c.stats.stdX,
            c.stats.stdY,
            Math.max(0, c.deltaTtkMs),
            Math.max(0, c.deltaAdsMs),
            Math.max(0, c.deltaSprintMs),
            Math.max(0, c.deltaAimWalkSpeed)
        ]);
        const frontier7D = computeFrontierIndices(vec7D);

        // Pairwise 2D Frontiers
        const pairs: Array<{ name: string, getVec: (c: CandidateEvaluationFull) => number[] }> = [
            { name: 'R95 vs TTK', getVec: c => [c.stats.p95Radius, Math.max(0, c.deltaTtkMs)] },
            { name: 'R95 vs ADS', getVec: c => [c.stats.p95Radius, Math.max(0, c.deltaAdsMs)] },
            { name: 'R95 vs Sprint', getVec: c => [c.stats.p95Radius, Math.max(0, c.deltaSprintMs)] },
            { name: 'Centered vs TTK', getVec: c => [c.stats.centeredP95Radius, Math.max(0, c.deltaTtkMs)] },
            { name: 'Centered vs Sprint', getVec: c => [c.stats.centeredP95Radius, Math.max(0, c.deltaSprintMs)] }
        ];

        const pairResults: Record<string, boolean[]> = {};
        for (const p of pairs) {
            pairResults[p.name] = computeFrontierIndices(candidateList.map(p.getVec));
        }

        for (let i = 0; i < candidateList.length; i++) {
            const c = candidateList[i];
            c.isPareto5D_R95 = frontier5D_R95[i];
            c.isPareto5D_Centered = frontier5D_Centered[i];
            c.isPareto7D = frontier7D[i];
            for (const p of pairs) {
                if (pairResults[p.name][i]) {
                    c.pairwiseParetoKeys.push(p.name);
                }
            }
        }

        console.log(`Stock Recoil: R95=${stockStats.p95Radius.toFixed(2)}, CenteredR95=${stockStats.centeredP95Radius.toFixed(2)}, meanR=${stockStats.meanRadius.toFixed(2)}, stdX=${stockStats.stdX.toFixed(2)}, stdY=${stockStats.stdY.toFixed(2)}`);
        console.log(`Total Candidates: ${candidateList.length} | 5D-R95 Frontier: ${candidateList.filter(c => c.isPareto5D_R95).length} | 5D-Centered Frontier: ${candidateList.filter(c => c.isPareto5D_Centered).length} | 7D Frontier: ${candidateList.filter(c => c.isPareto7D).length}`);
        console.log(`Balanced Hurdle Passed: ${candidateList.filter(c => c.hurdlePassed).length} | Failed: ${candidateList.filter(c => !c.hurdlePassed).length}\n`);

        // Print Key Table in Requested Format
        console.log(`Summary Table: ${weaponId.toUpperCase()}`);
        console.log('------------------------------------------------------------------------------------------------------------------------------------------------');
        console.log(`Candidate | ΔR95 | ΔCenteredR95 | ΔTTK | ΔADS | ΔSprint | ΔAimWalk | Balanced Hurdle | Pareto status`);
        console.log('------------------------------------------------------------------------------------------------------------------------------------------------');

        // We sort candidate list: Stock first, then key attachments (Muffler / Oil Filter / Romanian), then best recoil improvements
        const keyCandidates = candidateList.sort((a, b) => {
            const aIsStock = a.id === 'none';
            const bIsStock = b.id === 'none';
            if (aIsStock) return -1;
            if (bIsStock) return 1;
            return a.deltaR95 - b.deltaR95;
        });

        for (const c of keyCandidates) {
            const b = c.attachments.Barrel || 'none';
            const u = c.attachments.Underbarrel || 'none';
            const name = `${b} + ${u}`.replace('none + none', 'Stock (None)');

            const hurdleStr = c.hurdlePassed ? 'PASS' : `FAIL (${c.failedHurdles.join(',')})`;
            let paretoStr = 'Dominated';
            if (c.isPareto5D_R95 && c.isPareto5D_Centered) {
                paretoStr = 'Optimal (5D All)';
            } else if (c.isPareto5D_R95) {
                paretoStr = 'Optimal (5D-R95)';
            } else if (c.isPareto5D_Centered) {
                paretoStr = 'Optimal (5D-Cent)';
            } else if (c.isPareto7D) {
                paretoStr = 'Optimal (7D Multi)';
            } else if (c.pairwiseParetoKeys.length > 0) {
                paretoStr = `Pairwise (${c.pairwiseParetoKeys[0]})`;
            }

            // Print only representative/interesting ones if list is huge, or all if moderate
            const isInteresting = c.id === 'none' ||
                                  !c.hurdlePassed ||
                                  c.isPareto5D_R95 ||
                                  c.isPareto5D_Centered ||
                                  name.includes('Muffler') ||
                                  name.includes('Oil Filter') ||
                                  name.includes('Romanian') ||
                                  name.includes('Compensator') ||
                                  name.includes('Muzzle Brake') ||
                                  name.includes('Stubby') ||
                                  name.includes('Angled');

            if (isInteresting) {
                const dR95Str = (c.deltaR95 > 0 ? '+' : '') + c.deltaR95.toFixed(2);
                const dCentStr = (c.deltaCenteredR95 > 0 ? '+' : '') + c.deltaCenteredR95.toFixed(2);
                const dTTKStr = (c.deltaTtkMs > 0 ? '+' : '') + c.deltaTtkMs.toFixed(1) + 'ms';
                const dADSStr = (c.deltaAdsMs > 0 ? '+' : '') + c.deltaAdsMs.toFixed(1) + 'ms';
                const dSpStr = (c.deltaSprintMs > 0 ? '+' : '') + c.deltaSprintMs.toFixed(1) + 'ms';
                const dWStr = (c.deltaAimWalkSpeed > 0 ? '+' : '') + c.deltaAimWalkSpeed.toFixed(2);

                console.log(`${name.padEnd(32)} | ${dR95Str.padStart(6)} | ${dCentStr.padStart(12)} | ${dTTKStr.padStart(7)} | ${dADSStr.padStart(7)} | ${dSpStr.padStart(8)} | ${dWStr.padStart(8)} | ${hurdleStr.padEnd(15)} | ${paretoStr}`);
            }
        }
        console.log('\n');
    }
}

runTradeoffAnalysis().catch(err => {
    console.error(err);
    process.exit(1);
});
