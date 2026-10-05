const fs = require('fs');

console.log('Loading databases to find API_DATA_RESTORATION candidates...');
const w16 = JSON.parse(fs.readFileSync('data/raw/weapons.json', 'utf8'));
const w17 = JSON.parse(fs.readFileSync('data/raw/11.17weapons.json', 'utf8'));
const wIn = JSON.parse(fs.readFileSync('data/in-game-modules/weapon_database.json', 'utf8'));
const attDb = JSON.parse(fs.readFileSync('data/in-game-modules/attachment_database.json', 'utf8'));

const map16 = {};
for (const cat in w16) for (const w of w16[cat]) map16[w.name] = w;

const map17 = {};
for (const cat in w17) for (const w of w17[cat]) map17[w.name] = w;

// 1. Check Weapon Base Fields
// Did any weapon in 11.17 API gain fields that were in 11.16 Ingame but missing in 11.16 API?
const weaponRestorations = [];
for (const name in map16) {
  const a16 = map16[name];
  const a17 = map17[name];
  const ingame = wIn[name];
  if (!a17 || !ingame) continue;

  for (const k of Object.keys(a17)) {
    if (a16[k] === undefined && a17[k] !== undefined) {
      weaponRestorations.push({ weapon: name, field: k, value17: a17[k], ingameValue: ingame[k] });
    }
  }
}
console.log('Weapon base field restorations count:', weaponRestorations.length);

// 2. Check Attachment Modifiers
// For each attachment on each weapon:
// Check if 11.16 Ingame had modifier M, 11.16 API lacked M, and 11.17 API now has M
const attRestorations = [];
let totalAttsChecked = 0;

for (const name in map16) {
  const atts16 = map16[name].attachments || {};
  const atts17 = map17[name]?.attachments || {};

  for (const slot in atts16) {
    for (const aName in atts16[slot]) {
      const item16 = atts16[slot][aName];
      const item17 = atts17[slot]?.[aName];
      if (!item17) continue;
      totalAttsChecked++;

      // Check global att definition in 11.16 Ingame
      const globalAtt = attDb[aName];
      if (!globalAtt || !globalAtt.attachmentModifiers) continue;

      const mods16 = item16.attachmentModifiers || {};
      const mods17 = item17.attachmentModifiers || {};
      const modsIn = globalAtt.attachmentModifiers;

      // Count modifiers
      const c16 = (mods16.relativeMultipliers?.length || 0) + (mods16.setters?.length || 0);
      const c17 = (mods17.relativeMultipliers?.length || 0) + (mods17.setters?.length || 0);
      const cIn = (modsIn.relativeMultipliers?.length || 0) + (modsIn.setters?.length || 0);

      if (c16 < 3 && cIn > 5 && c17 > 5) {
        attRestorations.push({
          weapon: name,
          slot,
          attachment: aName,
          c16,
          cIn,
          c17
        });
      }
    }
  }
}

console.log('Checked attachment instances:', totalAttsChecked);
console.log('Attachment restorations (global missing -> restored in 11.17 API):', attRestorations.length);
if (attRestorations.length > 0) {
  console.log('Sample restorations:', attRestorations.slice(0, 10));
}
