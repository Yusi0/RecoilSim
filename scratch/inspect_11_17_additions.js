const fs = require('fs');

const w16 = JSON.parse(fs.readFileSync('data/raw/weapons.json', 'utf8'));
const w17 = JSON.parse(fs.readFileSync('data/raw/11.17weapons.json', 'utf8'));
const wIngame = JSON.parse(fs.readFileSync('data/in-game-modules/weapon_database.json', 'utf8'));
const attDb = JSON.parse(fs.readFileSync('data/in-game-modules/attachment_database.json', 'utf8'));

// 1. Inspect 8 new weapons in 11.17 API
const map16 = {};
for (const cat in w16) for (const w of w16[cat]) map16[w.name] = w;

const newWeaponDetails = [];
for (const cat in w17) {
  for (const w of w17[cat]) {
    if (!map16[w.name]) {
      newWeaponDetails.push({
        name: w.name,
        displayName: w.displayName,
        category: cat,
        rank: w.rank,
        exclusiveUnlock: w.exclusiveUnlock,
        superTester: w.superTester,
        in1116Ingame: !!wIngame[w.name]
      });
    }
  }
}
console.log('--- 8 New Weapons in 11.17 API ---');
console.table(newWeaponDetails);

// 2. Check conversions that had missing modifiers in 11.16 API
const checkConversions = [
  { weapon: 'M4A1', slot: 'Other', att: 'AR 7.62x39 Conversion' },
  { weapon: 'AUG A1', slot: 'Other', att: 'AUG 9MM Conversion' },
  { weapon: 'SAIGA-12', slot: 'Other', att: 'Saiga 545' },
  { weapon: 'SVK12E', slot: 'Other', att: 'SVK12E 7.62 Conversion' }
];

console.log('\n--- Checking previously missing conversions in 11.17 API ---');
for (const c of checkConversions) {
  const wA = map16[c.weapon];
  const wB = (w17[wA?.category] || []).find(w => w.name === c.weapon);
  const a16 = wA?.attachments?.[c.slot]?.[c.att];
  const a17 = wB?.attachments?.[c.slot]?.[c.att];
  const count16 = a16?.attachmentModifiers?.relativeMultipliers?.length || 0;
  const count17 = a17?.attachmentModifiers?.relativeMultipliers?.length || 0;
  console.log(`${c.weapon} - ${c.att}: 11.16_API_mods=${count16} | 11.17_API_mods=${count17}`);
}

// 3. Check Extended Magazine across all weapons in 11.16 vs 11.17 API
let extMagCount16 = 0, extMagCount17 = 0;
let extMagWithMods16 = 0, extMagWithMods17 = 0;

for (const cat in w16) {
  for (const w of w16[cat]) {
    for (const s in w.attachments) {
      if (w.attachments[s]['Extended Magazine']) {
        extMagCount16++;
        const mods = w.attachments[s]['Extended Magazine'].attachmentModifiers;
        if (mods && ((mods.setters && mods.setters.length) || (mods.relativeMultipliers && mods.relativeMultipliers.length))) {
          extMagWithMods16++;
        }
      }
    }
  }
}

for (const cat in w17) {
  for (const w of w17[cat]) {
    for (const s in w.attachments) {
      if (w.attachments[s]['Extended Magazine']) {
        extMagCount17++;
        const mods = w.attachments[s]['Extended Magazine'].attachmentModifiers;
        if (mods && ((mods.setters && mods.setters.length) || (mods.relativeMultipliers && mods.relativeMultipliers.length))) {
          extMagWithMods17++;
        }
      }
    }
  }
}
console.log(`\nExtended Magazine instances: 11.16=${extMagCount16} (with mods: ${extMagWithMods16}) | 11.17=${extMagCount17} (with mods: ${extMagWithMods17})`);
