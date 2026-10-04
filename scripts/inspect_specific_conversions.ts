import { WeaponsParser, WeaponCompiler } from '../src/core';
import rawWeaponsData from '../data/raw/weapons.json';
import * as fs from 'fs';
import * as path from 'path';

const parser = new WeaponsParser();
const parseResult = parser.parse(rawWeaponsData);
const compiler = new WeaponCompiler();
const detailsDir = path.resolve(__dirname, '../data/raw/weapon-details');

const targetCases = [
    { weaponId: 'beowulf_ecr', convName: 'ECR 5.56 Conversion', slot: 'Ammo' },
    { weaponId: 'mk12_spr', convName: '.223 Remington', slot: 'Ammo' },
    { weaponId: 'm231', convName: 'Heavy Buffer', slot: 'Other' },
    { weaponId: 'm231', convName: 'M855 Specialty Conversion', slot: 'Ammo' },
    { weaponId: 'colt_smg_635', convName: 'Heavy Buffer', slot: 'Other' }
];

for (const tc of targetCases) {
    const norm = parseResult.weapons.get(tc.weaponId);
    if (!norm) continue;

    const detailPath = path.join(detailsDir, `${tc.weaponId}.json`);
    const baseData = JSON.parse(fs.readFileSync(detailPath, 'utf-8'));

    // Base physics
    const baseRpm = baseData.firerate || baseData.rpm;
    const baseDmg0 = baseData.damage0;
    const baseDmg1 = baseData.damage1;
    const baseMag = baseData.magsize;
    const baseAim = baseData.aimspeed;
    const baseSprint = baseData.sprintspeed;

    // Converted
    const convResult = compiler.compileWeapon(norm, { [tc.slot]: tc.convName }, parseResult.attachments, baseData);
    const cData = convResult.compiledWeaponData;

    const convRpm = cData.firerate || cData.rpm;
    const convDmg0 = cData.damage0;
    const convDmg1 = cData.damage1;
    const convMag = cData.magsize;
    const convAim = cData.aimspeed;
    const convSprint = cData.sprintspeed;

    console.log(`\n================================================================================`);
    console.log(`WEAPON: ${norm.displayName || norm.name} (${tc.weaponId.toUpperCase()}) | CONVERSION: [${tc.convName}] (${tc.slot})`);
    console.log(`================================================================================`);
    console.log(`Base Stats:      RPM=${baseRpm} | Damage=${baseDmg0}->${baseDmg1} | Mag=${baseMag} | Aim=${baseAim} | Sprint=${baseSprint}`);
    console.log(`Converted Stats: RPM=${convRpm} | Damage=${convDmg0}->${convDmg1} | Mag=${convMag} | Aim=${convAim} | Sprint=${convSprint}`);
    
    // Check recoil parameter differences (e.g. cameraRecoil or recoil damping/springs)
    const baseRecoilStr = JSON.stringify(baseData.recoil || {}).length;
    const convRecoilStr = JSON.stringify(cData.recoil || {}).length;
    console.log(`Recoil structure size: Base=${baseRecoilStr} bytes | Converted=${convRecoilStr} bytes (Altered: ${baseRecoilStr !== convRecoilStr})`);

    // Available attachments in candidate slots
    const available = norm.attachmentSlots;
    const barrels = available['Barrel'] || [];
    const underbarrels = available['Underbarrel'] || [];
    console.log(`Available Attachments: Barrel=${barrels.length}, Underbarrel=${underbarrels.length}`);
    console.log(`Candidate combinations for this conversion: ${(barrels.length + 1) * (underbarrels.length + 1)}`);

    // Now test compiling Converted + Muzzle Brake + Angled Grip
    const fullResult = compiler.compileWeapon(
        norm,
        { [tc.slot]: tc.convName, Barrel: 'Muzzle Brake', Underbarrel: 'Angled Grip' },
        parseResult.attachments,
        baseData
    );
    const fData = fullResult.compiledWeaponData;
    console.log(`Combined (Conv + MB + Angled): Aim=${fData.aimspeed}, Sprint=${fData.sprintspeed}`);
}
