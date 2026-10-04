import { WeaponsParser, WeaponCompiler } from '../src/core';
import rawWeaponsData from '../data/raw/weapons.json';
import * as fs from 'fs';
import * as path from 'path';

const HURDLES = {
    ttk: 20.0,
    ads: 35.0,
    sprint: 45.0,
    walk: 1.1
};

const parser = new WeaponsParser();
const parseResult = parser.parse(rawWeaponsData);
const compiler = new WeaponCompiler();
const detailsDir = path.resolve(__dirname, '../data/raw/weapon-details');

function getPhysics(data: any) {
    const rpm = data.firerate || data.rpm || 800;
    const damage0 = data.damage0 || 30;
    const btk = Math.ceil(100 / damage0);
    const shotIntervalMs = 60000 / rpm;
    const ttkMs = (btk - 1) * shotIntervalMs;

    const aimspeed = data.aimspeed || 16;
    const adsMs = 4743.8645 / aimspeed;

    const sprintspeed = data.sprintspeed || 14;
    const sprintMs = 4015.0 / sprintspeed;

    const walkspeed = data.walkspeed || 14;
    const aimwalkmult = data.aimwalkspeedmult || 0.7;
    const aimWalkSpeed = walkspeed * aimwalkmult;

    return { rpm, damage0, btk, shotIntervalMs, ttkMs, adsMs, sprintMs, aimWalkSpeed, aimspeed, sprintspeed };
}

const testCases = [
    {
        name: 'Case 1: M231 + Heavy Buffer',
        weaponId: 'm231',
        context: { Other: 'Heavy Buffer' },
        candidatesToTest: [
            { name: '(none) + (none)', cand: {} },
            { name: 'Muzzle Brake + none', cand: { Barrel: 'Muzzle Brake' } },
            { name: 'Muzzle Brake + Angled Grip', cand: { Barrel: 'Muzzle Brake', Underbarrel: 'Angled Grip' } },
            { name: 'Muzzle Brake + Romanian Grip', cand: { Barrel: 'Muzzle Brake', Underbarrel: 'Romanian Grip' } },
            { name: 'Compensator + none', cand: { Barrel: 'Compensator' } },
            { name: 'Oil Filter + none', cand: { Barrel: 'Oil Filter' } },
            { name: 'T-Brake + Angled Grip', cand: { Barrel: 'T-Brake', Underbarrel: 'Angled Grip' } }
        ]
    },
    {
        name: 'Case 2: M231 + M855 Specialty Conversion',
        weaponId: 'm231',
        context: { Ammo: 'M855 Specialty Conversion' },
        candidatesToTest: [
            { name: '(none) + (none)', cand: {} },
            { name: 'Muzzle Brake + none', cand: { Barrel: 'Muzzle Brake' } },
            { name: 'Muzzle Brake + Angled Grip', cand: { Barrel: 'Muzzle Brake', Underbarrel: 'Angled Grip' } },
            { name: 'Muzzle Brake + Romanian Grip', cand: { Barrel: 'Muzzle Brake', Underbarrel: 'Romanian Grip' } },
            { name: 'Oil Filter + none', cand: { Barrel: 'Oil Filter' } }
        ]
    },
    {
        name: 'Case 3: Mk12 SPR + .223 Remington',
        weaponId: 'mk12_spr',
        context: { Ammo: '.223 Remington' },
        candidatesToTest: [
            { name: '(none) + (none)', cand: {} },
            { name: 'Muzzle Brake + none', cand: { Barrel: 'Muzzle Brake' } },
            { name: 'Muzzle Brake + Angled Grip', cand: { Barrel: 'Muzzle Brake', Underbarrel: 'Angled Grip' } },
            { name: 'Muffler + none', cand: { Barrel: 'Muffler' } },
            { name: 'T-Brake + Stubby Grip', cand: { Barrel: 'T-Brake', Underbarrel: 'Stubby Grip' } }
        ]
    },
    {
        name: 'Case 4: Neowulf ECR + ECR 5.56 Conversion',
        weaponId: 'beowulf_ecr',
        context: { Ammo: 'ECR 5.56 Conversion' },
        candidatesToTest: [
            { name: '(none) + (none)', cand: {} },
            { name: 'Muzzle Brake + none', cand: { Barrel: 'Muzzle Brake' } },
            { name: 'Muzzle Brake + Angled Grip', cand: { Barrel: 'Muzzle Brake', Underbarrel: 'Angled Grip' } },
            { name: 'Muffler + none', cand: { Barrel: 'Muffler' } },
            { name: 'Compensator + Stubby Grip', cand: { Barrel: 'Compensator', Underbarrel: 'Stubby Grip' } }
        ]
    }
];

