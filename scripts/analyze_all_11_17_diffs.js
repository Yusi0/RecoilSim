const fs = require('fs');

console.log('Loading 11.16 API, 11.17 API, and 11.16 Ingame...');
const w16 = JSON.parse(fs.readFileSync('data/raw/weapons.json', 'utf8'));
const w17 = JSON.parse(fs.readFileSync('data/raw/11.17weapons.json', 'utf8'));
const wIngame = JSON.parse(fs.readFileSync('data/in-game-modules/weapon_database.json', 'utf8'));
const attDb = JSON.parse(fs.readFileSync('data/in-game-modules/attachment_database.json', 'utf8'));

// Build maps
const map16 = {};
for (const cat in w16) for (const w of w16[cat]) map16[w.name] = w;

const map17 = {};
for (const cat in w17) for (const w of w17[cat]) map17[w.name] = w;

// 1. Analyze Weapon Differences
const baseFields = [
  'damage0', 'damage1', 'range0', 'range1', 'multhead', 'multtorso',
  'rpm', 'magsize', 'chamber', 'sparerounds', 'walkspeed', 'pelletcount',
  'rank', 'exclusiveUnlock', 'superTester', 'grantable', 'displayName'
];

const weaponDiffs = [];
for (const name in map16) {
  if (!map17[name]) continue;
  const wA = map16[name];
  const wB = map17[name];
  const diffs = {};
  for (const f of baseFields) {
    if (wA[f] !== wB[f]) {
      diffs[f] = { v16: wA[f], v17: wB[f] };
    }
  }
  const dgA = JSON.stringify(wA.damageGraph);
  const dgB = JSON.stringify(wB.damageGraph);
  if (dgA !== dgB) {
    diffs['damageGraph'] = { v16: wA.damageGraph, v17: wB.damageGraph };
  }
  if (Object.keys(diffs).length > 0) {
    weaponDiffs.push({ name, diffs });
  }
}

// 2. Analyze Attachment Differences across common weapons
// Categorize attachment changes
const addedAttachments = []; // new attachment names on existing weapons
const removedAttachments = [];
const modifiedModifiers = []; // attachmentModifiers changed
const modifiedInfoOnly = []; // only info/infolist changed
const modifiedBoth = [];

let totalCommonAtts = 0;
let attsWithModDiff = 0;

for (const name in map16) {
  if (!map17[name]) continue;
  const atts16 = map16[name].attachments || {};
  const atts17 = map17[name].attachments || {};

  // Check slots
  const allSlots = new Set([...Object.keys(atts16), ...Object.keys(atts17)]);
  for (const slot of allSlots) {
    const s16 = atts16[slot] || {};
    const s17 = atts17[slot] || {};

    const names16 = Object.keys(s16);
    const names17 = Object.keys(s17);

    for (const aName of names17) {
      if (!s16[aName]) {
        addedAttachments.push({ weapon: name, slot, attachment: aName });
      }
    }
    for (const aName of names16) {
      if (!s17[aName]) {
        removedAttachments.push({ weapon: name, slot, attachment: aName });
      }
    }

    for (const aName of names16) {
      if (!s17[aName]) continue;
      totalCommonAtts++;
      const item16 = s16[aName];
      const item17 = s17[aName];

      const mods16Str = JSON.stringify(item16.attachmentModifiers || {});
      const mods17Str = JSON.stringify(item17.attachmentModifiers || {});
      const modsDiff = mods16Str !== mods17Str;

      const info16Str = JSON.stringify(item16.info || item16.infolist || '');
      const info17Str = JSON.stringify(item17.info || item17.infolist || '');
      const infoDiff = info16Str !== info17Str;

      if (modsDiff && infoDiff) {
        modifiedBoth.push({ weapon: name, slot, attachment: aName });
        attsWithModDiff++;
      } else if (modsDiff) {
        modifiedModifiers.push({ weapon: name, slot, attachment: aName });
        attsWithModDiff++;
      } else if (infoDiff) {
        modifiedInfoOnly.push({ weapon: name, slot, attachment: aName });
      }
    }
  }
}

console.log('--- SUMMARY ---');
console.log('Weapons with base stat diffs:', weaponDiffs.length);
console.log('Total common weapon-attachment instances examined:', totalCommonAtts);
console.log('Attachments with modifier diffs:', attsWithModDiff, `(Both: ${modifiedBoth.length}, Mod-only: ${modifiedModifiers.length})`);
console.log('Attachments with info-only diffs:', modifiedInfoOnly.length);
console.log('Newly added attachment instances to existing weapons:', addedAttachments.length);
console.log('Removed attachment instances from existing weapons:', removedAttachments.length);

// Let us inspect unique attachment names among modified modifiers
const uniqueModifiedAttNames = new Set([...modifiedBoth, ...modifiedModifiers].map(a => a.attachment));
console.log('Unique attachment names with modifier diffs:', uniqueModifiedAttNames.size);
console.log('Sample modified attachment names:', [...uniqueModifiedAttNames].slice(0, 30));

// Check unique added attachments
const uniqueAddedAttNames = new Set(addedAttachments.map(a => a.attachment));
console.log('Unique new attachment names added:', uniqueAddedAttNames.size);
console.log('Sample new attachment names:', [...uniqueAddedAttNames].slice(0, 30));

// Check schema differences in attachment objects
let infoConvertedFromList = 0;
for (const item of modifiedInfoOnly.slice(0, 500)) {
  const s16 = map16[item.weapon].attachments[item.slot][item.attachment];
  const s17 = map17[item.weapon].attachments[item.slot][item.attachment];
  if (s16.infolist && typeof s17.info === 'string') {
    infoConvertedFromList++;
  }
}
console.log('Sample infoConvertedFromList in first 500 info diffs:', infoConvertedFromList);
