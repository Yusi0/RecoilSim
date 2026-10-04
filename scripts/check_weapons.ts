import { WeaponsParser } from '../src/core';
import rawWeaponsData from '../data/raw/weapons.json';

const parser = new WeaponsParser();
const parseResult = parser.parse(rawWeaponsData);

console.log(`Total normalized weapons parsed: ${parseResult.weapons.size}`);
console.log(`Total normalized attachments parsed: ${parseResult.attachments.size}`);

const sample = parseResult.weapons.get('c25');
console.log('Sample weapon keys:', Object.keys(sample || {}));
console.log('Sample weapon data snippet:', JSON.stringify(sample, null, 2).slice(0, 500));

// Check raw weapons keys
const rawObj = rawWeaponsData as any;
const rawKeys = Object.keys(rawObj);
console.log(`Total raw keys: ${rawKeys.length}`);
console.log('Sample raw keys:', rawKeys.slice(0, 10));

if (rawKeys.length > 0) {
    const firstRaw = rawObj[rawKeys[0]];
    console.log('First raw weapon keys:', Object.keys(firstRaw || {}));
    console.log('First raw weapon category/type/class:', firstRaw.type, firstRaw.class, firstRaw.category, firstRaw.gunType);
}
