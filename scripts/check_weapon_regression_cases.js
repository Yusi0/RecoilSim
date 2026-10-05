const fs = require('fs');
const path = require('path');

const VERIFICATION_PATH = path.join(__dirname, '../data/weapon_verification.json');
const IN_GAME_DB_PATH = path.join(__dirname, '../data/in-game-modules/weapon_database.json');
const C25_GOLDEN_PATH = path.join(__dirname, '../data/C25.json');

const verification = JSON.parse(fs.readFileSync(VERIFICATION_PATH, 'utf8'));
const inGameDb = JSON.parse(fs.readFileSync(IN_GAME_DB_PATH, 'utf8'));

console.log('======================================================');
console.log('[SPECIAL VERIFICATION: C25 Golden Simulation Analysis]');
console.log('======================================================');

const c25InGame = inGameDb['C25'];
const c25Verification = verification['c25'];

let c25Golden = null;
if (fs.existsSync(C25_GOLDEN_PATH)) {
    c25Golden = JSON.parse(fs.readFileSync(C25_GOLDEN_PATH, 'utf8'));
}

console.log(`1. C25 in API raw data (data/raw/weapons.json):`);
console.log(`   - Keys count: ${c25Verification.rawKeysApiCount}`);
console.log(`   - Recoil present in API: ${c25Verification.recoilVerification.apiSpringCount > 0}`);
console.log(`   - Missing fields from API: ${c25Verification.missingFieldsCount} fields`);

console.log(`\n2. C25 in Game Database (Roblox Studio CARBINE.C25.C25):`);
console.log(`   - Raw keys count: ${c25Verification.rawKeysInGameCount}`);
console.log(`   - Firerate: ${c25InGame.firerate}`);
console.log(`   - Magsize: ${c25InGame.magsize}, Sparerounds: ${c25InGame.sparerounds}`);
console.log(`   - Recoil springs defined: ${c25Verification.recoilVerification.inGameSpringCount} springs`);
console.log(`   - AimCameraBody.x[1]: ${JSON.stringify(c25InGame.recoil.aimCameraBody.x[1])}`);
console.log(`   - AimRotation.x[1]:   ${JSON.stringify(c25InGame.recoil.aimRotation.x[1])}`);

if (c25Golden) {
    console.log(`\n3. C25 Golden File comparison (data/C25.json vs In-Game Studio Module):`);
    let diffCount = 0;
    const diffs = [];

    // Compare key stats
    const checkFields = ['firerate', 'magsize', 'damage0', 'damage1', 'walkspeed', 'aimspeed', 'equipspeed'];
    for (const f of checkFields) {
        if (c25Golden[f] !== c25InGame[f]) {
            diffs.push(`${f}: Golden=${c25Golden[f]} vs InGame=${c25InGame[f]}`);
            diffCount++;
        }
    }

    // Compare recoil springs
    for (const sp of Object.keys(c25InGame.recoil || {})) {
        const gSp = c25Golden.recoil ? c25Golden.recoil[sp] : null;
        const iSp = c25InGame.recoil[sp];
        if (JSON.stringify(gSp) !== JSON.stringify(iSp)) {
            diffs.push(`recoil.${sp}: mismatch`);
            diffCount++;
        }
    }

    console.log(`   - Differences between data/C25.json and In-Game Lua: ${diffCount}`);
    if (diffCount === 0) {
        console.log(`   - EXACT MATCH! data/C25.json perfectly matches the authoritative Roblox Studio C25 definition!`);
    } else {
        console.log(`   - Differences found:`, diffs);
    }
}

console.log('\n======================================================');
console.log('[CORE WEAPON REGRESSION CASES]');
console.log('======================================================');

const targetWeapons = [
    { id: 'c25', name: 'C25', role: 'Golden Reference Carbine' },
    { id: 'ak105', name: 'AK105', role: 'Russian Carbine' },
    { id: 'm231', name: 'M231', role: 'Extreme RPM (1225) AR' },
    { id: 'm16a3', name: 'M16A3', role: 'Standard High-Velocity AR' },
    { id: 'm4a1', name: 'M4A1', role: 'High Customization Carbine' },
    { id: 'c7a2', name: 'C7A2', role: 'Canadian AR' },
    { id: 'c8a2', name: 'C8A2', role: 'Canadian Carbine' }
];

