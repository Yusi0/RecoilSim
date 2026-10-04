import fs from 'fs';
import path from 'path';
import { RecommendationEngine } from '../src/recommendation/RecommendationEngine';
import { SUPPORTED_WEAPONS } from '../src/app/c25DataLoader';

console.log('=== Precomputing Build-Time Recommendations ===');

const engine = new RecommendationEngine();
const results: Record<string, any> = {};

for (const weapon of SUPPORTED_WEAPONS) {
    const t0 = performance.now();
    console.log(`Precomputing recommendations for ${weapon.displayName} (${weapon.id})...`);
    // Default Layer 1 context: empty attachments {}
    const result = engine.recommend(weapon.id, {}, {
        targetDistance: 50,
        burstSize: 30,
        explorationTrials: 32,
        finalTrials: 500,
        masterSeed: 2026
    });
    const elapsed = performance.now() - t0;
    console.log(`  Done in ${elapsed.toFixed(1)}ms. Overall: ${result.overall?.title}, Vertical: ${result.vertical?.title}, Horizontal: ${result.horizontal?.title}`);

    // Create lightweight clean version without bulky 114MB raw impact vectors
    const cleanRec = (r: any) => {
        if (!r) return null;
        const { impacts, ...rest } = r;
        return rest;
    };

    results[weapon.id] = {
        overall: cleanRec(result.overall),
        vertical: cleanRec(result.vertical),
        horizontal: cleanRec(result.horizontal),
        current: cleanRec(result.current)
    };
}

const outDir = path.join(__dirname, '../src/recommendation');
const outFile = path.join(outDir, 'precomputedRecommendations.json');
fs.writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf-8');

console.log(`Saved precomputed recommendations to: ${outFile}`);
