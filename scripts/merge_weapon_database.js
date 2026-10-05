const fs = require('fs');
const path = require('path');

const chunksDir = path.join(__dirname, '../data/in-game-modules/weapons/chunks');
const files = fs.readdirSync(chunksDir);

const manifestPath = path.join(__dirname, '../data/in-game-modules/weapons/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const merged = {};
const categoryBreakdown = {};

for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const content = fs.readFileSync(path.join(chunksDir, file), 'utf8');
    try {
        const data = JSON.parse(content);
        for (const [name, wpn] of Object.entries(data)) {
            merged[name] = wpn;
            categoryBreakdown[wpn.category] = (categoryBreakdown[wpn.category] || 0) + 1;
        }
    } catch (err) {
        console.error(`Failed parsing ${file}:`, err.message);
    }
}

console.log('Category breakdown in merged weapon database:');
for (const [cat, count] of Object.entries(categoryBreakdown)) {
    const expected = manifest[cat] ? manifest[cat].length : 0;
    console.log(`  ${cat.padEnd(20)}: ${count} / ${expected} ${count === expected ? 'OK' : 'MISMATCH!'}`);
}

const totalMerged = Object.keys(merged).length;
console.log(`Total merged weapons: ${totalMerged} / 416`);

// Check missing weapons from manifest
let missing = 0;
for (const [cat, list] of Object.entries(manifest)) {
    for (const name of list) {
        if (!merged[name]) {
            console.error(`Missing weapon: [${cat}] ${name}`);
            missing++;
        }
    }
}

if (missing === 0) {
    console.log('All 416 weapons from manifest successfully verified!');
} else {
    console.error(`Missing ${missing} weapons!`);
}

const outPath = path.join(__dirname, '../data/in-game-modules/weapon_database.json');
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
console.log(`Saved merged weapon database to ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
