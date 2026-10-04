import * as fs from 'fs';
import * as path from 'path';
import { WeaponsParser, WeaponCompiler } from '../src/core';
import rawWeaponsData from '../data/raw/weapons.json';
import { RecommendationEngine } from '../src/recommendation/RecommendationEngine';
import { getWeaponRecommendationProfile } from '../src/recommendation/WeaponRecommendationProfiles';

const HURDLES = {
    ttk: 20.0,
    ads: 35.0,
    sprint: 45.0,
    walk: 1.1
};

const FIREARM_CATEGORIES = new Set([
    'ASSAULT RIFLE',
    'CARBINE',
    'BATTLE RIFLE',
    'PDW',
    'DMR',
    'LMG',
    'SNIPER RIFLE',
    'SHOTGUN',
    'PISTOLS',
    'MACHINE PISTOLS',
    'REVOLVERS',
    'OTHER'
]);

function getPhysics(data: any) {
    const rpm = data.firerate || data.rpm || 800;
    const damage0 = data.damage0 || 30;
    const btk = Math.ceil(100 / damage0);
    const shotIntervalMs = 60000 / rpm;
    const ttkMs = (btk - 1) * shotIntervalMs;

    const aimspeed = data.aimspeed || 16;
    const adsMs = 4743.8645 / aimspeed;

    const sprintspeed = data.sprintspeed || 14;
    const sprintMs = 4015.0 / sprintspeed;

    const walkspeed = data.walkspeed || 14;
    const aimwalkmult = data.aimwalkspeedmult || 0.7;
    const aimWalkSpeed = walkspeed * aimwalkmult;

    return { rpm, damage0, btk, ttkMs, adsMs, sprintMs, aimWalkSpeed, aimspeed, sprintspeed };
}

interface WeaponAuditSummary {
    id: string;
    name: string;
    category: string;
    total: number;
    passed: number;
    eliminated: number;
    elimRate: number;
    failReasons: {
        ttkOnly: number;
        adsOnly: number;
        sprintOnly: number;
        walkOnly: number;
        multi: number;
    };
    baseAimspeed: number;
    baseSprintspeed: number;
    baseRpm: number;
}

interface ExcessTracker {
    min: number;
    max: number;
    sum: number;
    count: number;
}

function updateExcess(tracker: ExcessTracker, excess: number) {
    if (excess < tracker.min) tracker.min = excess;
    if (excess > tracker.max) tracker.max = excess;
    tracker.sum += excess;
    tracker.count++;
}

