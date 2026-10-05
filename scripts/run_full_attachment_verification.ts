import * as fs from 'fs';
import * as path from 'path';

// 1. Paths
const DATA_DIR = path.join(__dirname, '../data');
const NORM_ATTS_PATH = path.join(DATA_DIR, 'normalized/attachments.json');
const IN_GAME_DB_PATH = path.join(DATA_DIR, 'in-game-modules/attachment_database.json');
const CLASSIFICATION_PATH = path.join(DATA_DIR, 'attachment_classification.json');
const VERIFICATION_OUT_PATH = path.join(DATA_DIR, 'attachment_verification.json');

// 2. Load inputs
console.log('[Verification Pipeline] Loading datasets...');
const normAtts: Record<string, any> = JSON.parse(fs.readFileSync(NORM_ATTS_PATH, 'utf8'));
const inGameDb: Record<string, any> = JSON.parse(fs.readFileSync(IN_GAME_DB_PATH, 'utf8'));

let manualClassifications: Record<string, any> = {};
if (fs.existsSync(CLASSIFICATION_PATH)) {
    manualClassifications = JSON.parse(fs.readFileSync(CLASSIFICATION_PATH, 'utf8'));
}

console.log(`Loaded ${Object.keys(normAtts).length} normalized attachment variants.`);
console.log(`Loaded ${Object.keys(inGameDb).length} authoritative in-game attachment definitions from AttachmentDatabase.`);

// 3. Selection of candidate variants
// As requested, cover the entire candidate set (Ammo & Other with potential gameplay implications, plus conversions, magazines, and explicit targets)
const targetNames = new Set<string>([
    '.223 Remington',
    'Heavy Buffer',
    'AR 20 Tact Conversion',
    'AR 7.62x39 Conversion',
    'AK-12M 45rd',
    '.45 Special',
    '.45 Super',
    'Extended Magazine',
    'Drum Magazine',
    'Beta C Drum Mag',
    '20rd Drum',
    'Reduced Magazine',
    'AUG 9MM Conversion',
    'Minislugs',
    'Minishell',
    'SVK12E 7.62 Conversion',
    'Saiga 545 Conversion'
]);

for (const id of Object.keys(normAtts)) {
    const a = normAtts[id];
    if (a.slot !== 'Ammo' && a.slot !== 'Other') continue;
    const nameLower = (a.name || '').toLowerCase();
    const dNameLower = (a.displayName || '').toLowerCase();
    const isConv = nameLower.includes('conv') || nameLower.includes('conversion');
    const isMag = nameLower.includes('mag') || nameLower.includes('drum') || nameLower.includes('round') || nameLower.includes('tube') ||
                  dNameLower.includes('mag') || dNameLower.includes('drum') || dNameLower.includes('round');
    const paths = (a.modifiers || []).map((m: any) => m.indexPath ? m.indexPath.join('.') : '');
    const alters = paths.some(p =>
        p.startsWith('firerate') || p.startsWith('rpm') ||
        p.startsWith('magsize') || p.startsWith('damage0') ||
        p.startsWith('damage1') || p.startsWith('ammotype') ||
        p.startsWith('casetype') || p.startsWith('type') ||
        p.startsWith('firemodes') || p.startsWith('caliber') ||
        p.startsWith('recoil')
    );
    if (isConv || isMag || alters) {
        targetNames.add(a.name);
    }
}

const candidateVariants: any[] = [];
for (const id of Object.keys(normAtts)) {
    const a = normAtts[id];
    if (targetNames.has(a.name) || (a.displayName && targetNames.has(a.displayName))) {
        candidateVariants.push(a);
    }
}

console.log(`[Target Scope] Target unique attachment names: ${targetNames.size}`);
console.log(`[Target Scope] Total candidate variants to verify: ${candidateVariants.length}`);

