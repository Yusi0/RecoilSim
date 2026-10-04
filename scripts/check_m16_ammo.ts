import { WeaponsParser } from '../src/core';
import rawWeaponsData from '../data/raw/weapons.json';

const parser = new WeaponsParser();
const parseResult = parser.parse(rawWeaponsData);

const m16 = parseResult.weapons.get('m16a3');
console.log('M16A3 attachmentSlots:', m16?.attachmentSlots);

if (m16) {
    for (const [slot, vIds] of Object.entries(m16.attachmentSlots)) {
        if (slot === 'Ammo' || slot === 'Other') {
            console.log(`\nSlot: ${slot}`);
            for (const vId of vIds) {
                const att = parseResult.attachments.get(vId);
                if (att) {
                    console.log(`- ${att.name} (id: ${vId})`);
                    console.log('  modifiers:', JSON.stringify(att.modifiers, null, 2).slice(0, 300));
                }
            }
        }
    }
}
