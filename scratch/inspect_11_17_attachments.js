const fs = require('fs');

const w16 = JSON.parse(fs.readFileSync('data/raw/weapons.json', 'utf8'));
const w17 = JSON.parse(fs.readFileSync('data/raw/11.17weapons.json', 'utf8'));
const attDb = JSON.parse(fs.readFileSync('data/in-game-modules/attachment_database.json', 'utf8'));

// Check C25 attachments in 11.16 vs 11.17
function getAtt(wData, slot, name) {
  if (!wData || !wData.attachments || !wData.attachments[slot]) return null;
  return wData.attachments[slot][name] || null;
}

const c25_16 = w16.CARBINE.find(w => w.name === 'C25');
const c25_17 = w17.CARBINE.find(w => w.name === 'C25');

console.log('--- C25 Stubby Grip ---');
const stubby16 = getAtt(c25_16, 'Underbarrel', 'Stubby Grip');
const stubby17 = getAtt(c25_17, 'Underbarrel', 'Stubby Grip');
const stubbyGlobal = attDb['Stubby Grip'];

console.log('11.16 Stubby in API:', JSON.stringify(stubby16, null, 2));
console.log('11.17 Stubby in API:', JSON.stringify(stubby17, null, 2));
console.log('11.16 Global Stubby in Ingame:', stubbyGlobal ? Object.keys(stubbyGlobal) : 'N/A');

console.log('\n--- C25 Angled Grip ---');
const angled16 = getAtt(c25_16, 'Underbarrel', 'Angled Grip');
const angled17 = getAtt(c25_17, 'Underbarrel', 'Angled Grip');
console.log('11.16 Angled in API:', JSON.stringify(angled16, null, 2));
console.log('11.17 Angled in API:', JSON.stringify(angled17, null, 2));

console.log('\n--- C25 Green Laser ---');
const green16 = getAtt(c25_16, 'Other', 'Green Laser');
const green17 = getAtt(c25_17, 'Other', 'Green Laser');
console.log('11.16 Green Laser in API:', JSON.stringify(green16, null, 2));
console.log('11.17 Green Laser in API:', JSON.stringify(green17, null, 2));

console.log('\n--- M4A1 Extended Magazine ---');
const m4a1_16 = w16.CARBINE.find(w => w.name === 'M4A1');
const m4a1_17 = w17.CARBINE.find(w => w.name === 'M4A1');
const ext16 = getAtt(m4a1_16, 'Other', 'Extended Magazine');
const ext17 = getAtt(m4a1_17, 'Other', 'Extended Magazine');
console.log('11.16 M4A1 Ext Mag in API:', JSON.stringify(ext16, null, 2));
console.log('11.17 M4A1 Ext Mag in API:', JSON.stringify(ext17, null, 2));