// 4. In-Game Attachment Lookup Helper
function findInGameAttachment(name: string, displayName?: string): { key: string; data: any } | null {
    // 1. Exact name match
    if (inGameDb[name]) return { key: name, data: inGameDb[name] };

    // 2. Case-insensitive name match
    const lowerName = name.toLowerCase();
    for (const [k, v] of Object.entries(inGameDb)) {
        if (k.toLowerCase() === lowerName) return { key: k, data: v };
    }

    // 3. DisplayName match
    if (displayName) {
        const lowerDisp = displayName.toLowerCase();
        for (const [k, v] of Object.entries(inGameDb)) {
            if (v.displayName && v.displayName.toLowerCase() === lowerDisp) return { key: k, data: v };
            if (k.toLowerCase() === lowerDisp) return { key: k, data: v };
        }
    }

    // 4. Known aliases
    const aliases: Record<string, string> = {
        '.45 Super': '.45 Special',
        '6.5 GRENDEL': 'AR 7.62x39 Conversion',
        'AR 7.62x39 Conversion': 'AR 7.62x39 Conversion',
        '45rd Magazine': 'AK-12M 45rd'
    };
    if (aliases[name] && inGameDb[aliases[name]]) {
        return { key: aliases[name], data: inGameDb[aliases[name]] };
    }
    if (displayName && aliases[displayName] && inGameDb[aliases[displayName]]) {
        return { key: aliases[displayName], data: inGameDb[aliases[displayName]] };
    }

    return null;
}

// 5. Flatten In-Game AttachmentData modifiers into standard list
function extractInGameModifiers(attData: any): Array<{ type: string; indexPath: string[]; value: any }> {
    const mods: Array<{ type: string; indexPath: string[]; value: any }> = [];
    const attMods = attData.attachmentModifiers || {};

    const STAGES = [
        'setters',
        'trueMultipliers',
        'relativeMultipliers',
        'tableTrueMultipliers',
        'tableInserters',
        'tableRemovers'
    ];

    for (const stage of STAGES) {
        const list = attMods[stage];
        if (Array.isArray(list)) {
            for (const item of list) {
                if (item && item.indexPath) {
                    mods.push({
                        type: stage,
                        indexPath: item.indexPath.map((p: any) => String(p)),
                        value: item.value
                    });
                }
            }
        }
    }

    return mods;
}

// 6. Merge Global Modifiers with Weapon-Specific Override Modifiers
function mergeModifiers(
    globalMods: Array<{ type: string; indexPath: string[]; value: any }>,
    overrideMods: Array<any>
): Array<{ type: string; indexPath: string[]; value: any }> {
    const mergedMap = new Map<string, { type: string; indexPath: string[]; value: any }>();

    // Add all global modifiers
    for (const gm of globalMods) {
        const key = `${gm.type}:${gm.indexPath.join('.')}`;
        mergedMap.set(key, { ...gm });
    }

    // Apply weapon-specific overrides
    for (const om of overrideMods) {
        const path = (om.indexPath || []).map((p: any) => String(p));
        const key = `${om.type}:${path.join('.')}`;
        // In PF semantics, weapon override on same path overrides the global value
        mergedMap.set(key, {
            type: om.type,
            indexPath: path,
            value: om.value
        });
    }

    return Array.from(mergedMap.values());
}

// Helper to compare two values
function valuesMatch(a: any, b: any): boolean {
    if (typeof a === 'number' && typeof b === 'number') {
        return Math.abs(a - b) < 1e-5;
    }
    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    return String(a) === String(b);
}

