const fs = require('fs');

const w16 = JSON.parse(fs.readFileSync('data/raw/weapons.json', 'utf8'));
const w17 = JSON.parse(fs.readFileSync('data/raw/11.17weapons.json', 'utf8'));

// Find a weapon where Stubby Grip or Angled Grip has a modifier diff
function findModDiff(attName) {
  for (const cat in w16) {
    for (const w of w16[cat]) {
      const name = w.name;
      const wA = w;
      const wB = (w17[cat] || []).find(x => x.name === name);
      if (!wB) continue;
      for (const slot of ['Underbarrel', 'Other', 'Barrel', 'Sight']) {
        const itemA = wA.attachments?.[slot]?.[attName];
        const itemB = wB.attachments?.[slot]?.[attName];
        if (itemA && itemB) {
          const modA = JSON.stringify(itemA.attachmentModifiers || {});
          const modB = JSON.stringify(itemB.attachmentModifiers || {});
          if (modA !== modB) {
            console.log(`Found modifier diff for ${attName} on weapon ${name} in slot ${slot}:`);
            console.log('--- 11.16 API ---');
            console.log(JSON.stringify(itemA.attachmentModifiers, null, 2));
            console.log('--- 11.17 API ---');
            console.log(JSON.stringify(itemB.attachmentModifiers, null, 2));
            return;
          }
        }
      }
    }
  }
  console.log(`No modifier diff found for ${attName}`);
}

findModDiff('Stubby Grip');
findModDiff('Angled Grip');
findModDiff('Green Laser');
findModDiff('Silent');
