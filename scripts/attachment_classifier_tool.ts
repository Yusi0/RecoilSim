import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { AttachmentEffectResolver } from '../src/core/compiler/AttachmentEffectResolver';

const PORT = 4001;
const STORAGE_FILE = path.resolve(__dirname, '../data/attachment_classification.json');
const CANDIDATES_FILE = path.resolve(__dirname, '../data/classifier_candidates_11_17.json');
const PROV_ATTS_PATH = path.resolve(__dirname, '../data/canonical/11.17-provisional/attachments.json');
const NORM_ATTS_PATH = fs.existsSync(PROV_ATTS_PATH) ? PROV_ATTS_PATH : path.resolve(__dirname, '../data/normalized/attachments.json');
const PROV_WEAPONS_PATH = path.resolve(__dirname, '../data/canonical/11.17-provisional/weapons.json');
const RAW_WEAPONS_PATH = fs.existsSync(PROV_WEAPONS_PATH) ? PROV_WEAPONS_PATH : path.resolve(__dirname, '../data/raw/weapons.json');
const IN_GAME_OVERRIDES_PATH = path.resolve(__dirname, '../data/in-game-modules/attachment_overrides.json');
const effectResolver = AttachmentEffectResolver.createDefault(path.resolve(__dirname, '..'));

// 1. Load data
console.log(`Loading attachment data from: ${NORM_ATTS_PATH}`);
console.log(`Loading weapon data from: ${RAW_WEAPONS_PATH}`);
const normAtts = JSON.parse(fs.readFileSync(NORM_ATTS_PATH, 'utf8'));
const rawWeapons = JSON.parse(fs.readFileSync(RAW_WEAPONS_PATH, 'utf8'));

// Load In-Game Module Overrides if available
let inGameOverrides: Record<string, any> = {};
if (fs.existsSync(IN_GAME_OVERRIDES_PATH)) {
    try {
        const parsed = JSON.parse(fs.readFileSync(IN_GAME_OVERRIDES_PATH, 'utf8'));
        inGameOverrides = parsed.modules || {};
        console.log(`Loaded ${Object.keys(inGameOverrides).length} in-game module overrides from ${IN_GAME_OVERRIDES_PATH}`);
    } catch (e) {
        console.error('Failed to parse in-game overrides:', e);
    }
}

// Build weapon display names
const weaponNameMap: Record<string, string> = {};
for (const key of Object.keys(rawWeapons)) {
    const val = rawWeapons[key];
    if (Array.isArray(val)) {
        for (const w of val) {
            const wKey = w.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            weaponNameMap[wKey] = w.displayName || w.name;
        }
    } else if (typeof val === 'object' && val !== null) {
        weaponNameMap[key] = val.displayName || val.name;
        if (val.name) {
            const wKey = val.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            weaponNameMap[wKey] = val.displayName || val.name;
        }
    }
}

// 2. Extract target normalized variants (Non-Ammo attachments only; Ammo is handled as independent Ammo Baseline)
const targetNames = new Set<string>(['Heavy Buffer']);

for (const id of Object.keys(normAtts)) {
    const a = normAtts[id];
    if (a.slot === 'Ammo') continue; // Exclude ALL Ammo attachments from general classifier candidates
    if (a.slot !== 'Other') continue;
    const nameLower = (a.name || '').toLowerCase();
    const isConv = nameLower.includes('conv') || nameLower.includes('conversion');
    const paths = (a.modifiers || []).map((m: any) => m.indexPath ? m.indexPath.join('.') : '');
    const alters = paths.some((p: string) =>
        p.startsWith('firerate') || p.startsWith('rpm') ||
        p.startsWith('magsize') || p.startsWith('damage0') ||
        p.startsWith('damage1') || p.startsWith('ammotype') ||
        p.startsWith('casetype') || p.startsWith('type') ||
        p.startsWith('firemodes') || p.startsWith('caliber')
    );
    if (isConv || alters) {
        targetNames.add(a.name);
    }
}

const targetVariants: any[] = [];
for (const id of Object.keys(normAtts)) {
    const a = normAtts[id];
    if (a.slot === 'Ammo') continue; // Exclude ALL Ammo attachments
    if (targetNames.has(a.name)) {
        const wNames = (a.compatibleWeaponIds || []).map((wid: string) => weaponNameMap[wid] || wid);
        
        // Check for in-game module override
        let activeModule: any = null;
        for (const modKey of Object.keys(inGameOverrides)) {
            const mod = inGameOverrides[modKey];
            if ((mod.targetVariantIds && mod.targetVariantIds.includes(a.id)) ||
                (mod.attachmentName && mod.attachmentName.toLowerCase() === (a.name || '').toLowerCase())) {
                activeModule = mod;
                break;
            }
        }

        const effectiveModifiers = activeModule ? activeModule.modifiers : (a.modifiers || []);
        const rawApiModifiers = (a.modifiers || []).map((m: any) => ({
            type: m.type,
            path: m.indexPath ? m.indexPath.join('.') : '',
            value: m.value
        }));

        const paths = new Set<string>();
        for (const m of effectiveModifiers) {
            if (m.indexPath) paths.add(m.indexPath.join('.'));
        }

        const pArr = Array.from(paths);
        const altersCaliber = pArr.some(p => p.startsWith('ammotype') || p.startsWith('casetype'));
        const altersRpm = pArr.some(p => p.startsWith('firerate') || p.startsWith('rpm'));
        const altersMag = pArr.some(p => p.startsWith('magsize'));
        const altersDamage = pArr.some(p => p.startsWith('damage0') || p.startsWith('damage1') || p.startsWith('damageGraph'));
        const altersType = pArr.some(p => p.startsWith('type') || p.startsWith('firemodes'));
        const altersRecoil = pArr.some(p => p.startsWith('recoil'));

        // Compute resolved gameplay effects on primary compatible weapon
        const resolvedEffects = effectResolver.resolveAttachmentForWeapon(a);

        targetVariants.push({
            id: a.id,
            name: a.name,
            displayName: activeModule ? activeModule.displayName : a.displayName,
            slot: a.slot,
            info: a.info || '',
            weaponCount: a.compatibleWeaponIds ? a.compatibleWeaponIds.length : 0,
            weapons: wNames,
            weaponIds: a.compatibleWeaponIds,
            modifierCount: effectiveModifiers.length,
            keyPaths: pArr,
            inGameModule: activeModule ? {
                source: activeModule.source,
                sourceFile: activeModule.sourceFile,
                displayName: activeModule.displayName,
                modifiersCount: activeModule.modifiersCount,
                conflict: rawApiModifiers.length !== effectiveModifiers.length
            } : null,
            traits: {
                altersCaliber,
                altersRpm,
                altersMag,
                altersDamage,
                altersType,
                altersRecoil
            },
            allModifiers: effectiveModifiers.map((m: any) => ({
                type: m.type,
                path: m.indexPath ? m.indexPath.join('.') : '',
                value: m.value
            })),
            rawApiModifiers: activeModule ? rawApiModifiers : undefined,
            resolvedEffects,
            profile: resolvedEffects.profile,
            recoilContext: null
        });
    }
}