// 7. Effect Flags Classifier
function computeEffectFlags(modifiers: Array<{ type: string; indexPath: string[]; value: any }>) {
    let recoilRelevant = false;
    let fireRateRelevant = false;
    let magazineRelevant = false;
    let damageRelevant = false;
    let ammoRelevant = false;
    let movementRelevant = false;
    let aimSpeedRelevant = false;
    let equipRelevant = false;
    let reloadRelevant = false;
    let spreadRelevant = false;
    let otherHandlingRelevant = false;

    for (const mod of modifiers) {
        const p = mod.indexPath.join('.').toLowerCase();

        if (p.startsWith('recoil') || p.includes('weightrecoilmult') || p === 'weight') {
            recoilRelevant = true;
        } else if (p.startsWith('firerate') || p.startsWith('rpm') || p.startsWith('burstsize') || p.startsWith('firemodes')) {
            fireRateRelevant = true;
        } else if (p.startsWith('magsize') || p.startsWith('sparerounds') || p.startsWith('totalrounds') || p.startsWith('roundsinchamber')) {
            magazineRelevant = true;
        } else if (p.startsWith('damage') || p.startsWith('pelletcount') || p.startsWith('bulletspeed') || p.startsWith('penetration')) {
            damageRelevant = true;
        } else if (p.startsWith('ammotype') || p.startsWith('casetype') || p.startsWith('caliber')) {
            ammoRelevant = true;
        } else if (p.startsWith('walkspeed') || p.startsWith('sprintspeed') || p.startsWith('aimwalkspeedmult') || p.startsWith('unsprintspeed')) {
            movementRelevant = true;
        } else if (p.startsWith('aimspeed') || p.startsWith('unaimspeed') || p.startsWith('magnifyspeed') || p.startsWith('unmagnifyspeed')) {
            aimSpeedRelevant = true;
        } else if (p.startsWith('equipspeed') || p.startsWith('equiptime') || p.startsWith('unequipspeed') || p.startsWith('unequiptime')) {
            equipRelevant = true;
        } else if (p.startsWith('animations.reload') || p.startsWith('animations.tacticalreload')) {
            reloadRelevant = true;
        } else if (p.startsWith('spread') || p.startsWith('hipspread') || p.startsWith('aimspread')) {
            spreadRelevant = true;
        } else if (p.startsWith('crosshair') || p.startsWith('laser') || p.startsWith('light') || p.startsWith('node') || p.startsWith('removeparts') || p.startsWith('hideparts')) {
            // Cosmetic or mounting tags
        } else {
            otherHandlingRelevant = true;
        }
    }

    const computedRecoilRelevant = recoilRelevant || fireRateRelevant || magazineRelevant || damageRelevant || ammoRelevant;
    const practicalityRelevant = movementRelevant || aimSpeedRelevant || equipRelevant || reloadRelevant || magazineRelevant;

    return {
        effectFlags: {
            recoilRelevant,
            fireRateRelevant,
            magazineRelevant,
            damageRelevant,
            ammoRelevant,
            movementRelevant,
            aimSpeedRelevant,
            equipRelevant,
            reloadRelevant,
            spreadRelevant,
            otherHandlingRelevant
        },
        computedRecoilRelevant,
        practicalityRelevant
    };
}

// 8. Main Verification Loop
interface VerificationEntry {
    variantId: string;
    attachmentName: string;
    displayName: string;
    slot: string;
    weaponCount: number;
    compatibleWeapons: string[];
    verificationStatus: 'EXACT_MATCH' | 'GLOBAL_MISSING_FROM_API' | 'VALUE_MISMATCH' | 'STRUCTURE_MISMATCH' | 'API_ONLY' | 'UNMATCHED_ATTACHMENT' | 'UNVERIFIED';
    verificationSource: string;
    apiModifierCount: number;
    globalInGameModifierCount: number;
    weaponSpecificModifierCount: number;
    finalInGameModifierCount: number;
    manualRecoilContext: boolean | null;
    computedRecoilRelevant: boolean;
    practicalityRelevant: boolean;
    finalRecoilContext: boolean;
    recoilContextRationale: string;
    effectFlags: Record<string, boolean>;
    missingFromApi: Array<{ type: string; indexPath: string; value: any }>;
    extraInApi: Array<{ type: string; indexPath: string; value: any }>;
    valueMismatches: Array<{ type: string; indexPath: string; apiValue: any; inGameValue: any }>;
}

const results: Record<string, VerificationEntry> = {};

// Stats tracking
let countExactMatch = 0;
let countGlobalMissing = 0;
let countValueMismatch = 0;
let countStructureMismatch = 0;
let countApiOnly = 0;
let countUnmatched = 0;
let countUnverified = 0;

const missingModifierTypeCounts: Record<string, number> = {
    recoil: 0,
    movement: 0,
    aimSpeed: 0,
    equipTime: 0,
    fireRate: 0,
    magazine: 0,
    damage: 0,
    ammo: 0,
    other: 0
};

