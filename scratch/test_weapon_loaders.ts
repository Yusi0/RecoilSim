import { WeaponsParser, WeaponCompiler } from '../src/core';
import rawWeaponsData from '../data/raw/weapons.json';
import c25Detail from '../data/raw/weapon-details/c25.json';
import ak105Detail from '../data/raw/weapon-details/ak105.json';
import m231Detail from '../data/raw/weapon-details/m231.json';
import m16a3Detail from '../data/raw/weapon-details/m16a3.json';

const parser = new WeaponsParser();
const parseResult = parser.parse(rawWeaponsData);
const compiler = new WeaponCompiler();

const weaponList = [
    { id: 'c25', name: 'C25', detail: c25Detail },
    { id: 'ak105', name: 'AK105', detail: ak105Detail },
    { id: 'm231', name: 'M231', detail: m231Detail },
    { id: 'm16a3', name: 'M16A3', detail: m16a3Detail }
];

for (const item of weaponList) {
    let norm = parseResult.weapons.get(item.id);
    if (!norm) {
        // Search by displayName or name
        for (const [key, w] of parseResult.weapons) {
            if (w.name.toLowerCase() === item.name.toLowerCase() || w.stats.displayName?.toLowerCase() === item.name.toLowerCase()) {
                norm = w;
                console.log(`Found ${item.name} under key '${key}'`);
                break;
            }
        }
    } else {
        console.log(`Found ${item.name} directly under key '${item.id}'`);
    }

    if (norm) {
        const compiled = compiler.compileWeapon(norm, {}, parseResult.attachments, item.detail);
        console.log(`Compiled ${item.name}: firerate=${compiled.compiledWeaponData.firerate}, magsize=${compiled.compiledWeaponData.magsize}, displayname=${compiled.compiledWeaponData.displayname}`);
    } else {
        console.error(`FAILED to find ${item.name}`);
    }
}
