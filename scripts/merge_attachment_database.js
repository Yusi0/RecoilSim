const fs = require('fs');
const path = require('path');

const catDir = path.join(__dirname, '../data/in-game-modules/categories');
const files = fs.readdirSync(catDir);

const merged = {};
const categoryBreakdown = {};

for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const catName = file.replace('.json', '').replace('_part1', '').replace('_part2', '');
    try {
        const content = fs.readFileSync(path.join(catDir, file), 'utf8');
        const data = JSON.parse(content);
        const count = Object.keys(data).length;
        categoryBreakdown[file] = count;
        for (const [name, att] of Object.entries(data)) {
            merged[name] = {
                category: catName,
                attachmentName: name,
                ...att
            };
        }
    } catch (err) {
        console.error(`Failed on file ${file}:`, err.message, 'Length:', fs.statSync(path.join(catDir, file)).size);
    }
}

console.log('Category files breakdown:', categoryBreakdown);
console.log('Total unique merged attachments:', Object.keys(merged).length);

const outPath = path.join(__dirname, '../data/in-game-modules/attachment_database.json');
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
console.log(`Saved to ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
