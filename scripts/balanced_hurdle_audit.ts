import { RecommendationEngine } from '../src/recommendation/RecommendationEngine';
import { getWeaponRecommendationProfile } from '../src/recommendation/WeaponRecommendationProfiles';
import { loadCompiledWeaponData } from '../src/app/c25DataLoader';
import { canonicalizeAttachments } from '../src/recommendation/RecommendationCache';

interface CandidatePhysics {
    id: string;
    weaponId: string;
    attachments: Record<string, string>;
    rpm: number;
    deltaTtkMs: number;
    deltaAdsMs: number;
    deltaSprintMs: number;
    deltaAimWalkSpeed: number;
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

async function runAudit() {
    const engine = new RecommendationEngine();
    const allCandidates: CandidatePhysics[] = [];

    for (const weaponId of WEAPONS) {
        const baseData = loadCompiledWeaponData(weaponId, {});
        const basePhys = getPhysics(baseData);
        const profile = getWeaponRecommendationProfile(weaponId);
        const rawCandidates = (engine as any).generateCandidates(profile);

        for (const cand of rawCandidates) {
            const compiled = loadCompiledWeaponData(weaponId, cand);
            const phys = getPhysics(compiled);
            const id = canonicalizeAttachments(cand) || 'none';

            allCandidates.push({
                id,
                weaponId,
                attachments: cand,
                rpm: phys.rpm,
                deltaTtkMs: phys.ttkMs - basePhys.ttkMs,
                deltaAdsMs: phys.adsMs - basePhys.adsMs,
                deltaSprintMs: phys.sprintMs - basePhys.sprintMs,
                deltaAimWalkSpeed: basePhys.aimWalkSpeed - phys.aimWalkSpeed // positive = penalty (speed lost)
            });
        }
    }

    console.log(`Loaded ${allCandidates.length} total candidate combinations across ${WEAPONS.join(', ')}.\n`);

    // 1. Boundary Candidates (within +/- 10% of each threshold)
    console.log('================================================================================');
    console.log('1. CANDIDATES WITHIN +/- 10% OF BALANCED THRESHOLDS');
    console.log('================================================================================');
    console.log(`- TTK Range: [${HURDLES.ttk * 0.9}, ${HURDLES.ttk * 1.1}] ms`);
    console.log(`- ADS Range: [${HURDLES.ads * 0.9}, ${HURDLES.ads * 1.1}] ms`);
    console.log(`- Sprint Range: [${HURDLES.sprint * 0.9}, ${HURDLES.sprint * 1.1}] ms`);
    console.log(`- AimWalk Range: [${(HURDLES.walk * 0.9).toFixed(3)}, ${(HURDLES.walk * 1.1).toFixed(3)}] studs/s\n`);

    const boundaryCandidates = allCandidates.filter(c => {
        const inTtk = c.deltaTtkMs >= HURDLES.ttk * 0.9 && c.deltaTtkMs <= HURDLES.ttk * 1.1;
        const inAds = c.deltaAdsMs >= HURDLES.ads * 0.9 && c.deltaAdsMs <= HURDLES.ads * 1.1;
        const inSprint = c.deltaSprintMs >= HURDLES.sprint * 0.9 && c.deltaSprintMs <= HURDLES.sprint * 1.1;
        const inWalk = c.deltaAimWalkSpeed >= HURDLES.walk * 0.9 && c.deltaAimWalkSpeed <= HURDLES.walk * 1.1;
        return inTtk || inAds || inSprint || inWalk;
    });

    if (boundaryCandidates.length === 0) {
        console.log('None! There are NO candidate combinations within +/- 10% of any of the 4 thresholds.');
    } else {
        boundaryCandidates.forEach(c => {
            const failedHurdles: string[] = [];
            if (c.deltaTtkMs >= HURDLES.ttk) failedHurdles.push(`TTK (${c.deltaTtkMs.toFixed(1)}ms >= ${HURDLES.ttk})`);
            if (c.deltaAdsMs >= HURDLES.ads) failedHurdles.push(`ADS (${c.deltaAdsMs.toFixed(1)}ms >= ${HURDLES.ads})`);
            if (c.deltaSprintMs >= HURDLES.sprint) failedHurdles.push(`Sprint (${c.deltaSprintMs.toFixed(1)}ms >= ${HURDLES.sprint})`);
            if (c.deltaAimWalkSpeed >= HURDLES.walk) failedHurdles.push(`Walk (${c.deltaAimWalkSpeed.toFixed(2)} >= ${HURDLES.walk})`);

            console.log(`[${c.weaponId.toUpperCase()}] ${JSON.stringify(c.attachments)}`);
            console.log(`  dTTK: ${c.deltaTtkMs.toFixed(2)} ms | dADS: ${c.deltaAdsMs.toFixed(2)} ms | dSprint: ${c.deltaSprintMs.toFixed(2)} ms | dWalk: ${c.deltaAimWalkSpeed.toFixed(2)} s/s`);
            console.log(`  Failed Hurdles: ${failedHurdles.length > 0 ? failedHurdles.join(', ') : 'NONE (Passed all hurdles)'}`);
        });
    }

    // 2. Full List of Eliminated Candidates
    console.log('\n================================================================================');
    console.log('2. FULL LIST OF ELIMINATED CANDIDATE COMBINATIONS UNDER BALANCED HURDLES');
    console.log('================================================================================');

    const eliminated = allCandidates.filter(c => 
        c.deltaTtkMs >= HURDLES.ttk ||
        c.deltaAdsMs >= HURDLES.ads ||
        c.deltaSprintMs >= HURDLES.sprint ||
        c.deltaAimWalkSpeed >= HURDLES.walk
    );

    console.log(`Total Eliminated: ${eliminated.length} / ${allCandidates.length} (${((eliminated.length / allCandidates.length) * 100).toFixed(1)}%)\n`);

    eliminated.forEach((c, idx) => {
        const violations: Array<{ hurdle: string, val: number, thresh: number, excess: number }> = [];
        if (c.deltaTtkMs >= HURDLES.ttk) {
            violations.push({ hurdle: 'dTTK', val: c.deltaTtkMs, thresh: HURDLES.ttk, excess: c.deltaTtkMs - HURDLES.ttk });
        }
        if (c.deltaAdsMs >= HURDLES.ads) {
            violations.push({ hurdle: 'dADS', val: c.deltaAdsMs, thresh: HURDLES.ads, excess: c.deltaAdsMs - HURDLES.ads });
        }
        if (c.deltaSprintMs >= HURDLES.sprint) {
            violations.push({ hurdle: 'dSprint', val: c.deltaSprintMs, thresh: HURDLES.sprint, excess: c.deltaSprintMs - HURDLES.sprint });
        }
        if (c.deltaAimWalkSpeed >= HURDLES.walk) {
            violations.push({ hurdle: 'dAimWalk', val: c.deltaAimWalkSpeed, thresh: HURDLES.walk, excess: c.deltaAimWalkSpeed - HURDLES.walk });
        }

        const b = c.attachments.Barrel || '(none)';
        const u = c.attachments.Underbarrel || '(none)';
        console.log(`${idx + 1}. [${c.weaponId.toUpperCase()}] Barrel: "${b}", Underbarrel: "${u}"`);
        violations.forEach(v => {
            const unit = v.hurdle === 'dAimWalk' ? 'studs/s' : 'ms';
            console.log(`   - Failed: ${v.hurdle} = ${v.val.toFixed(2)}${unit} (Thresh: ${v.thresh}${unit}, Exceeded by +${v.excess.toFixed(2)}${unit})`);
        });
        console.log(`   [All Stats: dTTK=${c.deltaTtkMs.toFixed(1)}ms, dADS=${c.deltaAdsMs.toFixed(1)}ms, dSprint=${c.deltaSprintMs.toFixed(1)}ms, dWalk=${c.deltaAimWalkSpeed.toFixed(2)}s/s]`);
    });

    // 3. Attachment Distribution Audit
    console.log('\n================================================================================');
    console.log('3. ATTACHMENT DISTRIBUTION & BREAKDOWN');
    console.log('================================================================================');
    const attachmentElimCounts: Record<string, { total: number, eliminated: number, reasons: Set<string> }> = {};

    for (const c of allCandidates) {
        for (const [slot, name] of Object.entries(c.attachments)) {
            if (!attachmentElimCounts[name]) {
                attachmentElimCounts[name] = { total: 0, eliminated: 0, reasons: new Set() };
            }
            attachmentElimCounts[name].total++;
        }
    }

    for (const c of eliminated) {
        for (const [slot, name] of Object.entries(c.attachments)) {
            attachmentElimCounts[name].eliminated++;
            if (c.deltaTtkMs >= HURDLES.ttk) attachmentElimCounts[name].reasons.add('dTTK');
            if (c.deltaAdsMs >= HURDLES.ads) attachmentElimCounts[name].reasons.add('dADS');
            if (c.deltaSprintMs >= HURDLES.sprint) attachmentElimCounts[name].reasons.add('dSprint');
            if (c.deltaAimWalkSpeed >= HURDLES.walk) attachmentElimCounts[name].reasons.add('dAimWalk');
        }
    }

    console.table(Object.entries(attachmentElimCounts).map(([name, data]) => ({
        Attachment: name,
        TotalPresent: data.total,
        EliminatedCount: data.eliminated,
        EliminationRate: `${((data.eliminated / data.total) * 100).toFixed(1)}%`,
        FailedHurdles: Array.from(data.reasons).join(', ') || 'NONE'
    })));
}

runAudit().catch(err => {
    console.error(err);
    process.exit(1);
});
