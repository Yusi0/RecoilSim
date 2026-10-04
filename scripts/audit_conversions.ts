import { WeaponsParser, WeaponCompiler } from '../src/core';
import rawWeaponsData from '../data/raw/weapons.json';
import * as fs from 'fs';
import * as path from 'path';
import { RecommendationEngine } from '../src/recommendation/RecommendationEngine';
import { getWeaponRecommendationProfile } from '../src/recommendation/WeaponRecommendationProfiles';

const parser = new WeaponsParser();
const parseResult = parser.parse(rawWeaponsData);
const compiler = new WeaponCompiler();
const engine = new RecommendationEngine();
const detailsDir = path.resolve(__dirname, '../data/raw/weapon-details');

console.log(`Checking attachments for conversions...`);

interface ConversionInfo {
    id: string;
    name: string;
    slot: string;
    weapons: string[];
    statPaths: string[];
    modifiers: any[];
}

const conversionsFound: Record<string, ConversionInfo> = {};

for (const [id, att] of parseResult.attachments.entries()) {
    const nameLower = (att.name || '').toLowerCase();
    const isConvName = nameLower.includes('conv') || nameLower.includes('conversion');
    
    const paths = new Set<string>();
    if (att.modifiers) {
        for (const m of att.modifiers) {
            if (m.indexPath) paths.add(m.indexPath.join('.'));
        }
    }

    const altersCore = paths.has('firerate') || paths.has('rpm') || paths.has('damage0') || paths.has('magsize') || paths.has('caliber') || paths.has('damage1');

    if (isConvName || (altersCore && (att.slot === 'Ammo' || att.slot === 'Other'))) {
        if (!conversionsFound[att.name]) {
            conversionsFound[att.name] = {
                id,
                name: att.name,
                slot: att.slot,
                weapons: [...att.compatibleWeaponIds],
                statPaths: Array.from(paths),
                modifiers: att.modifiers
            };
        }
    }
}

console.log(`Total conversion-type attachments found: ${Object.keys(conversionsFound).length}`);

// Sample 25 conversions
const samples = Object.values(conversionsFound).slice(0, 25);
console.table(samples.map(s => ({
    Name: s.name,
    Slot: s.slot,
    WeaponsCount: s.weapons.length,
    SampleWeapons: s.weapons.slice(0, 4).join(', '),
    ModifiedPaths: s.statPaths.slice(0, 4).join(', ')
})));

// Detailed weapon case studies
const TARGET_WEAPONS = ['m16a3', 'ak105', 'c25', 'm231', 'colt_smg_635', 'beowulf_ecr', 'fal_50_00'];

console.log('\n================================================================================');
console.log('DETAILED CONVERSION AUDIT FOR REPRESENTATIVE WEAPONS');
console.log('================================================================================');

for (const wId of TARGET_WEAPONS) {
    const norm = parseResult.weapons.get(wId);
    if (!norm) continue;

    const detailPath = path.join(detailsDir, `${wId}.json`);
    if (!fs.existsSync(detailPath)) continue;

    const baseData = JSON.parse(fs.readFileSync(detailPath, 'utf-8'));
    const profile = getWeaponRecommendationProfile(wId);

    // Find all conversions available for this weapon
    const weaponConversions: string[] = [];
    for (const [slot, vIds] of Object.entries(norm.attachmentSlots)) {
        for (const vId of vIds) {
            const att = parseResult.attachments.get(vId);
            if (att && conversionsFound[att.name]) {
                if (!weaponConversions.includes(att.name)) {
                    weaponConversions.push(att.name);
                }
            }
        }
    }

    console.log(`\nWEAPON: ${norm.displayName || norm.name} (${wId.toUpperCase()}, Category: ${norm.category})`);
    console.log(`- Base Stats: RPM=${baseData.firerate || baseData.rpm}, Dmg=${baseData.damage0}->${baseData.damage1}, Mag=${baseData.magsize}, Aimspeed=${baseData.aimspeed}, Sprintspeed=${baseData.sprintspeed}`);
    console.log(`- Recommendation Profile Candidate Slots: [${profile.candidateSlots.join(', ')}]`);
    console.log(`- Recommendation Profile Context Slots:   [${(profile.contextSlots || []).join(', ')}]`);
    console.log(`- Available Conversions (${weaponConversions.length}): ${weaponConversions.join(' | ') || 'None'}`);

    // If weapon has conversions, pick the first 2 and compile them
    for (const convName of weaponConversions.slice(0, 2)) {
        const convAtt = Object.values(conversionsFound).find(c => c.name === convName);
        const slot = convAtt?.slot || 'Ammo';
        const compiledConvOnly = compiler.compileWeapon(norm, { [slot]: convName }, parseResult.attachments, baseData);
        const convData = compiledConvOnly.compiledWeaponData;

        // Compile conversion + Muzzle Brake + Angled Grip
        const compiledWithGrip = compiler.compileWeapon(
            norm,
            { [slot]: convName, Barrel: 'Muzzle Brake', Underbarrel: 'Angled Grip' },
            parseResult.attachments,
            baseData
        );
        const withGripData = compiledWithGrip.compiledWeaponData;

        console.log(`  * Conversion: [${convName}] (Slot: ${slot})`);
        console.log(`    - Converted Stats: RPM=${convData.firerate || convData.rpm}, Dmg=${convData.damage0}->${convData.damage1}, Mag=${convData.magsize}, Aimspeed=${convData.aimspeed}, Sprintspeed=${convData.sprintspeed}`);
        console.log(`    - With MB + Angled: Aimspeed=${withGripData.aimspeed}, Sprintspeed=${withGripData.sprintspeed}`);
    }
}