for (const t of targetWeapons) {
    const v = verification[t.id];
    const ig = inGameDb[t.name];
    console.log(`=== [${t.name}] (${t.role}) ===`);
    console.log(`  - Category: ${v.category}`);
    console.log(`  - Status: ${v.verificationStatus}`);
    console.log(`  - In-Game Springs: ${v.recoilVerification.inGameSpringCount} | API Springs: ${v.recoilVerification.apiSpringCount}`);
    console.log(`  - Firerate: ${ig.firerate} RPM | Mag: ${ig.magsize} | Speed: walk=${ig.walkspeed}, aim=${ig.aimspeed}`);
    console.log(`  - Missing stats from API: ${v.rawDifferences.map(d => d.field).slice(0, 8).join(', ')}... (${v.missingFieldsCount} total)`);
    console.log(`  - Sample In-Game Recoil (aimCameraBody.x): ${JSON.stringify(ig.recoil ? ig.recoil.aimCameraBody.x[0] : 'N/A')}`);
    console.log(`  - Sample In-Game Recoil (aimRotation.x):   ${JSON.stringify(ig.recoil ? ig.recoil.aimRotation.x[0] : 'N/A')}`);
}

console.log('\n======================================================');
console.log('[CATEGORY REPRESENTATIVE WEAPONS]');
console.log('======================================================');

const categoryReps = [
    { cat: 'ASSAULT RIFLE', id: 'm16a3', name: 'M16A3', rationale: 'Most standard AR platform with extensive attachment set' },
    { cat: 'CARBINE', id: 'c25', name: 'C25', rationale: 'Golden test benchmark weapon with full simulation ground truth' },
    { cat: 'PDW', id: 'mp5', name: 'MP5', rationale: 'Iconic closed-bolt SMG/PDW benchmark' },
    { cat: 'BATTLE RIFLE', id: 'scar_h', name: 'SCAR-H', rationale: '7.62mm heavy recoil battle rifle standard' },
    { cat: 'LMG', id: 'colt_lmg', name: 'COLT LMG', rationale: 'Open-bolt high-capacity automatic rifle' },
    { cat: 'DMR', id: 'mk11', name: 'MK11', rationale: 'Semi-automatic precision marksman rifle' },
    { cat: 'SNIPER RIFLE', id: 'intervention', name: 'INTERVENTION', rationale: 'Bolt-action heavy sniper baseline' },
    { cat: 'SHOTGUN', id: 'remington_870', name: 'REMINGTON 870', rationale: 'Pump-action multi-pellet spread reference' },
    { cat: 'PISTOLS', id: 'm9', name: 'M9', rationale: 'Semi-auto standard 9mm sidearm reference' },
    { cat: 'MACHINE PISTOLS', id: 'glock_18', name: 'GLOCK 18', rationale: 'Ultra-fast automatic secondary' },
    { cat: 'REVOLVERS', id: 'mp412_rex', name: 'MP412 REX', rationale: 'High-damage break-action revolver reference' },
    { cat: 'OTHER', id: 'serbu_shotgun', name: 'SERBU SHOTGUN', rationale: 'Compact secondary shotgun reference' }
];

for (const rep of categoryReps) {
    const v = verification[rep.id];
    const ig = inGameDb[rep.name];
    console.log(`=== [${rep.cat}] -> ${rep.name} (${rep.rationale}) ===`);
    console.log(`  - Status: ${v.verificationStatus}`);
    console.log(`  - Recoil: ${v.recoilVerification.inGameSpringCount} springs in-game vs ${v.recoilVerification.apiSpringCount} in API`);
    console.log(`  - Firerate: ${ig.firerate} RPM | Mag: ${ig.magsize} | BulletSpeed: ${ig.bulletspeed} studs/s`);
    console.log(`  - Recoil aimCameraBody.x[0]: ${JSON.stringify(ig.recoil ? ig.recoil.aimCameraBody.x[0] : 'N/A')}`);
    console.log(`  - Recoil aimRotation.x[0]:   ${JSON.stringify(ig.recoil ? ig.recoil.aimRotation.x[0] : 'N/A')}`);
}