console.log(`Extracted ${targetVariants.length} distinct normalized variants.`);
fs.writeFileSync(CANDIDATES_FILE, JSON.stringify(targetVariants, null, 2), 'utf8');
console.log(`Updated 11.17 candidates with resolved gameplay effects in: ${CANDIDATES_FILE}`);

// 3. Storage & Seed Cases
interface ClassificationEntry {
    recoilContext: boolean | 'unknown';
    reason: string;
    timestamp: string;
    evaluatedBy?: string;
}

let classifications: Record<string, ClassificationEntry> = {};
if (fs.existsSync(STORAGE_FILE)) {
    try {
        classifications = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
    } catch (e) {}
} else {
    fs.mkdirSync(path.dirname(STORAGE_FILE), { recursive: true });
    fs.writeFileSync(STORAGE_FILE, JSON.stringify({}, null, 2), 'utf8');
}

const goldenSeeds: Record<string, { recoilContext: boolean | 'unknown'; reason: string }> = {
    '223_remington_793f05cf': {
        recoilContext: false,
        reason: '53개 화기 공용: 탄창/RPM/구경을 바꾸지 않고 반동(-2.5~5%)과 사거리/데미지만 미세 교환하는 순수 ammo option. 별도 baseline 불필요.'
    },
    '223_remington_c39108b4': {
        recoilContext: true,
        reason: 'MK12 SPR 전용: 무기 클래스(type)를 DMR->ASSAULT로 변경, 탄창 20->30발, ammotype을 5.56 M855A1로 교체. 완전히 새로운 무기 baseline 형성.'
    },
    'ar_20_tact_conversion_47341c5f': {
        recoilContext: true,
        reason: 'C25: 구경을 .20 Tactical로 교체하고 탄창을 30->20발로 축소. 독자적 발사/탄도 configuration 형성.'
    },
    'heavy_buffer_ae444f3a': {
        recoilContext: true,
        reason: 'M231: Other 슬롯이지만 RPM을 1225에서 250으로 80% 폭락시킴. 이 상태를 새로운 0점 기준선으로 두지 않으면 배럴/그립 전체가 실전 가드에서 100% 탈락함.'
    },
    'ar_7_62x39_conversion_8ef8519a': {
        recoilContext: true,
        reason: 'In-game module (source=in-game-module, 6.5Grendel.lua): ammotype 6.5mm Grendel, magsize 20 (reduced from 30), firerate 0.95 (-5%), recoil hip/aim translation +25%, hip/aim rotation +30%, camera body/head +15%, damageGraph.damage +14%, distance -32.5%. Independent baseline configuration required.'
    },
    'ar_7_62x39_conversion_9a283a57': {
        recoilContext: true,
        reason: 'In-game module (source=in-game-module, 6.5Grendel.lua): 6.5 GRENDEL conversion for M4 platform. Recoil impulse +25~30%, magsize 20. New baseline required.'
    },
    'ar_7_62x39_conversion_3230fc1f': {
        recoilContext: true,
        reason: 'In-game module (source=in-game-module, 6.5Grendel.lua): 6.5 GRENDEL conversion for C8A2 platform. Recoil impulse +25~30%, magsize 20. New baseline required.'
    },
    'ar_7_62x39_conversion_18c47af9': {
        recoilContext: true,
        reason: 'In-game module (source=in-game-module, 6.5Grendel.lua): 6.5 GRENDEL conversion for C7A2/M16 platform. Recoil impulse +25~30%, magsize 20. New baseline required.'
    }
};

let updated = false;
for (const [id, seed] of Object.entries(goldenSeeds)) {
    if (!classifications[id]) {
        classifications[id] = {
            recoilContext: seed.recoilContext,
            reason: seed.reason,
            timestamp: new Date().toISOString(),
            evaluatedBy: 'System Golden Verification'
        };
        updated = true;
    }
}
if (updated) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(classifications, null, 2), 'utf8');
}

function saveClassification(id: string, recoilContext: boolean | 'unknown', reason: string) {
    classifications[id] = {
        recoilContext,
        reason,
        timestamp: new Date().toISOString(),
        evaluatedBy: 'Human Reviewer'
    };
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(classifications, null, 2), 'utf8');
}

