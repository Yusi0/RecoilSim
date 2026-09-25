import fs from 'fs';
import path from 'path';
import { WeaponsParser } from './WeaponsParser';

const rawFilePath = path.join(__dirname, '../../../data/raw/weapons.json');
const outputDir = path.join(__dirname, '../../../data/normalized');

console.log(`[Parser Runner] Reading raw file from: ${rawFilePath}`);

if (!fs.existsSync(rawFilePath)) {
    console.error(`[Error] Raw file does not exist at: ${rawFilePath}`);
    process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(rawFilePath, 'utf-8'));
const parser = new WeaponsParser();

console.log('[Parser Runner] Parsing weapons and attachments...');
const result = parser.parse(rawData);

console.log('\n=== Parsing Complete ===');
console.log(`Total Weapons Parsed: ${result.stats.totalWeaponsParsed}`);
console.log(`Total Attachment Variants: ${result.stats.totalUniqueAttachmentVariants}`);
console.log(`  - Shared/Common Attachment Variants: ${result.stats.commonAttachmentCount}`);
console.log(`  - Weapon-Specific/Distinct Attachment Variants: ${result.stats.weaponSpecificAttachmentCount}`);
console.log(`Warnings Generated: ${result.warnings.length}`);

if (result.warnings.length > 0) {
    console.log('\n--- Sample Warnings (Top 10) ---');
    result.warnings.slice(0, 10).forEach((w, i) => console.log(`${i + 1}. ${w}`));
}

// Prepare Output
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const weaponsOutputObj: Record<string, any> = {};
for (const [id, w] of result.weapons.entries()) {
    weaponsOutputObj[id] = w;
}

const attachmentsOutputObj: Record<string, any> = {};
for (const [id, a] of result.attachments.entries()) {
    attachmentsOutputObj[id] = a;
}

const weaponsOutputPath = path.join(outputDir, 'weapons.json');
const attachmentsOutputPath = path.join(outputDir, 'attachments.json');

fs.writeFileSync(weaponsOutputPath, JSON.stringify(weaponsOutputObj, null, 2), 'utf-8');
fs.writeFileSync(attachmentsOutputPath, JSON.stringify(attachmentsOutputObj, null, 2), 'utf-8');

console.log(`\nNormalized files successfully written:`);
console.log(` - Weapons: ${weaponsOutputPath} (${(fs.statSync(weaponsOutputPath).size / (1024 * 1024)).toFixed(2)} MB)`);
console.log(` - Attachments: ${attachmentsOutputPath} (${(fs.statSync(attachmentsOutputPath).size / (1024 * 1024)).toFixed(2)} MB)`);
