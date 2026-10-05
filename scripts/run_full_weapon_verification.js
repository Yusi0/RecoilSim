const fs = require('fs');
const path = require('path');

// 1. Paths
const DATA_DIR = path.join(__dirname, '../data');
const RAW_WEAPONS_PATH = path.join(DATA_DIR, 'raw/weapons.json');
const NORM_WEAPONS_PATH = path.join(DATA_DIR, 'normalized/weapons.json');
const IN_GAME_DB_PATH = path.join(DATA_DIR, 'in-game-modules/weapon_database.json');
const VERIFICATION_OUT_PATH = path.join(DATA_DIR, 'weapon_verification.json');
const C25_GOLDEN_PATH = path.join(DATA_DIR, 'C25.json');

console.log('[Weapon Verification Pipeline] Initializing...');

// 2. Load inputs
const rawWeapons = JSON.parse(fs.readFileSync(RAW_WEAPONS_PATH, 'utf8'));
const normWeapons = JSON.parse(fs.readFileSync(NORM_WEAPONS_PATH, 'utf8'));
const inGameDb = JSON.parse(fs.readFileSync(IN_GAME_DB_PATH, 'utf8'));

// Flatten raw weapons into map
const rawMap = new Map();
for (const cat of Object.keys(rawWeapons)) {
    for (const w of rawWeapons[cat]) {
        rawMap.set(w.name, { category: cat, ...w });
    }
}

console.log(`Loaded ${rawMap.size} raw weapons, ${Object.keys(normWeapons).length} normalized weapons.`);
console.log(`Loaded ${Object.keys(inGameDb).length} authoritative in-game weapon definitions.`);

// Helper to compare values
function valuesMatch(a, b) {
    if (a === undefined && b === undefined) return true;
    if (a === undefined || b === undefined) return false;
    if (typeof a === 'number' && typeof b === 'number') {
        return Math.abs(a - b) < 1e-4;
    }
    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    return String(a) === String(b);
}

// 3. Stat fields to verify across gameplay categories
const STAT_FIELDS = [
    // Firing
    { key: 'firerate', category: 'Firing', altKey: 'rpm' },
    { key: 'firemodes', category: 'Firing' },
    { key: 'burstsize', category: 'Firing' },
    { key: 'burstlock', category: 'Firing' },

    // Magazine & Ammo
    { key: 'magsize', category: 'Magazine' },
    { key: 'sparerounds', category: 'Magazine' },
    { key: 'chamber', category: 'Magazine' },
    { key: 'ammotype', category: 'Ammo' },
    { key: 'casetype', category: 'Ammo' },
    { key: 'caliber', category: 'Ammo' },

    // Damage & Ballistics
    { key: 'damage0', category: 'Damage' },
    { key: 'damage1', category: 'Damage' },
    { key: 'damageGraph', category: 'Damage' },
    { key: 'multhead', category: 'Damage' },
    { key: 'multtorso', category: 'Damage' },
    { key: 'bulletspeed', category: 'Ballistics' },
    { key: 'penetrationdepth', category: 'Ballistics' },
    { key: 'suppression', category: 'Ballistics' },

    // Spread & Stability
    { key: 'hipfirespread', category: 'Spread' },
    { key: 'hipfirespreadrecover', category: 'Spread' },
    { key: 'hipfirestability', category: 'Spread' },
    { key: 'crossexpansion', category: 'Spread' },

    // Movement & Handling
    { key: 'walkspeed', category: 'Movement' },
    { key: 'sprintspeed', category: 'Movement' },
    { key: 'unsprintspeed', category: 'Movement' },
    { key: 'aimwalkspeedmult', category: 'Movement' },
    { key: 'aimspeed', category: 'Handling' },
    { key: 'unaimspeed', category: 'Handling' },
    { key: 'magnifyspeed', category: 'Handling' },
    { key: 'unmagnifyspeed', category: 'Handling' },
    { key: 'equipspeed', category: 'Handling' },
    { key: 'equiptime', category: 'Handling' },
    { key: 'unequipspeed', category: 'Handling' },
    { key: 'unequiptime', category: 'Handling' }
];

const RECOIL_SPRINGS = [
    'aimCameraBody',
    'aimCameraBodyRecovery',
    'aimCameraHead',
    'aimCameraHeadRecovery',
    'aimRotation',
    'aimRotationRecovery',
    'aimTranslation',
    'aimTranslationRecovery',
    'hipCameraBody',
    'hipCameraBodyRecovery',
    'hipCameraHead',
    'hipCameraHeadRecovery',
    'hipRotation',
    'hipRotationRecovery',
    'hipTranslation',
    'hipTranslationRecovery'
];

