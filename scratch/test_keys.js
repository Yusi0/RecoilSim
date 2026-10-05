const fs = require('fs');
const wIngame = JSON.parse(fs.readFileSync('data/in-game-modules/weapon_database.json', 'utf8'));
const c25 = wIngame['C25'];
console.log('Keys in wIngame["C25"]:', Object.keys(c25));
console.log('Sample wIngame["C25"] damage/rpm/range:');
for (const k of ['damage', 'damage0', 'damage1', 'range', 'range0', 'range1', 'ranges', 'rpm', 'firerate', 'headmult', 'multhead', 'torsomult', 'multtorso', 'walkspeed']) {
  if (k in c25) {
    console.log(`  ${k}:`, c25[k]);
  }
}
