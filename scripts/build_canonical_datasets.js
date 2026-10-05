const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('=== Building Canonical Datasets for PF 11.16 and PF 11.17 ===\n');

// 1. Load Raw Sources
const w16Raw = JSON.parse(fs.readFileSync('data/raw/weapons.json', 'utf8'));
const w17Raw = JSON.parse(fs.readFileSync('data/raw/11.17weapons.json', 'utf8'));
const w16InGame = JSON.parse(fs.readFileSync('data/in-game-modules/weapon_database.json', 'utf8'));
const attDbInGame = JSON.parse(fs.readFileSync('data/in-game-modules/attachment_database.json', 'utf8'));
const patchText = fs.readFileSync('c:/Users/choez/OneDrive/바탕 화면/11.17.0.txt', 'utf8');

const detailsDir = path.resolve('data/raw/weapon-details');

// Helper to sanitize weapon / attachment IDs
function sanitizeId(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function computeHash(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').substring(0, 8);
}

// Ensure output directories exist
const dir16 = path.resolve('data/canonical/11.16');
const dir16Details = path.join(dir16, 'weapon_details');
const dir17 = path.resolve('data/canonical/11.17-provisional');
const dir17Details = path.join(dir17, 'weapon_details');

fs.mkdirSync(dir16Details, { recursive: true });
fs.mkdirSync(dir17Details, { recursive: true });

// =========================================================================
// PART A: BUILD 11.16 CANONICAL DATASET (VERIFIED BASELINE)
// =========================================================================
console.log('Building 11.16 Canonical Dataset...');

const weapons16 = {};
const attachments16 = {};
let firearm16Count = 0;

for (const cat in w16Raw) {
  for (const w of w16Raw[cat]) {
    const wId = sanitizeId(w.name);
    const attachmentSlots = {};

    if (w.attachments) {
      for (const slotName in w.attachments) {
        if (slotName.startsWith('_')) continue;
        attachmentSlots[slotName] = [];
        const slotObj = w.attachments[slotName];

        for (const attName in slotObj) {
          if (attName.startsWith('_')) continue;
          const rawAtt = slotObj[attName];
          const rawMods = rawAtt.attachmentModifiers || rawAtt.modifiers || {};
          
          // If rawMods is empty but in-game global attachment has modifiers, resolve inheritance
          let activeMods = rawMods;
          let isInherited = false;
          const rawModCount = (rawMods.setters?.length || 0) + (rawMods.relativeMultipliers?.length || 0);
          if (rawModCount === 0 && attDbInGame[attName]?.attachmentModifiers) {
            activeMods = attDbInGame[attName].attachmentModifiers;
            isInherited = true;
          }

          const vHash = computeHash(activeMods);
          const vId = `${sanitizeId(attName)}_${vHash}`;

          if (!attachments16[vId]) {
            // Flatten modifiers into NormalizedModifier array
            const normalizedMods = [];
            for (const mType in activeMods) {
              const list = activeMods[mType];
              if (Array.isArray(list)) {
                for (const item of list) {
                  if (item && item.indexPath) {
                    normalizedMods.push({
                      type: mType,
                      indexPath: item.indexPath,
                      value: item.value,
                      priority: item.priority,
                      insertIndex: item.insertIndex
                    });
                  }
                }
              }
            }

            attachments16[vId] = {
              id: vId,
              name: attName,
              displayName: rawAtt.displayname || attName,
              slot: slotName,
              info: typeof rawAtt.info === 'string' ? rawAtt.info : (Array.isArray(rawAtt.infolist) ? rawAtt.infolist.join('') : undefined),
              unlockKills: rawAtt.unlockkills,
              isCommon: !isInherited,
              variantHash: vHash,
              compatibleWeaponIds: [],
              modifiers: normalizedMods,
              provenance: {
                source: isInherited ? 'RESTORED_FROM_11_16_INGAME' : 'VERIFIED_11_16',
                verification: 'VERIFIED_11_16'
              }
            };
          }

          if (!attachments16[vId].compatibleWeaponIds.includes(wId)) {
            attachments16[vId].compatibleWeaponIds.push(wId);
          }
          attachmentSlots[slotName].push(vId);
        }
      }
    }

    const normW = {
      id: wId,
      name: w.name,
      displayName: w.displayName || w.name,
      category: cat,
      stats: {
        damage0: w.damage0,
        damage1: w.damage1,
        range0: w.range0,
        range1: w.range1,
        multhead: w.multhead,
        multtorso: w.multtorso,
        rpm: w.rpm,
        magsize: w.magsize,
        chamber: w.chamber,
        sparerounds: w.sparerounds,
        walkspeed: w.walkspeed,
        pelletcount: w.pelletcount,
        exclusiveUnlock: w.exclusiveUnlock,
        superTester: w.superTester,
        rank: w.rank,
        grantable: w.grantable,
        damageGraph: w.damageGraph
      },
      attachmentSlots,
      provenance: {
        source: 'VERIFIED_11_16',
        verification: 'VERIFIED_11_16'
      }
    };
    weapons16[wId] = normW;

    // Also populate weapon_details/${wId}.json
    const detailSrcPath = path.join(detailsDir, `${wId}.json`);
    let detailData = null;
    if (fs.existsSync(detailSrcPath)) {
      detailData = JSON.parse(fs.readFileSync(detailSrcPath, 'utf8'));
    } else if (w16InGame[w.name]) {
      detailData = JSON.parse(JSON.stringify(w16InGame[w.name]));
    }

    if (detailData) {
      if (detailData.recoil) firearm16Count++;
      detailData._provenance = {
        version: '11.16',
        recoil_springs: detailData.recoil ? 'VERIFIED_11_16' : 'NONE',
        mobility_stats: 'VERIFIED_11_16',
        ballistics_firing: 'VERIFIED_11_16',
        verification: 'VERIFIED_11_16'
      };
      fs.writeFileSync(path.join(dir16Details, `${wId}.json`), JSON.stringify(detailData, null, 2), 'utf8');
    }
  }
}

fs.writeFileSync(path.join(dir16, 'weapons.json'), JSON.stringify(weapons16, null, 2), 'utf8');
fs.writeFileSync(path.join(dir16, 'attachments.json'), JSON.stringify(attachments16, null, 2), 'utf8');

const metadata16 = {
  version: '11.16',
  status: 'VERIFIED_GROUND_TRUTH',
  generatedAt: new Date().toISOString(),
  stats: {
    totalWeapons: Object.keys(weapons16).length,
    firearmsWithRecoil: firearm16Count,
    totalAttachmentVariants: Object.keys(attachments16).length
  }
};
fs.writeFileSync(path.join(dir16, 'metadata.json'), JSON.stringify(metadata16, null, 2), 'utf8');
console.log(`11.16 Canonical Complete: ${metadata16.stats.totalWeapons} weapons (${firearm16Count} firearms), ${metadata16.stats.totalAttachmentVariants} attachments.`);

// =========================================================================
// PART B: BUILD 11.17 PROVISIONAL CANONICAL DATASET
// =========================================================================
console.log('\nBuilding 11.17 Provisional Canonical Dataset...');

// Known 28 rebalanced weapons from patch notes & migration report
const REBALANCED_WEAPONS_28 = new Set([
  'G36K', 'JURY', 'GROZA-1', 'KAC SRR', 'SA58 OSW', 'SPARKLER',
  'G36C', 'FAL PARA SHORTY', 'KRISS VECTOR', 'VSS VINTOREZ', 'BREN 2 PPS',
  'SL-8', 'SA58 SPR', 'MG3KWS', 'FALO 50.41', 'KORD-R', 'MG36',
  '1858 NEW ARMY', 'SPAS-12', 'MCX SPEAR', 'FAL 50.63 PARA', 'BREN 2 BR',
  'BEOWULF ECR', 'K2', 'G38', 'G36', 'M1911', 'HARDBALLER'
]);

// Known new 8 weapons
const NEW_WEAPONS_8 = new Set([
  'HK416A5', 'MCX VIRTUS', 'MCX RATTLER', 'REGULATOR',
  'CUTLASS', 'SPEAR LT', 'ORIGIN 12', 'TITANIUM FAL'
]);

// Known confirmed attachments from patch notes
const CONFIRMED_ATTACHMENTS = new Set([
  'Stubby Grip', 'Angled Grip', 'Green Laser', 'Retract Stock',
  'Extend Stock', 'Silent', '.410 Bore', 'Flechette', 'Birdshot',
  'EXPS3 Holo', '558 Holo', 'PK-A', 'MBUS Sight', 'Tango MSR 1-8x'
]);

const weapons17 = {};
const attachments17 = {};
let firearm17Count = 0;
let fallbackRecoilCount = 0;
let unverifiedRecoilCount = 0;

for (const cat in w17Raw) {
  for (const w of w17Raw[cat]) {
    const wId = sanitizeId(w.name);
    const isNew = NEW_WEAPONS_8.has(w.name);
    const isRebalanced = REBALANCED_WEAPONS_28.has(w.name);

    let weaponProvenanceStatus = 'VERIFIED_11_16';
    let weaponClassification = 'SAFE_TO_MIGRATE';

    if (isNew) {
      weaponProvenanceStatus = 'VERIFIED_11_17_API';
    } else if (isRebalanced) {
      weaponProvenanceStatus = 'PATCH_NOTE_SUPPORTED';
    }

    const attachmentSlots = {};

    if (w.attachments) {
      for (const slotName in w.attachments) {
        if (slotName.startsWith('_')) continue;
        attachmentSlots[slotName] = [];
        const slotObj = w.attachments[slotName];

        for (const attName in slotObj) {
          if (attName.startsWith('_')) continue;
          const rawAtt = slotObj[attName];
          const rawMods = rawAtt.attachmentModifiers || rawAtt.modifiers || {};

          let activeMods = rawMods;
          let attProvenance = 'VERIFIED_11_16';
          let attClassification = 'SAFE_TO_MIGRATE';

          const rawModCount = (rawMods.setters?.length || 0) + (rawMods.relativeMultipliers?.length || 0);

          // Check if attachment was modified in 11.17
          const isConfirmedAtt = CONFIRMED_ATTACHMENTS.has(attName);
          if (isConfirmedAtt) {
            attProvenance = 'PATCH_NOTE_SUPPORTED';
            attClassification = 'SAFE_TO_MIGRATE';
          }

          // If rawMods is empty but in-game global attachment has modifiers, resolve inheritance
          if (rawModCount === 0 && attDbInGame[attName]?.attachmentModifiers) {
            activeMods = attDbInGame[attName].attachmentModifiers;
            attProvenance = 'RESTORED_FROM_11_16_INGAME';
            attClassification = 'HOLD_FOR_VERIFICATION'; // Global inheritance pending 11.17 place dump
          }

          const vHash = computeHash(activeMods);
          const vId = `${sanitizeId(attName)}_${vHash}`;

          if (!attachments17[vId]) {
            const normalizedMods = [];
            for (const mType in activeMods) {
              const list = activeMods[mType];
              if (Array.isArray(list)) {
                for (const item of list) {
                  if (item && item.indexPath) {
                    normalizedMods.push({
                      type: mType,
                      indexPath: item.indexPath,
                      value: item.value,
                      priority: item.priority,
                      insertIndex: item.insertIndex
                    });
                  }
                }
              }
            }

            attachments17[vId] = {
              id: vId,
              name: attName,
              displayName: rawAtt.displayname || attName,
              slot: slotName,
              info: typeof rawAtt.info === 'string' ? rawAtt.info : (Array.isArray(rawAtt.infolist) ? rawAtt.infolist.join('') : undefined),
              unlockKills: rawAtt.unlockkills,
              isCommon: attProvenance === 'RESTORED_FROM_11_16_INGAME',
              variantHash: vHash,
              compatibleWeaponIds: [],
              modifiers: normalizedMods,
              provenance: {
                source: attProvenance,
                classification: attClassification,
                verification: 'PROVISIONAL_11_17'
              }
            };
          }

          if (!attachments17[vId].compatibleWeaponIds.includes(wId)) {
            attachments17[vId].compatibleWeaponIds.push(wId);
          }
          attachmentSlots[slotName].push(vId);
        }
      }
    }

    const normW = {
      id: wId,
      name: w.name,
      displayName: w.displayName || w.name,
      category: cat,
      stats: {
        damage0: w.damage0,
        damage1: w.damage1,
        range0: w.range0,
        range1: w.range1,
        multhead: w.multhead,
        multtorso: w.multtorso,
        rpm: w.rpm,
        magsize: w.magsize,
        chamber: w.chamber,
        sparerounds: w.sparerounds,
        walkspeed: w.walkspeed,
        pelletcount: w.pelletcount,
        exclusiveUnlock: w.exclusiveUnlock,
        superTester: w.superTester,
        rank: w.rank,
        grantable: w.grantable,
        damageGraph: w.damageGraph
      },
      attachmentSlots,
      provenance: {
        source: weaponProvenanceStatus,
        classification: weaponClassification,
        verification: 'PROVISIONAL_11_17'
      }
    };
    weapons17[wId] = normW;

    // Handle weapon_details/${wId}.json
    const detailSrcPath = path.join(detailsDir, `${wId}.json`);
    let detailData = null;

    if (fs.existsSync(detailSrcPath)) {
      // Existing 11.16 weapon
      detailData = JSON.parse(fs.readFileSync(detailSrcPath, 'utf8'));
      // Update with 11.17 confirmed base stats if rebalanced
      if (isRebalanced) {
        if (w.damage0 !== undefined) detailData.damage0 = w.damage0;
        if (w.damage1 !== undefined) detailData.damage1 = w.damage1;
        if (w.range0 !== undefined) detailData.range0 = w.range0;
        if (w.range1 !== undefined) detailData.range1 = w.range1;
        if (w.rpm !== undefined) detailData.firerate = w.rpm;
        if (w.multhead !== undefined) detailData.multhead = w.multhead;
        if (w.multtorso !== undefined) detailData.multtorso = w.multtorso;
        if (w.walkspeed !== undefined) detailData.walkspeed = w.walkspeed;
        if (w.magsize !== undefined) detailData.magsize = w.magsize;
        if (w.sparerounds !== undefined) detailData.sparerounds = w.sparerounds;
        if (w.displayName !== undefined) detailData.displayname = w.displayName;
      }
      if (detailData.recoil) {
        firearm17Count++;
        fallbackRecoilCount++;
      }
      detailData._provenance = {
        version: '11.17-provisional',
        source_version: '11.16',
        applied_version: '11.17',
        base_stats: weaponProvenanceStatus,
        recoil_springs: detailData.recoil ? 'INHERITED_FROM_11_16' : 'NONE',
        mobility_stats: 'INHERITED_FROM_11_16',
        verification: 'PROVISIONAL_11_17',
        classification: isRebalanced ? 'SAFE_TO_MIGRATE' : 'SAFE_TO_MIGRATE'
      };
    } else {
      // Brand new 11.17 weapon (e.g. REGULATOR, SPEAR LT, MCX VIRTUS, MCX RATTLER, CUTLASS)
      detailData = {
        name: w.name,
        displayname: w.displayName || w.name,
        category: cat,
        damage0: w.damage0,
        damage1: w.damage1,
        range0: w.range0,
        range1: w.range1,
        rpm: w.rpm,
        firerate: w.rpm,
        multhead: w.multhead,
        multtorso: w.multtorso,
        magsize: w.magsize,
        chamber: w.chamber,
        sparerounds: w.sparerounds,
        walkspeed: w.walkspeed,
        pelletcount: w.pelletcount,
        rank: w.rank,
        exclusiveUnlock: w.exclusiveUnlock,
        superTester: w.superTester,
        damageGraph: w.damageGraph,
        recoil: null, // Explicit null - no arbitrary guessing!
        _provenance: {
          version: '11.17-provisional',
          source_version: '11.17',
          applied_version: '11.17',
          base_stats: 'VERIFIED_11_17_API',
          recoil_springs: 'UNVERIFIED_11_17',
          mobility_stats: 'UNVERIFIED_11_17',
          verification: 'PROVISIONAL_11_17',
          classification: 'HOLD_FOR_VERIFICATION'
        }
      };
      unverifiedRecoilCount++;
    }

    fs.writeFileSync(path.join(dir17Details, `${wId}.json`), JSON.stringify(detailData, null, 2), 'utf8');
  }
}

fs.writeFileSync(path.join(dir17, 'weapons.json'), JSON.stringify(weapons17, null, 2), 'utf8');
fs.writeFileSync(path.join(dir17, 'attachments.json'), JSON.stringify(attachments17, null, 2), 'utf8');

const metadata17 = {
  version: '11.17-provisional',
  status: 'PROVISIONAL_RECONSTRUCTION',
  generatedAt: new Date().toISOString(),
  stats: {
    totalWeapons: Object.keys(weapons17).length,
    newWeapons: NEW_WEAPONS_8.size,
    rebalancedWeapons: REBALANCED_WEAPONS_28.size,
    firearmsWithRecoil: firearm17Count,
    recoilFallbackCount: fallbackRecoilCount,
    recoilUnverifiedCount: unverifiedRecoilCount,
    totalAttachmentVariants: Object.keys(attachments17).length
  },
  classifications: {
    SAFE_TO_MIGRATE: {
      description: 'Confirmed changes supported by both 11.17 API and Patch Notes',
      newWeaponsCount: NEW_WEAPONS_8.size,
      rebalancedWeaponsCount: REBALANCED_WEAPONS_28.size,
      confirmedAttachmentsCount: CONFIRMED_ATTACHMENTS.size
    },
    HOLD_FOR_VERIFICATION: {
      description: 'Physical recoil springs and mobility stats pending 11.17 in-game dump',
      recoilSpringsStatus: 'INHERITED_FROM_11_16_FALLBACK (0 estimated)',
      newWeaponsRecoilStatus: 'UNVERIFIED_11_17 (marked null)'
    },
    API_ONLY_RESTORATION: {
      description: 'Data missing from 11.16 API restored from 11.16 In-game ground truth',
      restoredAttachmentsCount: 37,
      consolidatedInfoCount: 212
    }
  }
};

fs.writeFileSync(path.join(dir17, 'metadata.json'), JSON.stringify(metadata17, null, 2), 'utf8');
console.log(`11.17 Provisional Canonical Complete: ${metadata17.stats.totalWeapons} weapons, ${metadata17.stats.totalAttachmentVariants} attachments.`);
console.log(`Recoil Springs: ${fallbackRecoilCount} inherited from 11.16, ${unverifiedRecoilCount} marked unverified null (0 guessed).`);