async function runGlobalGuardAudit() {
    console.log('Starting Global Practicality Guard Audit across entire weapon repository...\n');
    const startTime = Date.now();

    const parser = new WeaponsParser();
    const parseResult = parser.parse(rawWeaponsData);
    const engine = new RecommendationEngine();
    const compiler = new WeaponCompiler();
    const detailsDir = path.resolve(__dirname, '../data/raw/weapon-details');

    const weaponSummaries: WeaponAuditSummary[] = [];
    const attachmentMap: Record<string, { total: number, eliminated: number, reasons: Set<string>, weaponsSeen: Set<string>, weaponsFailed: Set<string> }> = {};
    const categoryMap: Record<string, { weapons: number, totalCands: number, eliminated: number }> = {};

    const excessTTK: ExcessTracker = { min: Infinity, max: -Infinity, sum: 0, count: 0 };
    const excessADS: ExcessTracker = { min: Infinity, max: -Infinity, sum: 0, count: 0 };
    const excessSprint: ExcessTracker = { min: Infinity, max: -Infinity, sum: 0, count: 0 };
    const excessWalk: ExcessTracker = { min: Infinity, max: -Infinity, sum: 0, count: 0 };

    let totalWeaponsEvaluated = 0;
    let totalCombinationsEvaluated = 0;
    let totalCombinationsEliminated = 0;

    const firstReasonCounts = {
        TTK: 0,
        ADS: 0,
        Sprint: 0,
        AimWalk: 0,
        Multi: 0
    };

    const targetWeaponIds = Array.from(parseResult.weapons.keys()).filter(id => {
        const w = parseResult.weapons.get(id)!;
        const cat = w.category || 'UNKNOWN';
        if (!FIREARM_CATEGORIES.has(cat)) return false;
        const detailPath = path.join(detailsDir, `${id}.json`);
        return fs.existsSync(detailPath);
    });

    console.log(`Found ${targetWeaponIds.length} valid firearms with detailed data.\n`);

    for (let wIdx = 0; wIdx < targetWeaponIds.length; wIdx++) {
        const id = targetWeaponIds[wIdx];
        const norm = parseResult.weapons.get(id)!;
        const cat = norm.category || 'OTHER';
        const detailPath = path.join(detailsDir, `${id}.json`);

        let baseData: any;
        try {
            baseData = JSON.parse(fs.readFileSync(detailPath, 'utf-8'));
        } catch (e) {
            continue;
        }

        const basePhys = getPhysics(baseData);
        const profile = getWeaponRecommendationProfile(id);
        const rawCandidates = (engine as any).generateCandidates(profile);

        if (!categoryMap[cat]) categoryMap[cat] = { weapons: 0, totalCands: 0, eliminated: 0 };
        categoryMap[cat].weapons++;
        categoryMap[cat].totalCands += rawCandidates.length;

        const wSummary: WeaponAuditSummary = {
            id,
            name: norm.displayName || norm.name || id,
            category: cat,
            total: rawCandidates.length,
            passed: 0,
            eliminated: 0,
            elimRate: 0,
            failReasons: { ttkOnly: 0, adsOnly: 0, sprintOnly: 0, walkOnly: 0, multi: 0 },
            baseAimspeed: basePhys.aimspeed,
            baseSprintspeed: basePhys.sprintspeed,
            baseRpm: basePhys.rpm
        };

        totalWeaponsEvaluated++;
        totalCombinationsEvaluated += rawCandidates.length;

        for (const cand of rawCandidates) {
            // Track attachment occurrences
            for (const [slot, rawAttName] of Object.entries(cand)) {
                if (!rawAttName) continue;
                const attName = rawAttName as string;
                if (!attachmentMap[attName]) {
                    attachmentMap[attName] = { total: 0, eliminated: 0, reasons: new Set(), weaponsSeen: new Set(), weaponsFailed: new Set() };
                }
                attachmentMap[attName].total++;
                attachmentMap[attName].weaponsSeen.add(id);
            }

            const compiled = compiler.compileWeapon(norm, cand, parseResult.attachments, baseData);
            const phys = getPhysics(compiled.compiledWeaponData);

            const deltaTtk = phys.ttkMs - basePhys.ttkMs;
            const deltaAds = phys.adsMs - basePhys.adsMs;
            const deltaSprint = phys.sprintMs - basePhys.sprintMs;
            const deltaWalk = basePhys.aimWalkSpeed - phys.aimWalkSpeed;

            const fails: string[] = [];
            if (deltaTtk >= HURDLES.ttk) {
                fails.push('TTK');
                updateExcess(excessTTK, deltaTtk - HURDLES.ttk);
            }
            if (deltaAds >= HURDLES.ads) {
                fails.push('ADS');
                updateExcess(excessADS, deltaAds - HURDLES.ads);
            }
            if (deltaSprint >= HURDLES.sprint) {
                fails.push('Sprint');
                updateExcess(excessSprint, deltaSprint - HURDLES.sprint);
            }
            if (deltaWalk >= HURDLES.walk) {
                fails.push('AimWalk');
                updateExcess(excessWalk, deltaWalk - HURDLES.walk);
            }

            if (fails.length === 0) {
                wSummary.passed++;
            } else {
                wSummary.eliminated++;
                totalCombinationsEliminated++;
                categoryMap[cat].eliminated++;

                if (fails.length > 1) {
                    wSummary.failReasons.multi++;
                    firstReasonCounts.Multi++;
                } else if (fails[0] === 'TTK') {
                    wSummary.failReasons.ttkOnly++;
                    firstReasonCounts.TTK++;
                } else if (fails[0] === 'ADS') {
                    wSummary.failReasons.adsOnly++;
                    firstReasonCounts.ADS++;
                } else if (fails[0] === 'Sprint') {
                    wSummary.failReasons.sprintOnly++;
                    firstReasonCounts.Sprint++;
                } else if (fails[0] === 'AimWalk') {
                    wSummary.failReasons.walkOnly++;
                    firstReasonCounts.AimWalk++;
                }

                for (const [slot, rawAttName] of Object.entries(cand)) {
                    if (!rawAttName) continue;
                    const attName = rawAttName as string;
                    attachmentMap[attName].eliminated++;
                    attachmentMap[attName].weaponsFailed.add(id);
                    fails.forEach(f => attachmentMap[attName].reasons.add(f));
                }
            }
        }

        wSummary.elimRate = wSummary.total > 0 ? (wSummary.eliminated / wSummary.total) * 100 : 0;
        weaponSummaries.push(wSummary);

        if ((wIdx + 1) % 50 === 0 || wIdx === targetWeaponIds.length - 1) {
            console.log(`Evaluated ${wIdx + 1}/${targetWeaponIds.length} weapons (${totalCombinationsEvaluated} candidate combinations)...`);
        }
    }

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nAudit completed in ${elapsedSeconds} seconds.\n`);

    // =========================================================================
    // OUTPUT 1, 2, 3: OVERALL SUMMARY
    // =========================================================================
    console.log('================================================================================');
    console.log('1. OVERALL METRICS SUMMARY');
    console.log('================================================================================');
    console.log(`Total Weapons Evaluated: ${totalWeaponsEvaluated}`);
    console.log(`Total Candidate Combinations: ${totalCombinationsEvaluated}`);
    console.log(`Total Guard Eliminated Combinations: ${totalCombinationsEliminated} (${((totalCombinationsEliminated / totalCombinationsEvaluated) * 100).toFixed(2)}%)`);
    console.log(`Total Passing Combinations: ${totalCombinationsEvaluated - totalCombinationsEliminated} (${(((totalCombinationsEvaluated - totalCombinationsEliminated) / totalCombinationsEvaluated) * 100).toFixed(2)}%)\n`);

    // =========================================================================
    // OUTPUT 6: FAILURE REASONS BREAKDOWN
    // =========================================================================
    console.log('================================================================================');
    console.log('2. GUARD PENALTY TYPE BREAKDOWN (Trigger counts)');
    console.log('================================================================================');
    console.log(`- Sprint Hurdle Only: ${firstReasonCounts.Sprint} (${((firstReasonCounts.Sprint / totalCombinationsEliminated) * 100).toFixed(1)}%)`);
    console.log(`- ADS Hurdle Only:    ${firstReasonCounts.ADS} (${((firstReasonCounts.ADS / totalCombinationsEliminated) * 100).toFixed(1)}%)`);
    console.log(`- TTK Hurdle Only:    ${firstReasonCounts.TTK} (${((firstReasonCounts.TTK / totalCombinationsEliminated) * 100).toFixed(1)}%)`);
    console.log(`- AimWalk Only:       ${firstReasonCounts.AimWalk} (${((firstReasonCounts.AimWalk / totalCombinationsEliminated) * 100).toFixed(1)}%)`);
    console.log(`- Multi-Hurdle Fail:  ${firstReasonCounts.Multi} (${((firstReasonCounts.Multi / totalCombinationsEliminated) * 100).toFixed(1)}%)\n`);

    // =========================================================================
    // OUTPUT 7: EXCESS AMOUNTS (MIN, MAX, AVG)
    // =========================================================================
    console.log('================================================================================');
    console.log('3. PENALTY EXCESS DISTRIBUTION (Amount beyond Threshold)');
    console.log('================================================================================');
    console.log(`- TTK Excess (Thresh 20ms):    Min: +${excessTTK.min.toFixed(2)}ms | Max: +${excessTTK.max.toFixed(2)}ms | Avg: +${(excessTTK.sum / (excessTTK.count || 1)).toFixed(2)}ms (Count: ${excessTTK.count})`);
    console.log(`- ADS Excess (Thresh 35ms):    Min: +${excessADS.min.toFixed(2)}ms | Max: +${excessADS.max.toFixed(2)}ms | Avg: +${(excessADS.sum / (excessADS.count || 1)).toFixed(2)}ms (Count: ${excessADS.count})`);
    console.log(`- Sprint Excess (Thresh 45ms): Min: +${excessSprint.min.toFixed(2)}ms | Max: +${excessSprint.max.toFixed(2)}ms | Avg: +${(excessSprint.sum / (excessSprint.count || 1)).toFixed(2)}ms (Count: ${excessSprint.count})`);
    console.log(`- AimWalk Excess (Thresh 1.1): Min: +${excessWalk.min.toFixed(2)}s/s | Max: +${excessWalk.max.toFixed(2)}s/s | Avg: +${(excessWalk.sum / (excessWalk.count || 1)).toFixed(2)}s/s (Count: ${excessWalk.count})\n`);

    // =========================================================================
    // OUTPUT 9: CATEGORY BREAKDOWN
    // =========================================================================
    console.log('================================================================================');
    console.log('4. WEAPON CATEGORY DISTRIBUTION');
    console.log('================================================================================');
    const catRows = Object.entries(categoryMap).map(([cat, data]) => ({
        Category: cat,
        Weapons: data.weapons,
        TotalCandidates: data.totalCands,
        Eliminated: data.eliminated,
        EliminationRate: `${((data.eliminated / data.totalCands) * 100).toFixed(1)}%`,
        AvgPoolPerWeapon: Math.round(data.totalCands / data.weapons)
    })).sort((a, b) => parseFloat(b.EliminationRate) - parseFloat(a.EliminationRate));
    console.table(catRows);

    // =========================================================================
    // OUTPUT 8: PECULIAR WEAPONS (TOP ELIMINATED, EMPTY, CRITICAL)
    // =========================================================================
    console.log('\n================================================================================');
    console.log('5. PECULIAR & EXTREME WEAPONS AUDIT');
    console.log('================================================================================');

    const emptyPoolWeapons = weaponSummaries.filter(w => w.passed === 0);
    const criticalPoolWeapons = weaponSummaries.filter(w => w.passed > 0 && w.passed <= 3);
    const topEliminatedWeapons = [...weaponSummaries].sort((a, b) => b.elimRate - a.elimRate).slice(0, 15);
    const zeroElimWeapons = weaponSummaries.filter(w => w.eliminated === 0);

    console.log(`- Empty Pool Weapons (0 remaining): ${emptyPoolWeapons.length}`);
    if (emptyPoolWeapons.length > 0) {
        console.log(`  Weapons: ${emptyPoolWeapons.map(w => `${w.name} (${w.category})`).join(', ')}`);
    }

    console.log(`- Critical Pool Weapons (1~3 remaining): ${criticalPoolWeapons.length}`);
    if (criticalPoolWeapons.length > 0) {
        console.log(`  Weapons: ${criticalPoolWeapons.map(w => `${w.name} (${w.passed}/${w.total} left)`).join(', ')}`);
    }

    console.log(`- Weapons with 0% Elimination (All candidates pass): ${zeroElimWeapons.length}`);

    console.log('\nTop 15 Weapons by Elimination Rate:');
    console.table(topEliminatedWeapons.map(w => ({
        Weapon: w.name,
        Category: w.category,
        Total: w.total,
        Passed: w.passed,
        Eliminated: w.eliminated,
        ElimRate: `${w.elimRate.toFixed(1)}%`,
        BaseAimspeed: w.baseAimspeed,
        BaseSprintspeed: w.baseSprintspeed,
        FailReasons: `TTK:${w.failReasons.ttkOnly}, ADS:${w.failReasons.adsOnly}, Sp:${w.failReasons.sprintOnly}, Multi:${w.failReasons.multi}`
    })));

    // =========================================================================
    // OUTPUT 5: ATTACHMENT ELIMINATION AUDIT
    // =========================================================================
    console.log('\n================================================================================');
    console.log('6. ATTACHMENT AUDIT (Universal vs Conditional Failure)');
    console.log('================================================================================');

    const attList = Object.entries(attachmentMap).map(([name, data]) => ({
        Attachment: name,
        TotalSeen: data.total,
        Eliminated: data.eliminated,
        ElimRate: (data.eliminated / data.total) * 100,
        WeaponsSeen: data.weaponsSeen.size,
        WeaponsFailed: data.weaponsFailed.size,
        FailRateAcrossWeapons: `${((data.weaponsFailed.size / data.weaponsSeen.size) * 100).toFixed(1)}%`,
        Reasons: Array.from(data.reasons).join(',')
    })).filter(a => a.TotalSeen >= 50); // Filter out obscure or weapon-unique attachments for summary

    // Universal Failures (>= 90% elimination rate)
    const universalFails = attList.filter(a => a.ElimRate >= 80).sort((a, b) => b.ElimRate - a.ElimRate);
    console.log('Universal / High-Rate Elimination Attachments (Elim Rate >= 80%):');
    console.table(universalFails.map(a => ({
        Attachment: a.Attachment,
        TotalAppearances: a.TotalSeen,
        ElimRate: `${a.ElimRate.toFixed(1)}%`,
        WeaponsFailed: `${a.WeaponsFailed}/${a.WeaponsSeen}`,
        Reasons: a.Reasons
    })));

    // Contextual / Weapon-Specific Failures (10% ~ 70% elimination rate)
    const contextualFails = attList.filter(a => a.ElimRate >= 10 && a.ElimRate < 80).sort((a, b) => b.ElimRate - a.ElimRate);
    console.log('\nContextual / Weapon-Specific Attachments (Elim Rate 10% ~ 80%):');
    console.table(contextualFails.map(a => ({
        Attachment: a.Attachment,
        TotalAppearances: a.TotalSeen,
        ElimRate: `${a.ElimRate.toFixed(1)}%`,
        WeaponsFailed: `${a.WeaponsFailed}/${a.WeaponsSeen}`,
        Reasons: a.Reasons
    })));
}

runGlobalGuardAudit().catch(err => {
    console.error(err);
    process.exit(1);
});
