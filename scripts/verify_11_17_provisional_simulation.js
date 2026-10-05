const fs = require('fs');
const path = require('path');

console.log('=== 11.17 Provisional Simulation Comparison Test ===\n');

const w16Dir = path.resolve('data/canonical/11.16');
const w17Dir = path.resolve('data/canonical/11.17-provisional');

const w16Weapons = JSON.parse(fs.readFileSync(path.join(w16Dir, 'weapons.json'), 'utf8'));
const w17Weapons = JSON.parse(fs.readFileSync(path.join(w17Dir, 'weapons.json'), 'utf8'));

const testCases = [
  { id: 'k2', name: 'K2 (Rebalanced Rifle)' },
  { id: 'hardballer', name: 'HARDBALLER (Buffed RPM)' },
  { id: 'jury', name: 'JURY (Double Action 360 RPM)' },
  { id: 'spas_12', name: 'SPAS-12 (Pump Action Removal & Capacity 7)' },
  { id: 'g36k', name: 'G36K / AR36K (Remodel & Rebalance)' },
  { id: 'regulator', name: 'REGULATOR (Brand New 11.17 DMR)' },
  { id: 'spear_lt', name: 'SPEAR LT (Brand New 11.17 AR)' }
];

for (const tc of testCases) {
  console.log(`--- [${tc.name}] ---`);
  const w16 = w16Weapons[tc.id];
  const w17 = w17Weapons[tc.id];

  if (w16) {
    const detail16 = JSON.parse(fs.readFileSync(path.join(w16Dir, 'weapon_details', `${tc.id}.json`), 'utf8'));
    const rpm16 = detail16.firerate || w16.stats.rpm;
    const dmg16 = detail16.damage0 || w16.stats.damage0;
    const btk16 = Math.ceil(100 / dmg16);
    const ttk16 = (btk16 - 1) * (60000 / rpm16);
    console.log(`  11.16 VERIFIED:   Damage=${dmg16}, Range=${w16.stats.range0}-${w16.stats.range1}, RPM=${rpm16}, BTK=${btk16}, TTK=${ttk16.toFixed(2)}ms`);
  } else {
    console.log(`  11.16 VERIFIED:   [DOES NOT EXIST IN 11.16]`);
  }

  if (w17) {
    const detail17 = JSON.parse(fs.readFileSync(path.join(w17Dir, 'weapon_details', `${tc.id}.json`), 'utf8'));
    const rpm17 = detail17.firerate || w17.stats.rpm;
    const dmg17 = detail17.damage0 || w17.stats.damage0;
    const btk17 = Math.ceil(100 / dmg17);
    const ttk17 = (btk17 - 1) * (60000 / rpm17);
    const recoilStatus = detail17._provenance.recoil_springs;
    console.log(`  11.17 PROVISIONAL: Damage=${dmg17}, Range=${w17.stats.range0}-${w17.stats.range1}, RPM=${rpm17}, BTK=${btk17}, TTK=${ttk17.toFixed(2)}ms (Recoil: ${recoilStatus})`);
  }
  console.log();
}