// 4. Web Server
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/api/data') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            items: targetVariants,
            classifications,
            storagePath: STORAGE_FILE
        }));
        return;
    }

    if (req.url === '/api/classify' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { id, recoilContext, reason } = JSON.parse(body);
                if (id !== undefined && recoilContext !== undefined) {
                    saveClassification(id, recoilContext, reason || '');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, count: Object.keys(classifications).length }));
                    return;
                }
            } catch (err) {}
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid payload' }));
        });
        return;
    }

    if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getHtmlContent());
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log(`\n============================================================`);
    console.log(`Recoil Context Classifier running at:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`Storage file: ${STORAGE_FILE}`);
    console.log(`============================================================\n`);
});

function getHtmlContent() {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Attachment Classifier</title>
<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
<style>
:root {
    --bg-page: #fbfbfd;
    --bg-card: #ffffff;
    --border: #e5e5ea;
    --border-subtle: #f0f0f3;
    --text-primary: #1d1d1f;
    --text-secondary: #86868b;
    --text-tertiary: #a1a1a6;
    --accent: #0071e3;
    --accent-hover: #0077ed;
    --tint-selected: #f5f5f7;
    --true-color: #5856d6;
    --false-color: #34c759;
    --unk-color: #8e8e93;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    background-color: var(--bg-page);
    color: var(--text-primary);
    font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "SF Pro Text", "Helvetica Neue", sans-serif;
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

/* Header */
header {
    padding: 24px 32px;
    max-width: 860px;
    width: 100%;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
}

.title-group h1 {
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: var(--text-primary);
}
.title-group p {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-top: 2px;
}

.header-action {
    display: flex;
    align-items: center;
    gap: 16px;
}

.progress-text {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
}

.summary-link {
    background: none;
    border: none;
    color: var(--accent);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: background 0.15s;
}
.summary-link:hover {
    background: #f0f0f5;
}

/* Progress bar */
.progress-line-container {
    max-width: 860px;
    width: 100%;
    margin: 0 auto;
    padding: 0 32px;
}
.progress-line {
    height: 3px;
    background: #eaeaea;
    border-radius: 2px;
    overflow: hidden;
}
.progress-line-bar {
    height: 100%;
    background: #1d1d1f;
    width: 0%;
    transition: width 0.25s ease-out;
}

/* Main Content Card */
main {
    flex: 1;
    max-width: 860px;
    width: 100%;
    margin: 20px auto 40px auto;
    padding: 0 32px;
    display: flex;
    flex-direction: column;
}

.stage-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 44px 48px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
    display: flex;
    flex-direction: column;
}

/* Attachment Identification */
.att-hero {
    text-align: center;
    margin-bottom: 28px;
}
.att-hero .name {
    font-size: 2.2rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    line-height: 1.15;
}
.att-hero .meta-row {
    margin-top: 10px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    color: var(--text-secondary);
}
.att-hero .variant-code {
    font-family: -apple-system, monospace;
    font-size: 0.85rem;
    color: #4b4b50;
    background: #f4f4f7;
    padding: 2px 7px;
    border-radius: 5px;
}
.att-hero .dot-sep {
    color: #d1d1d6;
}

/* Traits Pills */
.traits-wrap {
    display: flex;
    justify-content: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 32px;
    min-height: 26px;
}
.trait-chip {
    font-size: 0.78rem;
    font-weight: 500;
    padding: 3px 10px;
    border-radius: 14px;
    background: #f5f5f7;
    color: #48484a;
    border: 1px solid #e5e5ea;
}
.trait-chip.active {
    background: #eef4ff;
    color: #0066cc;
    border-color: #cce0ff;
    font-weight: 600;
}

/* Core Question Section */
.decision-box {
    border-top: 1px solid var(--border-subtle);
    padding-top: 32px;
    text-align: center;
}
.decision-question {
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: var(--text-primary);
}
.decision-subtitle {
    font-size: 0.88rem;
    color: var(--text-secondary);
    margin-top: 6px;
    margin-bottom: 24px;
}

/* Apple-style Segmented Option Buttons */
.options-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    margin-bottom: 24px;
}

.option-btn {
    background: #ffffff;
    border: 1.5px solid #d2d2d7;
    border-radius: 12px;
    padding: 16px 14px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}
.option-btn .label {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
}
.option-btn .desc {
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.3;
}
.option-btn:hover {
    border-color: #86868b;
    background: #fafafa;
}

/* Selected state */
.option-btn.selected-true {
    border-color: #1d1d1f;
    background: #f5f5f7;
}
.option-btn.selected-true .label { color: #000000; }

.option-btn.selected-false {
    border-color: #1d1d1f;
    background: #f5f5f7;
}
.option-btn.selected-false .label { color: #000000; }

.option-btn.selected-unk {
    border-color: #1d1d1f;
    background: #f5f5f7;
}

/* Reason input */
.reason-container {
    max-width: 540px;
    margin: 0 auto 28px auto;
}
.reason-input {
    width: 100%;
    border: 1px solid #d2d2d7;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 0.88rem;
    font-family: inherit;
    color: var(--text-primary);
    background: #fff;
    resize: none;
    outline: none;
    transition: border-color 0.15s;
}
.reason-input:focus {
    border-color: var(--accent);
}
.reason-input::placeholder {
    color: #aeaeb2;
}

/* Gameplay Performance Profile Card */
.profile-card {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    padding: 16px 18px;
    margin-bottom: 14px;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
}
.profile-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #f1f5f9;
}
.profile-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 8px;
}
.profile-chips {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
}
.prof-chip {
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 0.72rem;
    font-weight: 600;
}
.prof-ammo { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
.prof-optic { background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; }
.prof-handling { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
.prof-mag { background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }
.prof-recoil { background: #e0f2fe; color: #075985; border: 1px solid #bae6fd; }
.prof-firecontrol { background: #ffedd5; color: #c2410c; border: 1px solid #fed7aa; }

.baseline-badge {
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 0.73rem;
    font-weight: 700;
}
.baseline-yes { background: #fef08a; color: #854d0e; border: 1px solid #fde047; }
.baseline-no { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }

.baseline-reason {
    font-size: 0.78rem;
    color: #475569;
    margin-bottom: 8px;
    background: #f8fafc;
    padding: 5px 10px;
    border-radius: 6px;
    border-left: 3px solid #3b82f6;
}
.recommendation-features-grid {
    margin-top: 6px;
}
.rec-title {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #64748b;
    margin-bottom: 4px;
}
.rec-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.rec-chips span {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 0.78rem;
    color: #1e293b;
}

/* Resolved Gameplay Effects Card */
.resolved-effects-container {
    margin: 16px 0 22px 0;
}
.resolved-card {
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px 18px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
}
.resolved-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-subtle);
}
.resolved-card-title {
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 8px;
}
.resolved-badges {
    display: flex;
    align-items: center;
    gap: 6px;
}
.badge-resolved {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    background: #ecfdf5;
    color: #047857;
    border: 1px solid #a7f3d0;
}
.badge-unverified {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    background: #fffbeb;
    color: #b45309;
    border: 1px solid #fde68a;
}
.badge-prov {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 500;
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #cbd5e1;
}
.resolved-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 8px;
    margin-bottom: 10px;
}
.resolved-stat-item {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 7px 11px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.resolved-stat-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #64748b;
}
.resolved-stat-val {
    font-size: 0.85rem;
    font-weight: 600;
    color: #0f172a;
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
}
.stat-from {
    color: #94a3b8;
    font-size: 0.78rem;
    text-decoration: line-through;
}
.stat-arrow {
    color: #64748b;
    font-size: 0.75rem;
}
.stat-to {
    color: #0369a1;
}
.resolved-recoil-box {
    margin-top: 8px;
    padding: 9px 12px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    font-size: 0.8rem;
    color: #166534;
    display: flex;
    align-items: center;
    gap: 6px;
}
.resolved-reload-box {
    margin-top: 8px;
    padding: 10px 13px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.resolved-reload-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #334155;
}
.resolved-reload-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
}
.reload-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 0.78rem;
    color: #1e293b;
}
.reload-chip strong {
    font-weight: 600;
}
.reload-tag-faster {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    background: #ecfdf5;
    color: #059669;
    border: 1px solid #a7f3d0;
}
.reload-tag-slower {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    background: #fffbeb;
    color: #b45309;
    border: 1px solid #fde68a;
}
.reload-tag-stage {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #e2e8f0;
}
.reload-tag-seq {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    background: #e0f2fe;
    color: #0369a1;
    border: 1px solid #bae6fd;
}
.unverified-alert {
    padding: 12px 14px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
    font-size: 0.82rem;
    color: #92400e;
    line-height: 1.45;
}

/* Navigation & Footer */
.navigation-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 16px;
    border-top: 1px solid var(--border-subtle);
}
.nav-arrow-btn {
    background: none;
    border: none;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--accent);
    cursor: pointer;
    padding: 6px 12px;
    border-radius: 6px;
}
.nav-arrow-btn:hover {
    background: #f5f5f7;
}
.shortcuts-hint {
    font-size: 0.78rem;
    color: var(--text-tertiary);
}

/* Details Section (Accordion) */
.details-toggle-container {
    margin-top: 24px;
    border-top: 1px solid var(--border-subtle);
    padding-top: 16px;
}
.details-summary {
    font-size: 0.82rem;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
}
.details-summary:hover {
    color: var(--text-primary);
}
.details-content {
    margin-top: 14px;
    background: #fbfbfd;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    font-size: 0.82rem;
    line-height: 1.5;
}
.details-meta-grid {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 8px 12px;
    margin-bottom: 14px;
}
.details-meta-grid dt {
    color: var(--text-secondary);
    font-weight: 500;
}
.details-meta-grid dd {
    color: var(--text-primary);
    word-break: break-all;
}

.details-weapons {
    margin-bottom: 14px;
}
.details-weapons .weapon-tag {
    display: inline-block;
    background: #ffffff;
    border: 1px solid #e5e5ea;
    padding: 2px 7px;
    border-radius: 4px;
    margin: 2px;
    font-size: 0.75rem;
}

.raw-mod-table {
    width: 100%;
    border-collapse: collapse;
    font-family: monospace;
    font-size: 0.75rem;
    margin-top: 8px;
}
.raw-mod-table th {
    text-align: left;
    padding: 4px 6px;
    border-bottom: 1px solid #e5e5ea;
    color: var(--text-secondary);
}
.raw-mod-table td {
    padding: 4px 6px;
    border-bottom: 1px solid #f0f0f3;
}

/* Minimal Modal for Summary */
.modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(4px);
    display: none;
    justify-content: center;
    align-items: center;
    z-index: 100;
}
.modal-card {
    background: #ffffff;
    border-radius: 14px;
    width: 90%;
    max-width: 680px;
    max-height: 82vh;
    padding: 32px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
}
.modal-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 20px;
}
.modal-head h2 {
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: -0.01em;
}
.modal-stats-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 20px;
    text-align: center;
}
.modal-stat-box {
    background: #f5f5f7;
    padding: 12px 8px;
    border-radius: 8px;
}
.modal-stat-box .count {
    font-size: 1.35rem;
    font-weight: 600;
    color: var(--text-primary);
}
.modal-stat-box .lbl {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-top: 2px;
}

.search-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.85rem;
    margin-bottom: 12px;
    outline: none;
}
.search-input:focus {
    border-color: var(--accent);
}

.modal-list-scroll {
    flex: 1;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: #fafafa;
}
.list-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-subtle);
    background: #fff;
    cursor: pointer;
    font-size: 0.85rem;
}
.list-item:hover {
    background: #f5f5f7;
}
.list-item .item-main {
    font-weight: 500;
}
.list-item .item-sub {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-family: monospace;
}
.badge-tag {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
}
.badge-true { background: #eef2ff; color: #4338ca; }
.badge-false { background: #ecfdf5; color: #047857; }
.badge-unk { background: #f3f4f6; color: #6b7280; }
.badge-none { color: #d1d5db; font-size: 0.75rem; }

.modal-close-btn {
    align-self: flex-end;
    margin-top: 16px;
    background: #1d1d1f;
    color: white;
    border: none;
    padding: 8px 18px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
}
</style>
</head>
<body>

<header>
    <div class="title-group">
        <h1>Attachment Classifier</h1>
        <p>Recoil recommendation baseline review</p>
    </div>
    <div class="header-action">
        <span class="progress-text" id="progressIndicator">0 / 0</span>
        <button class="summary-link" onclick="openSummaryModal()">Review Summary</button>
    </div>
</header>

<div class="progress-line-container">
    <div class="progress-line">
        <div class="progress-line-bar" id="progressBar"></div>
    </div>
</div>

<main>
    <div class="stage-card">
        <!-- Hero Attachment Title & Meta -->
        <div class="att-hero">
            <div class="name" id="attName">Loading...</div>
            <div class="meta-row">
                <span>Normalized Variant</span>
                <span class="variant-code" id="attId">id</span>
                <span class="dot-sep">·</span>
                <span>Compatible Weapons</span>
                <span style="font-weight:600; color:var(--text-primary);" id="attWeaponCount">0</span>
            </div>
        </div>

        <!-- Detected Traits Pills -->
        <div class="traits-wrap" id="traitsContainer"></div>

        <!-- Resolved Gameplay Effects Section -->
        <div id="resolvedEffectsBox" class="resolved-effects-container"></div>

        <!-- Core Decision Section -->
        <div class="decision-box">
            <!-- Ammo Baseline Notice (When viewing Ammo slot attachments) -->
            <div id="ammoBaselineNotice" style="display:none; background:#fef3c7; border:1px solid #fde68a; border-radius:10px; padding:16px 20px; text-align:center; margin-bottom:14px;">
                <div style="font-size:0.95rem; font-weight:700; color:#92400e; margin-bottom:4px;">⚡ AMMO BASELINE</div>
                <div style="font-size:0.84rem; color:#78350f; line-height:1.45;">
                    This attachment is handled as an independent ammunition / weapon performance baseline and is excluded from the general attachment classifier.
                </div>
            </div>

            <div id="decisionControls">
                <div class="decision-question">“이 일반 부착물에 독자적인 반동 계산 컨텍스트(recoilContext)가 필요한가요?”</div>
                <div class="decision-subtitle">무기 반동 물리 계산 시 기존 무기와 분리된 독립 recoil baseline/context가 필요한지 지정합니다. (성능 프로필/추천 피처와는 독립적으로 관리됩니다)</div>

                <!-- Apple-style Segmented Selection Buttons -->
                <div class="options-grid">
                    <button class="option-btn" id="btnTrue" onclick="classifyCurrent(true)">
                        <div class="label">독립 Recoil Context</div>
                        <div class="desc">독자적 반동 기준선 필요 [1]</div>
                    </button>
                    <button class="option-btn" id="btnFalse" onclick="classifyCurrent(false)">
                        <div class="label">기본 Recoil 유지</div>
                        <div class="desc">기본 무기 반동 모델 유지 [2]</div>
                    </button>
                    <button class="option-btn" id="btnUnk" onclick="classifyCurrent('unknown')">
                        <div class="label">판단 보류</div>
                        <div class="desc">추가 확인 필요 [3]</div>
                    </button>
                </div>

                <!-- Reason Input -->
                <div class="reason-container">
                    <textarea id="reasonInput" class="reason-input" rows="2" placeholder="왜 이렇게 판단했는지 간단히 적어주세요 (선택 사항)"></textarea>
                </div>
            </div>
        </div>

        <!-- Navigation Bar -->
        <div class="navigation-bar">
            <button class="nav-arrow-btn" onclick="prevItem()">← 이전</button>
            <div class="shortcuts-hint">1 독립 Recoil · 2 기본 Recoil · 3 보류 · ← → 이동</div>
            <button class="nav-arrow-btn" onclick="nextItem()">다음 →</button>
        </div>

        <!-- Collapsible Details for Technical Inspection -->
        <div class="details-toggle-container">
            <details id="detailsAccordion">
                <summary class="details-summary">Technical details</summary>
                <div class="details-content">
                    <dl class="details-meta-grid">
                        <dt>Variant ID</dt>
                        <dd><code id="detId"></code></dd>
                        <dt>Slot</dt>
                        <dd id="detSlot"></dd>
                        <dt>Official Info</dt>
                        <dd id="detInfo" style="color:var(--text-secondary);"></dd>
                        <dt>Modifier Count</dt>
                        <dd id="detModCount"></dd>
                    </dl>

                    <div style="font-weight:600; margin-bottom:4px; color:var(--text-secondary);">Compatible Weapons:</div>
                    <div class="details-weapons" id="detWeapons"></div>

                    <div style="font-weight:600; margin-bottom:4px; color:var(--text-secondary);">Modified Key Paths:</div>
                    <div style="margin-bottom:12px; font-family:monospace; font-size:0.75rem; color:#475569;" id="detPaths"></div>

                    <div style="font-weight:600; margin-bottom:4px; color:var(--text-secondary);">Raw Modifiers Table:</div>
                    <table class="raw-mod-table">
                        <thead>
                            <tr><th>Type</th><th>Index Path</th><th>Value</th></tr>
                        </thead>
                        <tbody id="detRawTable"></tbody>
                    </table>
                </div>
            </details>
        </div>
    </div>
</main>

<!-- Minimal Modal for Summary -->
<div class="modal-overlay" id="summaryModal">
    <div class="modal-card">
        <div class="modal-head">
            <h2>Review Summary</h2>
            <span style="font-size:0.8rem; color:var(--text-secondary);" id="modalTotalLabel"></span>
        </div>

        <div class="modal-stats-bar">
            <div class="modal-stat-box">
                <div class="count" id="statReviewed">0</div>
                <div class="lbl">Reviewed</div>
            </div>
            <div class="modal-stat-box">
                <div class="count" id="statNewBase" style="color:var(--true-color);">0</div>
                <div class="lbl">독립 RecoilContext</div>
            </div>
            <div class="modal-stat-box">
                <div class="count" id="statExistingBase" style="color:var(--false-color);">0</div>
                <div class="lbl">기본 Recoil 유지</div>
            </div>
            <div class="modal-stat-box">
                <div class="count" id="statNeedsReview" style="color:var(--unk-color);">0</div>
                <div class="lbl">Needs review</div>
            </div>
        </div>

        <input type="text" id="modalSearchInput" class="search-input" placeholder="Filter by attachment name or variant ID..." oninput="renderModalList()">

        <div class="modal-list-scroll" id="modalListContainer"></div>

        <button class="modal-close-btn" onclick="closeSummaryModal()">Close</button>
    </div>
</div>

<script>
let items = [];
let classifications = {};
let currentIndex = 0;

async function loadData() {
    const res = await fetch('/api/data');
    const data = await res.json();
    items = data.items;
    classifications = data.classifications;

    // Find first unreviewed item
    for (let i = 0; i < items.length; i++) {
        if (!classifications[items[i].id]) {
            currentIndex = i;
            break;
        }
    }

    renderCurrent();
}

function renderCurrent() {
    if (!items.length) return;
    const item = items[currentIndex];
    const classified = classifications[item.id];

    // Progress
    const classifiedCount = Object.keys(classifications).length;
    document.getElementById('progressIndicator').innerText = (currentIndex + 1) + ' / ' + items.length;
    document.getElementById('progressBar').style.width = ((classifiedCount / items.length) * 100) + '%';

    // Main header info
    const displayNameSuffix = (item.displayName && item.displayName !== item.name) ? ' (' + item.displayName + ')' : '';
    document.getElementById('attName').innerHTML = item.name + (displayNameSuffix ? '<span style=\"font-size:1.1rem; color:var(--text-secondary); font-weight:normal;\">' + displayNameSuffix + '</span>' : '');
    document.getElementById('attId').innerText = item.id;
    document.getElementById('attWeaponCount').innerText = item.weaponCount;

    // Traits
    const traitsContainer = document.getElementById('traitsContainer');
    traitsContainer.innerHTML = '';
    const t = item.traits || {};
    
    // In-Game Module Badge
    if (item.inGameModule) {
        const badge = document.createElement('div');
        badge.className = 'trait-chip';
        badge.style.background = '#ecfdf5';
        badge.style.color = '#065f46';
        badge.style.borderColor = '#a7f3d0';
        badge.style.fontWeight = '600';
        badge.innerText = 'In-Game Module Active (' + item.inGameModule.sourceFile + ')';
        traitsContainer.appendChild(badge);
    }

    // Show detected traits clearly and quietly
    if (t.altersCaliber) addTraitChip(traitsContainer, 'Caliber altered');
    if (t.altersRpm) addTraitChip(traitsContainer, 'RPM altered');
    if (t.altersMag) addTraitChip(traitsContainer, 'Mag size altered');
    if (t.altersDamage) addTraitChip(traitsContainer, 'Damage profile altered');
    if (t.altersType) addTraitChip(traitsContainer, 'Weapon type altered');
    if (t.altersRecoil) addTraitChip(traitsContainer, 'Recoil impulse altered (+25~30%)');

    if (!t.altersCaliber && !t.altersRpm && !t.altersMag && !t.altersDamage && !t.altersType && !t.altersRecoil) {
        const span = document.createElement('span');
        span.style.fontSize = '0.78rem';
        span.style.color = '#a1a1a6';
        span.innerText = 'No core engine baseline alterations detected';
        traitsContainer.appendChild(span);
    }

    // Render Resolved Gameplay Effects
    const effectsBox = document.getElementById('resolvedEffectsBox');
    const eff = item.resolvedEffects;
    if (!eff) {
        effectsBox.innerHTML = '';
    } else if (eff.status === 'UNVERIFIED') {
        effectsBox.innerHTML = \`
            <div class="resolved-card">
                <div class="resolved-card-head">
                    <div class="resolved-card-title">
                        <span>Resolved Gameplay Effects</span>
                        <span style="font-size:0.75rem; font-weight:normal; color:#64748b;">(Target: <strong>\${eff.weaponName}</strong>)</span>
                    </div>
                    <div class="resolved-badges">
                        <span class="badge-unverified">⚠️ UNVERIFIED</span>
                        <span class="badge-prov">\${eff.provenance}</span>
                    </div>
                </div>
                <div class="unverified-alert">
                    <strong>데이터 미검증 (보류 사유):</strong> \${eff.unverifiedReason || 'No in-game stat overrides found in dataset.'}
                </div>
            </div>
        \`;
    } else {
        const changes = eff.changes || {};
        const statItems = [];
        if (changes.displayName) {
            statItems.push(\`<div class="resolved-stat-item"><span class="resolved-stat-label">Weapon Name</span><span class="resolved-stat-val"><span class="stat-from">\${changes.displayName.from}</span><span class="stat-arrow">→</span><span class="stat-to">\${changes.displayName.to}</span></span></div>\`);
        }
        if (changes.ammoType) {
            statItems.push(\`<div class="resolved-stat-item"><span class="resolved-stat-label">Ammo Type</span><span class="resolved-stat-val"><span class="stat-from">\${changes.ammoType.from}</span><span class="stat-arrow">→</span><span class="stat-to">\${changes.ammoType.to}</span></span></div>\`);
        }
        if (changes.damage) {
            statItems.push(\`<div class="resolved-stat-item"><span class="resolved-stat-label">Damage (Close → Far)</span><span class="resolved-stat-val"><span class="stat-from">\${changes.damage.from}</span><span class="stat-arrow">→</span><span class="stat-to">\${changes.damage.to}</span></span></div>\`);
        }
        if (changes.rpm) {
            statItems.push(\`<div class="resolved-stat-item"><span class="resolved-stat-label">Firerate (RPM)</span><span class="resolved-stat-val"><span class="stat-from">\${changes.rpm.from}</span><span class="stat-arrow">→</span><span class="stat-to">\${changes.rpm.to}</span></span></div>\`);
        }
        if (changes.magSize) {
            statItems.push(\`<div class="resolved-stat-item"><span class="resolved-stat-label">Magazine Size</span><span class="resolved-stat-val"><span class="stat-from">\${changes.magSize.from}</span><span class="stat-arrow">→</span><span class="stat-to">\${changes.magSize.to} rounds</span></span></div>\`);
        }
        if (changes.reserveAmmo) {
            statItems.push(\`<div class="resolved-stat-item"><span class="resolved-stat-label">Reserve Ammo</span><span class="resolved-stat-val"><span class="stat-from">\${changes.reserveAmmo.from}</span><span class="stat-arrow">→</span><span class="stat-to">\${changes.reserveAmmo.to} rounds</span></span></div>\`);
        }
        if (changes.multHead || changes.multTorso) {
            const h = changes.multHead ? \`Head: \${changes.multHead.from}→\${changes.multHead.to}\` : '';
            const t = changes.multTorso ? \`Torso: \${changes.multTorso.from}→\${changes.multTorso.to}\` : '';
            statItems.push(\`<div class="resolved-stat-item"><span class="resolved-stat-label">Damage Multipliers</span><span class="resolved-stat-val">\${[h, t].filter(Boolean).join(', ')}</span></div>\`);
        }
        if (changes.bulletSpeed || changes.penetration || changes.suppression || changes.pelletCount) {
            const parts = [];
            if (changes.bulletSpeed) parts.push(\`Speed: \${changes.bulletSpeed.from}→\${changes.bulletSpeed.to} m/s\`);
            if (changes.penetration) parts.push(\`Pen: \${changes.penetration.from}→\${changes.penetration.to} studs\`);
            if (changes.suppression) parts.push(\`Suppression: \${changes.suppression.from}→\${changes.suppression.to}\`);
            if (changes.pelletCount) parts.push(\`Pellets: \${changes.pelletCount.from}→\${changes.pelletCount.to}\`);
            statItems.push(\`<div class="resolved-stat-item"><span class="resolved-stat-label">Ballistics & Physics</span><span class="resolved-stat-val">\${parts.join(', ')}</span></div>\`);
        }
        if (changes.fireModes) {
            statItems.push(\`<div class="resolved-stat-item"><span class="resolved-stat-label">Fire Modes</span><span class="resolved-stat-val">\${JSON.stringify(changes.fireModes.to)}</span></div>\`);
        }
        if (changes.walkSpeed || changes.aimSpeed || changes.equipSpeed || changes.sprintSpeed || changes.aimWalkSpeed || changes.equipTime || changes.unequipTime) {
            const parts = [];
            if (changes.walkSpeed) parts.push(\`Walk: \${changes.walkSpeed.from}→\${changes.walkSpeed.to}\`);
            if (changes.sprintSpeed) parts.push(\`Sprint: \${changes.sprintSpeed.from}→\${changes.sprintSpeed.to}\`);
            if (changes.aimWalkSpeed) parts.push(\`AimWalk: \${changes.aimWalkSpeed.from}→\${changes.aimWalkSpeed.to}\`);
            if (changes.aimSpeed) parts.push(\`Aim: \${changes.aimSpeed.from}→\${changes.aimSpeed.to}\`);
            if (changes.equipSpeed) parts.push(\`Equip: \${changes.equipSpeed.from}→\${changes.equipSpeed.to}\`);
            if (changes.equipTime) parts.push(\`EquipTime: \${changes.equipTime.from}→\${changes.equipTime.to}\`);
            if (changes.unequipTime) parts.push(\`UnequipTime: \${changes.unequipTime.from}→\${changes.unequipTime.to}\`);
            statItems.push(\`<div class="resolved-stat-item"><span class="resolved-stat-label">Mobility & Handling (Weight)</span><span class="resolved-stat-val">\${parts.join(', ')}</span></div>\`);
        }
        if (changes.hipfireSpread || changes.choke || changes.swaySummary) {
            const parts = [];
            if (changes.hipfireSpread) parts.push(\`Hipfire: \${changes.hipfireSpread.from}→\${changes.hipfireSpread.to}\`);
            if (changes.choke) parts.push(\`Choke: \${changes.choke.from}→\${changes.choke.to}\`);
            if (changes.swaySummary) parts.push(changes.swaySummary);
            statItems.push(\`<div class="resolved-stat-item"><span class="resolved-stat-label">Accuracy & Sway</span><span class="resolved-stat-val">\${parts.join(' | ')}</span></div>\`);
        }
        if (changes.specialMechanics && changes.specialMechanics.length > 0) {
            statItems.push(\`<div class="resolved-stat-item" style="border-color:#bae6fd; background:#f0f9ff;"><span class="resolved-stat-label" style="color:#0369a1;">Special Mechanics</span><span class="resolved-stat-val" style="color:#0284c7;">\${changes.specialMechanics.join(', ')}</span></div>\`);
        }

        const recoilHtml = changes.recoilSummary 
            ? \`<div class="resolved-recoil-box">🎯 <strong>Recoil Dynamics:</strong> \${changes.recoilSummary}</div>\`
            : '';

        // Reload Effects HTML
        let reloadHtml = '';
        const rel = changes.reloadEffects || eff.reloadEffects;
        if (rel && rel.hasReloadEffects) {
            const reloadItems = [];
            if (rel.standard && rel.standard.timescale) {
                const ts = rel.standard.timescale;
                const isFaster = ts.timeFactor < 1.0;
                const tagClass = isFaster ? 'reload-tag-faster' : 'reload-tag-slower';
                reloadItems.push(\`
                    <div class="reload-chip">
                        <span>Standard Reload: <strong>Time ×\${ts.timeFactor}</strong></span>
                        <span class="\${tagClass}">\${ts.deltaPercent} reload time</span>
                    </div>
                \`);
            }
            if (rel.standard && rel.standard.resettime) {
                const rt = rel.standard.resettime;
                reloadItems.push(\`
                    <div class="reload-chip">
                        <span>Standard Reset Time: <strong>×\${rt.timeFactor}</strong></span>
                    </div>
                \`);
            }
            if (rel.tactical && rel.tactical.timescale) {
                const ts = rel.tactical.timescale;
                const isFaster = ts.timeFactor < 1.0;
                const tagClass = isFaster ? 'reload-tag-faster' : 'reload-tag-slower';
                reloadItems.push(\`
                    <div class="reload-chip">
                        <span>Tactical Reload: <strong>Time ×\${ts.timeFactor}</strong></span>
                        <span class="\${tagClass}">\${ts.deltaPercent} reload time</span>
                    </div>
                \`);
            }
            if (rel.tactical && rel.tactical.resettime) {
                const rt = rel.tactical.resettime;
                reloadItems.push(\`
                    <div class="reload-chip">
                        <span>Tactical Reset Time: <strong>×\${rt.timeFactor}</strong></span>
                    </div>
                \`);
            }
            if (rel.animationMods && rel.animationMods.length > 0) {
                for (const am of rel.animationMods) {
                    const descParts = [];
                    if (am.timescale !== undefined) descParts.push(\`Timescale ×\${am.timescale}\`);
                    if (am.resettime !== undefined) descParts.push(\`Reset Time ×\${am.resettime}\`);
                    reloadItems.push(\`
                        <div class="reload-chip">
                            <span>Stage (<strong>\${am.stage}</strong>): \${descParts.join(', ')}</span>
                            <span class="reload-tag-stage">Stage-specific</span>
                        </div>
                    \`);
                }
            }
            if (rel.alternativeSequence && rel.alternativeSequence.reload) {
                const r = rel.alternativeSequence.reload;
                reloadItems.push(\`
                    <div class="reload-chip">
                        <span>Reload Sequence: <strong>\${r.from} → \${r.to}</strong></span>
                        <span class="reload-tag-seq">\${r.note || 'Sequence-specific'}</span>
                    </div>
                \`);
            }
            if (rel.alternativeSequence && rel.alternativeSequence.reloadLong) {
                const rl = rel.alternativeSequence.reloadLong;
                reloadItems.push(\`
                    <div class="reload-chip">
                        <span>Long Reload Sequence: <strong>\${rl.from} → \${rl.to}</strong></span>
                        <span class="reload-tag-seq">\${rl.note || 'Sequence-specific'}</span>
                    </div>
                \`);
            }
            if (rel.special && rel.special.length > 0) {
                for (const sp of rel.special) {
                    reloadItems.push(\`
                        <div class="reload-chip">
                            <span>Special (<strong>\${sp.name}</strong>): \${sp.value}</span>
                        </div>
                    \`);
                }
            }

            if (reloadItems.length > 0) {
                reloadHtml = \`
                    <div class="resolved-reload-box">
                        <div class="resolved-reload-header">
                            <span>⏱️ Reload Effects</span>
                        </div>
                        <div class="resolved-reload-grid">
                            \${reloadItems.join('')}
                        </div>
                    </div>
                \`;
            }
        }

        const emptyNotice = (statItems.length === 0 && !recoilHtml && !reloadHtml)
            ? \`<div style="font-size:0.8rem; color:#64748b; padding:8px 0;">No numeric gameplay stat deltas detected on \${eff.weaponName}.</div>\`
            : '';

        // Gameplay Performance Profile & Recommendation Features Summary Card
        const prof = item.profile || eff.profile;
        let profileHtml = '';
        if (prof) {
            const contextChips = [];
            if (prof.contexts.ammo) contextChips.push('<span class="prof-chip prof-ammo">Ammo Profile</span>');
            if (prof.contexts.optic) contextChips.push('<span class="prof-chip prof-optic">Optic/Aim Profile</span>');
            if (prof.contexts.handling) contextChips.push('<span class="prof-chip prof-handling">Handling Context</span>');
            if (prof.contexts.magazine) contextChips.push('<span class="prof-chip prof-mag">Mag/Reload Context</span>');
            if (prof.contexts.recoilModifying) contextChips.push('<span class="prof-chip prof-recoil">Recoil Modifying</span>');
            if (prof.contexts.fireControl) contextChips.push('<span class="prof-chip prof-firecontrol">Fire-Control Context</span>');

            const baselineBadge = prof.isPerformanceBaseline
                ? \`<span class="baseline-badge baseline-yes">⭐ Independent Baseline (\${prof.baselineType})</span>\`
                : \`<span class="baseline-badge baseline-no">Standard Attachment Modifier</span>\`;

            const feats = prof.recommendationFeatures;
            const featItems = [];
            if (feats.damageDelta) {
                const s = feats.damageDelta.close >= 0 ? \`+\${feats.damageDelta.close}\` : \`\${feats.damageDelta.close}\`;
                const e = feats.damageDelta.far >= 0 ? \`+\${feats.damageDelta.far}\` : \`\${feats.damageDelta.far}\`;
                featItems.push(\`<span>Damage Δ: <strong>\${s} → \${e}</strong></span>\`);
            }
            if (feats.rpmDelta !== undefined) {
                const s = feats.rpmDelta >= 0 ? \`+\${feats.rpmDelta}\` : \`\${feats.rpmDelta}\`;
                featItems.push(\`<span>RPM Δ: <strong>\${s}</strong></span>\`);
            }
            if (feats.fireControlChanged) {
                if (feats.fireControlMechanics && feats.fireControlMechanics.length > 0) {
                    featItems.push(\`<span>Fire Control: <strong>\${feats.fireControlMechanics.join(' | ')}</strong></span>\`);
                } else {
                    featItems.push(\`<span>Fire Control: <strong>Altered</strong></span>\`);
                }
            }
            if (feats.magSizeDelta !== undefined) {
                const s = feats.magSizeDelta >= 0 ? \`+\${feats.magSizeDelta}\` : \`\${feats.magSizeDelta}\`;
                featItems.push(\`<span>Mag Δ: <strong>\${s}</strong></span>\`);
            }
            if (feats.walkSpeedDelta !== undefined) {
                const s = feats.walkSpeedDelta >= 0 ? \`+\${feats.walkSpeedDelta}\` : \`\${feats.walkSpeedDelta}\`;
                featItems.push(\`<span>Walk Δ: <strong>\${s}</strong></span>\`);
            }
            if (feats.sprintSpeedDelta !== undefined) {
                const s = feats.sprintSpeedDelta >= 0 ? \`+\${feats.sprintSpeedDelta}\` : \`\${feats.sprintSpeedDelta}\`;
                featItems.push(\`<span>Sprint Δ: <strong>\${s}</strong></span>\`);
            }
            if (feats.aimSpeedDelta !== undefined) {
                const s = feats.aimSpeedDelta >= 0 ? \`+\${feats.aimSpeedDelta}\` : \`\${feats.aimSpeedDelta}\`;
                featItems.push(\`<span>AimSpeed Δ: <strong>\${s}</strong></span>\`);
            }
            if (feats.equipSpeedDelta !== undefined) {
                const s = feats.equipSpeedDelta >= 0 ? \`+\${feats.equipSpeedDelta}\` : \`\${feats.equipSpeedDelta}\`;
                featItems.push(\`<span>EquipSpeed Δ: <strong>\${s}</strong></span>\`);
            }
            if (feats.pelletCountDelta !== undefined) {
                const s = feats.pelletCountDelta >= 0 ? \`+\${feats.pelletCountDelta}\` : \`\${feats.pelletCountDelta}\`;
                featItems.push(\`<span>Pellets Δ: <strong>\${s}</strong></span>\`);
            }
            if (feats.bulletSpeedDelta !== undefined) {
                const s = feats.bulletSpeedDelta >= 0 ? \`+\${feats.bulletSpeedDelta}\` : \`\${feats.bulletSpeedDelta}\`;
                featItems.push(\`<span>Velocity Δ: <strong>\${s} studs/s</strong></span>\`);
            }
            if (feats.reloadSpeedMultiplier !== undefined) {
                featItems.push(\`<span>Reload Factor: <strong>×\${feats.reloadSpeedMultiplier}</strong></span>\`);
            }
            if (feats.recoilParamCount > 0) {
                featItems.push(\`<span>Recoil Params: <strong>\${feats.recoilParamCount}</strong> (\${feats.recoilFactorMin}x~\${feats.recoilFactorMax}x)</span>\`);
            }
            if (feats.zoom !== undefined) {
                featItems.push(\`<span>Zoom: <strong>\${feats.zoom}x</strong></span>\`);
            }

            profileHtml = \`
                <div class="profile-card">
                    <div class="profile-card-head">
                        <div class="profile-title">
                            <span>🎮 Gameplay Performance Profile</span>
                            \${baselineBadge}
                        </div>
                        <div class="profile-chips">\${contextChips.join('')}</div>
                    </div>
                    \${prof.baselineReason ? \`<div class="baseline-reason">📌 \${prof.baselineReason}</div>\` : ''}
                    <div class="recommendation-features-grid">
                        <div class="rec-title">Key Recommendation Features:</div>
                        <div class="rec-chips">\${featItems.length > 0 ? featItems.join('') : '<span style="color:#8e8e93;">No critical scalar deltas (standard utility or cosmetic)</span>'}</div>
                    </div>
                </div>
            \`;
        }

        effectsBox.innerHTML = \`
            \${profileHtml}
            <div class="resolved-card">
                <div class="resolved-card-head">
                    <div class="resolved-card-title">
                        <span>Resolved Gameplay Effects</span>
                        <span style="font-size:0.75rem; font-weight:normal; color:#64748b;">(Simulated on: <strong>\${eff.weaponName}</strong>)</span>
                    </div>
                    <div class="resolved-badges">
                        <span class="badge-resolved">✓ RESOLVED</span>
                        <span class="badge-prov">\${eff.provenance}</span>
                    </div>
                </div>
                <div class="resolved-grid">
                    \${statItems.join('')}
                </div>
                \${recoilHtml}
                \${reloadHtml}
                \${emptyNotice}
            </div>
        \`;
    }

    // Decision Button States
    const isAmmo = item.slot === 'Ammo';
    const ammoNoticeEl = document.getElementById('ammoBaselineNotice');
    const decisionControlsEl = document.getElementById('decisionControls');
    if (ammoNoticeEl) ammoNoticeEl.style.display = isAmmo ? 'block' : 'none';
    if (decisionControlsEl) decisionControlsEl.style.display = isAmmo ? 'none' : 'block';

    const btnTrue = document.getElementById('btnTrue');
    const btnFalse = document.getElementById('btnFalse');
    const btnUnk = document.getElementById('btnUnk');

    btnTrue.className = 'option-btn' + (classified && classified.recoilContext === true ? ' selected-true' : '');
    btnFalse.className = 'option-btn' + (classified && classified.recoilContext === false ? ' selected-false' : '');
    btnUnk.className = 'option-btn' + (classified && classified.recoilContext === 'unknown' ? ' selected-unk' : '');

    // Reason input
    document.getElementById('reasonInput').value = classified ? (classified.reason || '') : '';

    // Technical details
    document.getElementById('detId').innerText = item.id;
    document.getElementById('detSlot').innerText = item.slot;
    document.getElementById('detModCount').innerHTML = eff ?
        ('Raw: <strong>' + eff.rawModifierCount + '</strong> | Resolved: <strong>' + eff.resolvedModifierCount + '</strong> <span style="font-size:0.75rem; color:#059669; font-weight:600;">(' + eff.provenance + ')</span>') :
        item.modifierCount;

    const weaponsContainer = document.getElementById('detWeapons');
    weaponsContainer.innerHTML = item.weapons.map(w => \`<span class="weapon-tag">\${w}</span>\`).join('');

    document.getElementById('detPaths').innerText = item.keyPaths.join(', ') || 'None';

    const rawTbody = document.getElementById('detRawTable');
    rawTbody.innerHTML = item.allModifiers.map(m => \`
        <tr>
            <td style="color:#b45309;">\${m.type}</td>
            <td style="color:#0284c7;">\${m.path}</td>
            <td>\${typeof m.value === 'object' ? JSON.stringify(m.value) : m.value}</td>
        </tr>
    \`).join('');
}

function addTraitChip(container, label) {
    const chip = document.createElement('div');
    chip.className = 'trait-chip active';
    chip.innerText = label;
    container.appendChild(chip);
}

async function classifyCurrent(recoilContext) {
    const item = items[currentIndex];
    if (item.slot === 'Ammo') {
        console.warn('Ammo attachments are excluded from classification.');
        return;
    }
    const reason = document.getElementById('reasonInput').value.trim();

    classifications[item.id] = {
        recoilContext,
        reason,
        timestamp: new Date().toISOString()
    };

    await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, recoilContext, reason })
    });

    renderCurrent();

    // Auto next quietly
    if (currentIndex < items.length - 1) {
        currentIndex++;
        renderCurrent();
    }
}

function prevItem() {
    if (currentIndex > 0) {
        currentIndex--;
        renderCurrent();
    }
}

function nextItem() {
    if (currentIndex < items.length - 1) {
        currentIndex++;
        renderCurrent();
    }
}

// Keyboard shortcuts (quiet & responsive)
window.addEventListener('keydown', (e) => {
    if (document.activeElement === document.getElementById('reasonInput') ||
        document.activeElement === document.getElementById('modalSearchInput')) {
        return;
    }

    if (e.key === '1') classifyCurrent(true);
    else if (e.key === '2') classifyCurrent(false);
    else if (e.key === '3') classifyCurrent('unknown');
    else if (e.key === 'ArrowLeft') prevItem();
    else if (e.key === 'ArrowRight') nextItem();
});

// Modal Logic
function openSummaryModal() {
    renderModalList();
    document.getElementById('summaryModal').style.display = 'flex';
}

function closeSummaryModal() {
    document.getElementById('summaryModal').style.display = 'none';
}

function renderModalList() {
    const query = (document.getElementById('modalSearchInput').value || '').toLowerCase();
    let trueCount = 0;
    let falseCount = 0;
    let unkCount = 0;

    for (const item of items) {
        const c = classifications[item.id];
        if (c) {
            if (c.recoilContext === true) trueCount++;
            else if (c.recoilContext === false) falseCount++;
            else unkCount++;
        }
    }

    document.getElementById('statReviewed').innerText = Object.keys(classifications).length;
    document.getElementById('statNewBase').innerText = trueCount;
    document.getElementById('statExistingBase').innerText = falseCount;
    document.getElementById('statNeedsReview').innerText = unkCount;
    document.getElementById('modalTotalLabel').innerText = items.length + ' variants in total';

    const container = document.getElementById('modalListContainer');
    container.innerHTML = '';

    const filtered = items.filter(item => {
        return item.name.toLowerCase().includes(query) || item.id.toLowerCase().includes(query);
    });

    filtered.forEach(item => {
        const c = classifications[item.id];
        let badgeHtml = '<span class="badge-tag badge-none">unreviewed</span>';
        if (c) {
            if (c.recoilContext === true) badgeHtml = '<span class="badge-tag badge-true">독립 Recoil</span>';
            else if (c.recoilContext === false) badgeHtml = '<span class="badge-tag badge-false">기본 Recoil</span>';
            else badgeHtml = '<span class="badge-tag badge-unk">보류</span>';
        }

        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = \`
            <div>
                <div class="item-main">\${item.name}</div>
                <div class="item-sub">\${item.id} · \${item.weaponCount} weapons</div>
            </div>
            <div>\${badgeHtml}</div>
        \`;
        div.onclick = () => {
            const idx = items.findIndex(it => it.id === item.id);
            if (idx !== -1) {
                currentIndex = idx;
                renderCurrent();
                closeSummaryModal();
            }
        };
        container.appendChild(div);
    });
}

loadData();
</script>
</body>
</html>`;
}
