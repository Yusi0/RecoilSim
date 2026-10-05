const fs = require('fs');

const wIn = JSON.parse(fs.readFileSync('data/in-game-modules/weapon_database.json', 'utf8'));
const w16Api = JSON.parse(fs.readFileSync('data/raw/weapons.json', 'utf8'));
const w17Api = JSON.parse(fs.readFileSync('data/raw/11.17weapons.json', 'utf8'));
const c25Detail = JSON.parse(fs.readFileSync('data/raw/weapon-details/c25.json', 'utf8'));
const attDb = JSON.parse(fs.readFileSync('data/in-game-modules/attachment_database.json', 'utf8'));

// Collect all unique fields from:
// 1. In-game weapon definitions
const inGameWeaponFields = new Set();
for (const wName in wIn) {
  for (const k of Object.keys(wIn[wName])) inGameWeaponFields.add(k);
}

// 2. API weapon fields
const apiWeaponFields = new Set();
for (const cat in w16Api) {
  for (const w of w16Api[cat]) {
    for (const k of Object.keys(w)) apiWeaponFields.add(k);
  }
}

// 3. Detail weapon fields
const detailWeaponFields = new Set(Object.keys(c25Detail));

// 4. In-game attachment fields
const inGameAttFields = new Set();
for (const aName in attDb) {
  for (const k of Object.keys(attDb[aName])) inGameAttFields.add(k);
}

// 5. API attachment fields
const apiAttFields = new Set();
for (const cat in w16Api) {
  for (const w of w16Api[cat]) {
    for (const slot in w.attachments) {
      for (const a in w.attachments[slot]) {
        for (const k of Object.keys(w.attachments[slot][a])) apiAttFields.add(k);
      }
    }
  }
}

console.log('In-game Weapon Fields (' + inGameWeaponFields.size + '):', [...inGameWeaponFields].sort());
console.log('\nAPI Weapon Fields (' + apiWeaponFields.size + '):', [...apiWeaponFields].sort());
console.log('\nDetail Weapon Fields (' + detailWeaponFields.size + '):', [...detailWeaponFields].sort());
console.log('\nIn-game Attachment Fields (' + inGameAttFields.size + '):', [...inGameAttFields].sort());
console.log('\nAPI Attachment Fields (' + apiAttFields.size + '):', [...apiAttFields].sort());
