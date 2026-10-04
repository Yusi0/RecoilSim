import * as fs from 'fs';
import * as path from 'path';
import { WeaponsParser } from '../src/core';
import rawWeaponsData from '../data/raw/weapons.json';
import { RecommendationEngine } from '../src/recommendation/RecommendationEngine';
import { getWeaponRecommendationProfile } from '../src/recommendation/WeaponRecommendationProfiles';

const parser = new WeaponsParser();
const parseResult = parser.parse(rawWeaponsData);
const engine = new RecommendationEngine();

const detailsDir = path.resolve(__dirname, '../data/raw/weapon-details');

const FIREARM_CATEGORIES = new Set([
    'ASSAULT RIFLE',
    'CARBINE',
    'BATTLE RIFLE',
    'PDW',
    'DMR',
    'LMG',
    'SNIPER RIFLE',
    'SHOTGUN',
    'PISTOLS',
    'MACHINE PISTOLS',
    'REVOLVERS',
    'OTHER'
]);

let validFirearms = 0;
let totalCandidates = 0;
const perCategoryCounts: Record<string, { weapons: number, candidates: number }> = {};

for (const [id, w] of parseResult.weapons.entries()) {
    const cat = w.category || 'UNKNOWN';
    if (!FIREARM_CATEGORIES.has(cat)) continue;

    const detailPath = path.join(detailsDir, `${id}.json`);
    if (!fs.existsSync(detailPath)) continue;

    validFirearms++;
    const profile = getWeaponRecommendationProfile(id);
    const candidates = (engine as any).generateCandidates(profile);
    
    totalCandidates += candidates.length;
    if (!perCategoryCounts[cat]) perCategoryCounts[cat] = { weapons: 0, candidates: 0 };
    perCategoryCounts[cat].weapons++;
    perCategoryCounts[cat].candidates += candidates.length;
}

console.log(`Valid Firearms with details: ${validFirearms}`);
console.log(`Total Candidates across all firearms: ${totalCandidates}`);
console.table(perCategoryCounts);