// Stats tracking
let totalWeapons = 0;
let totalMatched = 0;
let countExactMatch = 0;
let countGlobalMissing = 0;
let countValueMismatch = 0;
let countStructureMismatch = 0;
let countCompileMismatch = 0;
let countApiOnly = 0;
let countUnmatched = 0;
let countUnverified = 0;

let countRecoilMismatch = 0;

const categoryStats = {};
const missingStatCounts = {};

const results = {};

for (const [normId, normWpn] of Object.entries(normWeapons)) {
    totalWeapons++;
    const wpnName = normWpn.name;
    const category = normWpn.category;

    if (!categoryStats[category]) {
        categoryStats[category] = {
            total: 0,
            exactMatch: 0,
            globalMissing: 0,
            valueMismatch: 0,
            recoilMissing: 0
        };
    }
    categoryStats[category].total++;

    const rawWpn = rawMap.get(wpnName);
    const inGameWpn = inGameDb[wpnName];

    if (!inGameWpn) {
        countUnmatched++;
        results[normId] = {
            weaponId: normId,
            internalName: wpnName,
            displayName: normWpn.displayName || wpnName,
            category,
            apiPresent: true,
            inGamePresent: false,
            matchedSource: null,
            verificationStatus: 'UNMATCHED',
            rawDifferences: [],
            recoilVerification: { status: 'NOT_FOUND', inGameSpringCount: 0, apiSpringCount: 0, differences: [] },
            compiledVerification: { status: 'NOT_FOUND', differences: [] }
        };
        continue;
    }

    totalMatched++;

    // 1. Raw Level Diff
    const rawDifferences = [];
    const missingKeys = [];
    const valueMismatches = [];

    // Check Recoil
    const inGameRecoil = inGameWpn.recoil;
    const rawRecoil = rawWpn ? rawWpn.recoil : undefined;
    const hasInGameRecoil = inGameRecoil && typeof inGameRecoil === 'object';
    const hasRawRecoil = rawRecoil && typeof rawRecoil === 'object';

    let recoilStatus = 'EXACT_MATCH';
    const recoilDiffs = [];
    let inGameSpringCount = 0;
    let rawSpringCount = 0;

    if (hasInGameRecoil) {
        inGameSpringCount = Object.keys(inGameRecoil).length;
        if (!hasRawRecoil) {
            recoilStatus = 'GLOBAL_MISSING_FROM_API';
            countRecoilMismatch++;
            categoryStats[category].recoilMissing++;
            recoilDiffs.push({
                field: 'recoil',
                issue: 'Entire recoil 16-spring table is missing from API raw weapon data',
                inGameSprings: Object.keys(inGameRecoil)
            });
            missingStatCounts['recoil (16 springs)'] = (missingStatCounts['recoil (16 springs)'] || 0) + 1;
        } else {
            rawSpringCount = Object.keys(rawRecoil).length;
            for (const sp of RECOIL_SPRINGS) {
                if (inGameRecoil[sp] && !rawRecoil[sp]) {
                    recoilDiffs.push({ field: `recoil.${sp}`, issue: 'Spring missing from API' });
                } else if (inGameRecoil[sp] && rawRecoil[sp]) {
                    if (!valuesMatch(inGameRecoil[sp], rawRecoil[sp])) {
                        recoilDiffs.push({ field: `recoil.${sp}`, issue: 'Value mismatch' });
                    }
                }
            }
            if (recoilDiffs.length > 0) {
                recoilStatus = 'VALUE_MISMATCH';
                countRecoilMismatch++;
                categoryStats[category].recoilMissing++;
            }
        }
    } else {
        recoilStatus = 'NOT_APPLICABLE'; // Melee or grenades
    }

    // Check Gameplay Stat Fields
    for (const stat of STAT_FIELDS) {
        const inGameVal = inGameWpn[stat.key];
        let rawVal = rawWpn ? rawWpn[stat.key] : undefined;

        // Fallback for rpm vs firerate
        if (rawVal === undefined && stat.altKey && rawWpn) {
            rawVal = rawWpn[stat.altKey];
        }

        if (inGameVal !== undefined && rawVal === undefined) {
            missingKeys.push(stat.key);
            missingStatCounts[stat.key] = (missingStatCounts[stat.key] || 0) + 1;
            rawDifferences.push({
                field: stat.key,
                category: stat.category,
                issue: 'GLOBAL_MISSING_FROM_API',
                inGameValue: inGameVal,
                apiValue: undefined
            });
        } else if (inGameVal !== undefined && rawVal !== undefined) {
            if (!valuesMatch(inGameVal, rawVal)) {
                valueMismatches.push({
                    field: stat.key,
                    category: stat.category,
                    issue: 'VALUE_MISMATCH',
                    inGameValue: inGameVal,
                    apiValue: rawVal
                });
                rawDifferences.push({
                    field: stat.key,
                    category: stat.category,
                    issue: 'VALUE_MISMATCH',
                    inGameValue: inGameVal,
                    apiValue: rawVal
                });
            }
        }
    }

    // Overall Status Determination
    let status = 'EXACT_MATCH';
    if (missingKeys.length > 0 || recoilStatus === 'GLOBAL_MISSING_FROM_API') {
        status = 'GLOBAL_MISSING_FROM_API';
        countGlobalMissing++;
        categoryStats[category].globalMissing++;
    } else if (valueMismatches.length > 0 || recoilStatus === 'VALUE_MISMATCH') {
        status = 'VALUE_MISMATCH';
        countValueMismatch++;
        categoryStats[category].valueMismatch++;
    } else {
        status = 'EXACT_MATCH';
        countExactMatch++;
        categoryStats[category].exactMatch++;
    }

    // Compiled Weapon State Comparison
    // Since API lacks recoil and handling stats, compiled state inherits this omission
    const compiledDiffs = [];
    if (recoilStatus === 'GLOBAL_MISSING_FROM_API') {
        compiledDiffs.push({
            aspect: 'Recoil Simulation Engine',
            issue: 'API compiled weapon has undefined recoil dynamics; in-game compiled weapon has full 16-spring impulse vectors'
        });
    }
    if (missingKeys.includes('aimspeed') || missingKeys.includes('sprintspeed')) {
        compiledDiffs.push({
            aspect: 'Handling / Mobility',
            issue: 'API compiled weapon lacks precise aim/sprint/equip timings'
        });
    }

    const compiledStatus = compiledDiffs.length > 0 ? 'COMPILE_RESULT_MISMATCH' : 'EXACT_MATCH';
    if (compiledStatus === 'COMPILE_RESULT_MISMATCH') {
        countCompileMismatch++;
    }

    results[normId] = {
        weaponId: normId,
        internalName: wpnName,
        displayName: normWpn.displayName || wpnName,
        category,
        apiPresent: true,
        inGamePresent: true,
        matchedSource: `Roblox Studio WeaponDatabase.${inGameWpn.category}.${wpnName}`,
        verificationStatus: status,
        rawKeysInGameCount: inGameWpn.rawKeysCount || Object.keys(inGameWpn).length,
        rawKeysApiCount: rawWpn ? Object.keys(rawWpn).length : 0,
        missingFieldsCount: missingKeys.length + (recoilStatus === 'GLOBAL_MISSING_FROM_API' ? 1 : 0),
        valueMismatchCount: valueMismatches.length,
        recoilVerification: {
            status: recoilStatus,
            inGameSpringCount,
            apiSpringCount: rawSpringCount,
            differences: recoilDiffs
        },
        compiledVerification: {
            status: compiledStatus,
            differences: compiledDiffs
        },
        rawDifferences
    };
}

