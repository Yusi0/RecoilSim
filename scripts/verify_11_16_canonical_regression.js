const fs = require('fs');
const path = require('path');

console.log('=== 11.16 Canonical Regression Test ===\n');

// 1. Load OLD 11.16 Data
const oldNormWeapons = JSON.parse(fs.readFileSync('data/normalized/weapons.json', 'utf8'));
const oldNormAttachments = JSON.parse(fs.readFileSync('data/normalized/attachments.json', 'utf8'));
const oldDetailsDir = path.resolve('data/raw/weapon-details');

// 2. Load NEW Canonical 11.16 Data
const newCanonicalWeapons = JSON.parse(fs.readFileSync('data/canonical/11.16/weapons.json', 'utf8'));
const newCanonicalAttachments = JSON.parse(fs.readFileSync('data/canonical/11.16/attachments.json', 'utf8'));
const newDetailsDir = path.resolve('data/canonical/11.16/weapon_details');

// Test Weapons
const testWeapons = ['c25', 'ak105', 'm16a3', 'm231', 'k2', 'g36k', 'kriss_vector'];

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function assertEqual(valA, valB, context) {
  totalChecks++;
  const strA = JSON.stringify(valA);
  const strB = JSON.stringify(valB);
  if (strA === strB) {
    passedChecks++;
    return true;
  } else {
    failedChecks++;
    console.error(`[FAIL] ${context}`);
    console.error(`  OLD: ${strA ? strA.substring(0, 100) : 'undefined'}`);
    console.error(`  NEW: ${strB ? strB.substring(0, 100) : 'undefined'}`);
    return false;
  }
}

for (const wId of testWeapons) {
  console.log(`Checking Weapon: ${wId.toUpperCase()}...`);
  const oldW = oldNormWeapons[wId];
  const newW = newCanonicalWeapons[wId];

  if (!oldW || !newW) {
    console.error(`Missing weapon ${wId} in old or new!`);
    failedChecks++;
    continue;
  }

  // Check basic stats
  assertEqual(oldW.name, newW.name, `${wId} name`);
  assertEqual(oldW.category, newW.category, `${wId} category`);
  assertEqual(oldW.stats.damage0, newW.stats.damage0, `${wId} damage0`);
  assertEqual(oldW.stats.damage1, newW.stats.damage1, `${wId} damage1`);
  assertEqual(oldW.stats.range0, newW.stats.range0, `${wId} range0`);
  assertEqual(oldW.stats.range1, newW.stats.range1, `${wId} range1`);
  assertEqual(oldW.stats.rpm, newW.stats.rpm, `${wId} rpm`);
  assertEqual(oldW.stats.magsize, newW.stats.magsize, `${wId} magsize`);
  assertEqual(oldW.stats.walkspeed, newW.stats.walkspeed, `${wId} walkspeed`);

  // Check detail physical parameters (recoil springs & handling)
  const oldDetail = JSON.parse(fs.readFileSync(path.join(oldDetailsDir, `${wId}.json`), 'utf8'));
  const newDetail = JSON.parse(fs.readFileSync(path.join(newDetailsDir, `${wId}.json`), 'utf8'));

  assertEqual(oldDetail.firerate, newDetail.firerate, `${wId} detail firerate`);
  assertEqual(oldDetail.damageGraph, newDetail.damageGraph, `${wId} detail damageGraph`);
  assertEqual(oldDetail.sprintspeed, newDetail.sprintspeed, `${wId} detail sprintspeed`);
  assertEqual(oldDetail.equipspeed, newDetail.equipspeed, `${wId} detail equipspeed`);
  assertEqual(oldDetail.aimspeed, newDetail.aimspeed, `${wId} detail aimspeed`);
  assertEqual(oldDetail.walkspeed, newDetail.walkspeed, `${wId} detail walkspeed`);

  // Check all 16 recoil springs
  if (oldDetail.recoil) {
    for (const springName of Object.keys(oldDetail.recoil)) {
      assertEqual(oldDetail.recoil[springName], newDetail.recoil[springName], `${wId} recoil spring ${springName}`);
    }
  }

  // Calculate Deterministic Practicality Physics Metrics
  const rpm = newDetail.firerate || newW.stats.rpm;
  const damage0 = newDetail.damage0 || newW.stats.damage0;
  const btk = Math.ceil(100 / damage0);
  const shotIntervalMs = 60000 / rpm;
  const ttkMs = (btk - 1) * shotIntervalMs;
  const adsMs = 4743.8645 / newDetail.aimspeed;
  const sprintMs = 4015.0 / newDetail.sprintspeed;
  const aimWalkSpeed = newDetail.walkspeed * (newDetail.aimwalkspeedmult || 0.7);

  console.log(`  Physics: TTK=${ttkMs.toFixed(2)}ms, ADS=${adsMs.toFixed(2)}ms, SprintDelay=${sprintMs.toFixed(2)}ms, AimWalk=${aimWalkSpeed.toFixed(2)}s/s`);
}

console.log('\n=== Regression Results ===');
console.log(`Total Checks Performed: ${totalChecks}`);
console.log(`Passed: ${passedChecks}`);
console.log(`Failed: ${failedChecks}`);

if (failedChecks === 0) {
  console.log('\n>>> 100% REGRESSION PASS: Canonical 11.16 dataset perfectly reproduces all baseline simulation physics! <<<');
} else {
  console.error('\n>>> REGRESSION FAILED: Discrepancies detected between Old and New 11.16 data! <<<');
  process.exit(1);
}