for (const variant of candidateVariants) {
    const vId = variant.id;
    const attName = variant.name;
    const dispName = variant.displayName || attName;
    const slot = variant.slot || 'Unknown';
    const compWeapons = variant.compatibleWeaponIds || [];
    const apiMods = variant.modifiers || [];

    // Find in In-Game DB
    const inGameLookup = findInGameAttachment(attName, dispName);

    if (!inGameLookup) {
        countUnmatched++;
        const manualEntry = manualClassifications[vId];
        const manualVal = manualEntry ? manualEntry.recoilContext : null;
        const apiEffects = computeEffectFlags(apiMods);

        results[vId] = {
            variantId: vId,
            attachmentName: attName,
            displayName: dispName,
            slot,
            weaponCount: compWeapons.length,
            compatibleWeapons: compWeapons,
            verificationStatus: 'UNMATCHED_ATTACHMENT',
            verificationSource: 'Not found in Roblox Studio AttachmentDatabase',
            apiModifierCount: apiMods.length,
            globalInGameModifierCount: 0,
            weaponSpecificModifierCount: 0,
            finalInGameModifierCount: 0,
            manualRecoilContext: manualVal,
            computedRecoilRelevant: apiEffects.computedRecoilRelevant,
            practicalityRelevant: apiEffects.practicalityRelevant,
            finalRecoilContext: manualVal !== null ? manualVal : apiEffects.computedRecoilRelevant,
            recoilContextRationale: 'Unmatched in AttachmentDatabase; fallback to API/manual classification',
            effectFlags: apiEffects.effectFlags,
            missingFromApi: [],
            extraInApi: apiMods.map((m: any) => ({ type: m.type, indexPath: (m.indexPath || []).join('.'), value: m.value })),
            valueMismatches: []
        };
        continue;
    }

    // In-Game attachment found!
    const globalInGameMods = extractInGameModifiers(inGameLookup.data);
    const finalInGameMods = mergeModifiers(globalInGameMods, apiMods);

    // Compute diff between API and Final In-Game Modifiers
    const apiMap = new Map<string, any>();
    for (const m of apiMods) {
        const p = (m.indexPath || []).map((x: any) => String(x)).join('.');
        apiMap.set(`${m.type}:${p}`, m.value);
    }

    const inGameMap = new Map<string, any>();
    for (const m of finalInGameMods) {
        const p = m.indexPath.join('.');
        inGameMap.set(`${m.type}:${p}`, m.value);
    }

    const missingFromApi: Array<{ type: string; indexPath: string; value: any }> = [];
    const extraInApi: Array<{ type: string; indexPath: string; value: any }> = [];
    const valueMismatches: Array<{ type: string; indexPath: string; apiValue: any; inGameValue: any }> = [];

    // Check what is in in-game but missing or different in API
    for (const [key, inGameVal] of inGameMap.entries()) {
        const [type, pathStr] = key.split(':');
        if (!apiMap.has(key)) {
            // Check if same path exists with different type
            let foundOtherType = false;
            for (const [apiKey] of apiMap.entries()) {
                const [aType, aPath] = apiKey.split(':');
                if (aPath === pathStr && aType !== type) {
                    foundOtherType = true;
                    break;
                }
            }
            if (!foundOtherType) {
                missingFromApi.push({ type, indexPath: pathStr, value: inGameVal });

                // Categorize missing stat
                const p = pathStr.toLowerCase();
                if (p.startsWith('recoil') || p.includes('weight')) missingModifierTypeCounts.recoil++;
                else if (p.startsWith('walkspeed') || p.startsWith('sprintspeed') || p.startsWith('aimwalkspeedmult')) missingModifierTypeCounts.movement++;
                else if (p.startsWith('aimspeed') || p.startsWith('unaimspeed') || p.startsWith('magnifyspeed')) missingModifierTypeCounts.aimSpeed++;
                else if (p.startsWith('equip')) missingModifierTypeCounts.equipTime++;
                else if (p.startsWith('firerate') || p.startsWith('rpm')) missingModifierTypeCounts.fireRate++;
                else if (p.startsWith('magsize') || p.startsWith('sparerounds')) missingModifierTypeCounts.magazine++;
                else if (p.startsWith('damage') || p.startsWith('pelletcount')) missingModifierTypeCounts.damage++;
                else if (p.startsWith('ammotype') || p.startsWith('caliber')) missingModifierTypeCounts.ammo++;
                else missingModifierTypeCounts.other++;
            }
        } else {
            const apiVal = apiMap.get(key);
            if (!valuesMatch(apiVal, inGameVal)) {
                valueMismatches.push({ type, indexPath: pathStr, apiValue: apiVal, inGameValue: inGameVal });
            }
        }
    }

    // Check what is in API but not in in-game
    for (const [key, apiVal] of apiMap.entries()) {
        const [type, pathStr] = key.split(':');
        if (!inGameMap.has(key)) {
            extraInApi.push({ type, indexPath: pathStr, value: apiVal });
        }
    }

    // Determine status
    let status: 'EXACT_MATCH' | 'GLOBAL_MISSING_FROM_API' | 'VALUE_MISMATCH' | 'STRUCTURE_MISMATCH' | 'API_ONLY' = 'EXACT_MATCH';
    if (missingFromApi.length > 0) {
        status = 'GLOBAL_MISSING_FROM_API';
        countGlobalMissing++;
    } else if (valueMismatches.length > 0) {
        status = 'VALUE_MISMATCH';
        countValueMismatch++;
    } else if (extraInApi.length > 0) {
        status = 'API_ONLY';
        countApiOnly++;
    } else {
        status = 'EXACT_MATCH';
        countExactMatch++;
    }

    // Effects & recoilContext determination
    const effects = computeEffectFlags(finalInGameMods);
    const manualEntry = manualClassifications[vId];
    const manualVal = manualEntry ? manualEntry.recoilContext : null;

    let finalRecoil = effects.computedRecoilRelevant;
    let rationale = '';

    if (effects.computedRecoilRelevant) {
        const reasons: string[] = [];
        if (effects.effectFlags.recoilRelevant) reasons.push('recoil impulse/weight alterations');
        if (effects.effectFlags.fireRateRelevant) reasons.push('RPM/firerate alterations');
        if (effects.effectFlags.magazineRelevant) reasons.push('magazine capacity alterations');
        if (effects.effectFlags.damageRelevant) reasons.push('damage/velocity alterations');
        if (effects.effectFlags.ammoRelevant) reasons.push('caliber/ammotype conversion');
        rationale = `Verified in-game modifications define an independent weapon baseline (${reasons.join(', ')})`;
    } else {
        if (effects.practicalityRelevant) {
            rationale = 'In-game modifications affect practicality/handling only (aim/walk speed/equip); maintains baseline recoil dynamics';
        } else {
            rationale = 'No baseline recoil or performance alterations detected in verified in-game definition';
        }
    }

    results[vId] = {
        variantId: vId,
        attachmentName: attName,
        displayName: dispName,
        slot,
        weaponCount: compWeapons.length,
        compatibleWeapons: compWeapons,
        verificationStatus: status,
        verificationSource: `Roblox Studio MCP (AttachmentDatabase.Categories.${inGameLookup.data.category}.${inGameLookup.key})`,
        apiModifierCount: apiMods.length,
        globalInGameModifierCount: globalInGameMods.length,
        weaponSpecificModifierCount: apiMods.length,
        finalInGameModifierCount: finalInGameMods.length,
        manualRecoilContext: manualVal,
        computedRecoilRelevant: effects.computedRecoilRelevant,
        practicalityRelevant: effects.practicalityRelevant,
        finalRecoilContext: finalRecoil,
        recoilContextRationale: rationale,
        effectFlags: effects.effectFlags,
        missingFromApi,
        extraInApi,
        valueMismatches
    };
}

// 9. Save verification JSON
fs.writeFileSync(VERIFICATION_OUT_PATH, JSON.stringify(results, null, 2));
console.log(`\n======================================================`);
console.log(`[Verification Pipeline Complete]`);
console.log(`Saved results to: ${VERIFICATION_OUT_PATH}`);
console.log(`======================================================`);
console.log(`Total Variants Evaluated:    ${Object.keys(results).length}`);
console.log(`- EXACT_MATCH:               ${countExactMatch}`);
console.log(`- GLOBAL_MISSING_FROM_API:   ${countGlobalMissing}`);
console.log(`- VALUE_MISMATCH:            ${countValueMismatch}`);
console.log(`- API_ONLY:                  ${countApiOnly}`);
console.log(`- UNMATCHED_ATTACHMENT:      ${countUnmatched}`);
console.log(`- UNVERIFIED:                ${countUnverified}`);
console.log(`------------------------------------------------------`);
console.log(`Most Missing Modifier Categories from API:`);
for (const [k, v] of Object.entries(missingModifierTypeCounts)) {
    console.log(`  * ${k.padEnd(14)}: ${v} instances`);
}
console.log(`======================================================\n`);
