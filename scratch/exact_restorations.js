const fs = require('fs');

const w16 = JSON.parse(fs.readFileSync('data/raw/weapons.json', 'utf8'));
const w17 = JSON.parse(fs.readFileSync('data/raw/11.17weapons.json', 'utf8'));
const attDb = JSON.parse(fs.readFileSync('data/in-game-modules/attachment_database.json', 'utf8'));

const map16 = {};
for (const cat in w16) for (const w of w16[cat]) map16[w.name] = w;

const map17 = {};
for (const cat in w17) for (const w of w17[cat]) map17[w.name] = w;

const allRestorations = [];

for (const name in map16) {
  const atts16 = map16[name].attachments || {};
  const atts17 = map17[name]?.attachments || {};

  for (const slot in atts16) {
    for (const aName in atts16[slot]) {
      const item16 = atts16[slot][aName];
      const item17 = atts17[slot]?.[aName];
      if (!item17) continue;

      const globalAtt = attDb[aName];
      if (!globalAtt || !globalAtt.attachmentModifiers) continue;

      const str16 = JSON.stringify(item16.attachmentModifiers || {});
      const str17 = JSON.stringify(item17.attachmentModifiers || {});
      const strIn = JSON.stringify(globalAtt.attachmentModifiers || {});

      // If 11.16 API differed from 11.16 Ingame, but 11.17 API matches 11.16 Ingame exactly!
      if (str16 !== strIn && str17 === strIn) {
        allRestorations.push({
          weapon: name,
          slot,
          attachment: aName,
          diffType: 'EXACT_MATCH_TO_11_16_INGAME'
        });
      }
    }
  }
}

console.log('Total exact restorations (11.16 API != 11.16 Ingame, but 11.17 API == 11.16 Ingame):', allRestorations.length);
console.log('Sample exact restorations:');
console.table(allRestorations.slice(0, 35));