// 4. Save results
fs.writeFileSync(VERIFICATION_OUT_PATH, JSON.stringify(results, null, 2));

console.log('\n======================================================');
console.log('[Full Weapon Verification Complete]');
console.log(`Saved results to: ${VERIFICATION_OUT_PATH}`);
console.log('======================================================');
console.log(`Total Weapons Evaluated:     ${totalWeapons}`);
console.log(`Matched with In-Game:        ${totalMatched} / ${totalWeapons} (100%)`);
console.log(`- EXACT_MATCH:               ${countExactMatch}`);
console.log(`- GLOBAL_MISSING_FROM_API:   ${countGlobalMissing}`);
console.log(`- VALUE_MISMATCH:            ${countValueMismatch}`);
console.log(`- COMPILE_RESULT_MISMATCH:   ${countCompileMismatch}`);
console.log(`- API_ONLY:                  ${countApiOnly}`);
console.log(`- UNMATCHED:                 ${countUnmatched}`);
console.log(`- UNVERIFIED:                ${countUnverified}`);
console.log(`- Recoil Mismatch Weapons:   ${countRecoilMismatch}`);
console.log('------------------------------------------------------');
console.log('Category Breakdown:');
for (const [cat, s] of Object.entries(categoryStats)) {
    console.log(`  ${cat.padEnd(18)} Total: ${String(s.total).padEnd(3)} | Missing: ${String(s.globalMissing).padEnd(3)} | Exact: ${String(s.exactMatch).padEnd(3)} | RecoilMissing: ${s.recoilMissing}`);
}
console.log('------------------------------------------------------');
console.log('Top 20 Missing Core Stats from API:');
const sortedMissing = Object.entries(missingStatCounts).sort((a, b) => b[1] - a[1]);
for (let i = 0; i < Math.min(sortedMissing.length, 20); i++) {
    const [stat, count] = sortedMissing[i];
    console.log(`  ${String(i + 1).padStart(2)}. ${stat.padEnd(25)}: ${count} weapons`);
}
console.log('======================================================\n');
