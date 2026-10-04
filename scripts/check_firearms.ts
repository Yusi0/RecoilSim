import { WeaponsParser, WeaponCompiler } from '../src/core';
import rawWeaponsData from '../data/raw/weapons.json';

const parser = new WeaponsParser();
const parseResult = parser.parse(rawWeaponsData);

const categoryStats: Record<string, { count: number, sampleId: string, hasRpm: number, hasAimspeed: number, hasSprintspeed: number }> = {};

for (const [id, w] of parseResult.weapons.entries()) {
    const cat = w.category || 'UNKNOWN';
    if (!categoryStats[cat]) {
        categoryStats[cat] = { count: 0, sampleId: id, hasRpm: 0, hasAimspeed: 0, hasSprintspeed: 0 };
    }
    categoryStats[cat].count++;
    if (w.stats && (w.stats.rpm || (w.stats as any).firerate)) categoryStats[cat].hasRpm++;
    if (w.stats && (w.stats as any).aimspeed) categoryStats[cat].hasAimspeed++;
    if (w.stats && (w.stats as any).sprintspeed) categoryStats[cat].hasSprintspeed++;
}

console.table(categoryStats);

// Also check sample weapon stats
const sampleAr = parseResult.weapons.get('m16a3');
console.log('Sample M16A3 stats:', sampleAr?.stats);
