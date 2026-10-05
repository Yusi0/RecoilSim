const fs = require('fs');
const path = require('path');
const v = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/attachment_verification.json'), 'utf8'));

const targets = [
    'Extended Magazine',
    'Drum Magazine',
    'Beta C Drum Mag',
    '20rd Drum',
    'AK-12M 45rd',
    'Reduced Magazine',
    'AR 7.62x39 Conversion',
    'AUG 9MM Conversion',
    'Minislugs',
    'Minishell',
    'SVK12E 7.62 Conversion',
    'Saiga 545 Conversion',
    '.45 Special'
];

for (const t of targets) {
    const matches = Object.values(v).filter(item => item.attachmentName === t || item.displayName === t);
    if (matches.length > 0) {
        const sample = matches[0];
        console.log(`=== [${t}] (${matches.length} variants) ===`);
        console.log(`  - Status: ${sample.verificationStatus}`);
        console.log(`  - Source: ${sample.verificationSource}`);
        console.log(`  - API Mods: ${sample.apiModifierCount} vs Final In-Game: ${sample.finalInGameModifierCount} (Global: ${sample.globalInGameModifierCount})`);
        console.log(`  - recoilContext: ${sample.finalRecoilContext} | practicalityRelevant: ${sample.practicalityRelevant}`);
        console.log(`  - Effect Flags: ${Object.entries(sample.effectFlags).filter(([k, val]) => val).map(([k]) => k).join(', ')}`);
        console.log(`  - Rationale: ${sample.recoilContextRationale}`);
        console.log(`  - Missing count: ${sample.missingFromApi.length}`);
        if (sample.missingFromApi.length > 0) {
            console.log(`  - Missing sample: ${sample.missingFromApi.slice(0, 5).map(m => m.type + ':' + m.indexPath + '=' + m.value).join(', ')}`);
        }
    } else {
        console.log(`=== [${t}]: NOT FOUND IN VERIFICATION JSON ===`);
    }
}