async function runAudit() {
    console.log('================================================================================');
    console.log('BASELINE AUDIT: PURE STOCK vs CONTEXT-ONLY BASELINE IN PRACTICALITY GUARD');
    console.log('================================================================================\n');

    for (const tc of testCases) {
        console.log('--------------------------------------------------------------------------------');
        console.log(`${tc.name.toUpperCase()} (Weapon ID: ${tc.weaponId})`);
        console.log(`Context: ${JSON.stringify(tc.context)}`);
        console.log('--------------------------------------------------------------------------------');

        const norm = parseResult.weapons.get(tc.weaponId)!;
        const detailPath = path.join(detailsDir, `${tc.weaponId}.json`);
        const baseData = JSON.parse(fs.readFileSync(detailPath, 'utf-8'));

        // 1. Pure Stock Baseline
        const stockCompiled = compiler.compileWeapon(norm, {}, parseResult.attachments, baseData);
        const stockPhys = getPhysics(stockCompiled.compiledWeaponData);

        // 2. Context-Only Baseline
        const contextCompiled = compiler.compileWeapon(norm, tc.context, parseResult.attachments, baseData);
        const contextPhys = getPhysics(contextCompiled.compiledWeaponData);

        console.log(`[Pure Stock Baseline]     RPM=${stockPhys.rpm} | Dmg=${stockPhys.damage0} (BTK ${stockPhys.btk}) | TTK=${stockPhys.ttkMs.toFixed(1)}ms | ADS=${stockPhys.adsMs.toFixed(1)}ms | Sprint=${stockPhys.sprintMs.toFixed(1)}ms | Walk=${stockPhys.aimWalkSpeed.toFixed(2)}s/s`);
        console.log(`[Context-Only Baseline]   RPM=${contextPhys.rpm} | Dmg=${contextPhys.damage0} (BTK ${contextPhys.btk}) | TTK=${contextPhys.ttkMs.toFixed(1)}ms | ADS=${contextPhys.adsMs.toFixed(1)}ms | Sprint=${contextPhys.sprintMs.toFixed(1)}ms | Walk=${contextPhys.aimWalkSpeed.toFixed(2)}s/s`);
        console.log(`[Context Shift vs Stock]  dTTK=${(contextPhys.ttkMs - stockPhys.ttkMs).toFixed(1)}ms | dADS=${(contextPhys.adsMs - stockPhys.adsMs).toFixed(1)}ms | dSprint=${(contextPhys.sprintMs - stockPhys.sprintMs).toFixed(1)}ms\n`);

        console.log('Candidate Comparison Table:');
        console.log('Candidate | RPM | TTK | ADS | Sprint | dTTK(Stk) | dADS(Stk) | dSp(Stk) | Guard(Stock) | dTTK(Ctx) | dADS(Ctx) | dSp(Ctx) | Guard(Context)');
        console.log('------------------------------------------------------------------------------------------------------------------------------------------------');

        for (const c of tc.candidatesToTest) {
            const fullCombined = { ...tc.context, ...c.cand };
            const compiled = compiler.compileWeapon(norm, fullCombined, parseResult.attachments, baseData);
            const phys = getPhysics(compiled.compiledWeaponData);

            // Deltas vs Pure Stock
            const dTTK_stock = phys.ttkMs - stockPhys.ttkMs;
            const dADS_stock = phys.adsMs - stockPhys.adsMs;
            const dSp_stock = phys.sprintMs - stockPhys.sprintMs;
            const dWalk_stock = stockPhys.aimWalkSpeed - phys.aimWalkSpeed;

            const failsStock: string[] = [];
            if (dTTK_stock >= HURDLES.ttk) failsStock.push('TTK');
            if (dADS_stock >= HURDLES.ads) failsStock.push('ADS');
            if (dSp_stock >= HURDLES.sprint) failsStock.push('Sprint');
            if (dWalk_stock >= HURDLES.walk) failsStock.push('AimWalk');
            const guardStockStr = failsStock.length === 0 ? 'PASS' : `FAIL(${failsStock.join(',')})`;

            // Deltas vs Context Baseline
            const dTTK_ctx = phys.ttkMs - contextPhys.ttkMs;
            const dADS_ctx = phys.adsMs - contextPhys.adsMs;
            const dSp_ctx = phys.sprintMs - contextPhys.sprintMs;
            const dWalk_ctx = contextPhys.aimWalkSpeed - phys.aimWalkSpeed;

            const failsCtx: string[] = [];
            if (dTTK_ctx >= HURDLES.ttk) failsCtx.push('TTK');
            if (dADS_ctx >= HURDLES.ads) failsCtx.push('ADS');
            if (dSp_ctx >= HURDLES.sprint) failsCtx.push('Sprint');
            if (dWalk_ctx >= HURDLES.walk) failsCtx.push('AimWalk');
            const guardCtxStr = failsCtx.length === 0 ? 'PASS' : `FAIL(${failsCtx.join(',')})`;

            const cName = c.name.padEnd(25);
            const rpmStr = phys.rpm.toString().padStart(4);
            const ttkStr = phys.ttkMs.toFixed(1).padStart(6);
            const adsStr = phys.adsMs.toFixed(1).padStart(5);
            const spStr = phys.sprintMs.toFixed(1).padStart(6);

            const dtStk = ((dTTK_stock >= 0 ? '+' : '') + dTTK_stock.toFixed(1)).padStart(9);
            const daStk = ((dADS_stock >= 0 ? '+' : '') + dADS_stock.toFixed(1)).padStart(9);
            const dsStk = ((dSp_stock >= 0 ? '+' : '') + dSp_stock.toFixed(1)).padStart(8);

            const dtCtx = ((dTTK_ctx >= 0 ? '+' : '') + dTTK_ctx.toFixed(1)).padStart(9);
            const daCtx = ((dADS_ctx >= 0 ? '+' : '') + dADS_ctx.toFixed(1)).padStart(9);
            const dsCtx = ((dSp_ctx >= 0 ? '+' : '') + dSp_ctx.toFixed(1)).padStart(8);

            console.log(
                `${cName} | ${rpmStr} | ${ttkStr} | ${adsStr} | ${spStr} | ${dtStk} | ${daStk} | ${dsStk} | ${guardStockStr.padEnd(12)} | ${dtCtx} | ${daCtx} | ${dsCtx} | ${guardCtxStr}`
            );
        }
        console.log('\n');
    }
}

runAudit().catch(err => {
    console.error(err);
    process.exit(1);
});
