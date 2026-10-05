import * as fs from 'fs';
import * as path from 'path';
import { ModifierEngine } from '../src/core/modifier/ModifierEngine';

const wepDb = JSON.parse(fs.readFileSync('data/in-game-modules/weapon_database.json', 'utf8'));
const attDb = JSON.parse(fs.readFileSync('data/in-game-modules/attachment_database.json', 'utf8'));
const provAtts = JSON.parse(fs.readFileSync('data/canonical/11.17-provisional/attachments.json', 'utf8'));

const engine = new ModifierEngine();
const baseWep = JSON.parse(JSON.stringify(wepDb['MTS-569']));

const globalAtt = attDb['MTS-570 Conversion'];
const localAtt = provAtts['mts_570_conversion_086fac7b'];

const combinedModifiers: any[] = [];
if (globalAtt && globalAtt.attachmentModifiers) {
    for (const [mType, list] of Object.entries(globalAtt.attachmentModifiers)) {
        if (Array.isArray(list)) {
            for (const item of list as any[]) {
                combinedModifiers.push({
                    type: mType,
                    indexPath: item.indexPath,
                    value: item.value,
                    priority: item.priority || 1,
                    insertIndex: item.insertIndex,
                    extra: {
                        valueIndex: item.valueIndex,
                        indexList: item.indexList
                    }
                });
            }
        }
    }
}
for (const m of localAtt.modifiers) {
    combinedModifiers.push(m);
}

const mockAttachment: any = {
    id: localAtt.id,
    name: localAtt.name,
    displayName: localAtt.displayName,
    slot: localAtt.slot,
    modifiers: combinedModifiers
};

const compileResult = engine.compileModifiers(baseWep, [mockAttachment]);
const compWep = compileResult.compiledData;

console.log('=== Base MTS-569 vs Modified MTS-570 ===');
console.log('Display Name:    ', baseWep.name, '->', compWep.displayname || compWep.name);
console.log('Ammo Type:       ', baseWep.ammotype, '->', compWep.ammotype);
console.log('Damage (close):  ', baseWep.damageGraph[0].damage, '->', compWep.damageGraph[0].damage);
console.log('Damage (far):    ', baseWep.damageGraph[baseWep.damageGraph.length - 1].damage, '->', compWep.damageGraph[compWep.damageGraph.length - 1].damage);
console.log('Firerate (RPM):  ', baseWep.firerate, '->', compWep.firerate);
console.log('Head Multiplier: ', baseWep.multhead, '->', compWep.multhead);
console.log('Torso Multiplier:', baseWep.multtorso, '->', compWep.multtorso);
console.log('Bullet Speed:    ', baseWep.bulletspeed, '->', compWep.bulletspeed);
console.log('Penetration:     ', baseWep.penetrationdepth, '->', compWep.penetrationdepth);
console.log('Reserve Ammo:    ', baseWep.sparerounds, '->', compWep.reserveammo || compWep.sparerounds);
console.log('Aim Speed:       ', baseWep.aimspeed, '->', compWep.aimspeed);
console.log('Equip Speed:     ', baseWep.equipspeed, '->', compWep.equipspeed);
console.log('Recoil Modifiers Count in Global Att:', (globalAtt.attachmentModifiers.trueMultipliers || []).filter((m: any) => m.indexPath[0] === 'recoil').length);
