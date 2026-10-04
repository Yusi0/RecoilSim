import * as fs from 'fs';
import * as path from 'path';
import { WeaponsParser, WeaponCompiler } from '../src/core';
import rawWeaponsData from '../data/raw/weapons.json';
import { RecommendationEngine } from '../src/recommendation/RecommendationEngine';
import { getWeaponRecommendationProfile } from '../src/recommendation/WeaponRecommendationProfiles';

const parser = new WeaponsParser();
const parseResult = parser.parse(rawWeaponsData);
const engine = new RecommendationEngine();
const compiler = new WeaponCompiler();
const detailsDir = path.resolve(__dirname, '../data/raw/weapon-details');

const c25Detail = JSON.parse(fs.readFileSync(path.join(detailsDir, 'c25.json'), 'utf-8'));
const profile = getWeaponRecommendationProfile('c25');
const candidates = (engine as any).generateCandidates(profile);

console.time('Compile 56 candidates');
for (const cand of candidates) {
    compiler.compileWeapon(parseResult.weapons.get('c25')!, cand, parseResult.attachments, c25Detail);
}
console.timeEnd('Compile 56 candidates');
