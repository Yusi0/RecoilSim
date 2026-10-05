import * as fs from 'fs';
import * as path from 'path';
import { WeaponsParser, WeaponCompiler, ModifierEngine } from '../src/core';
import { SimulationEngine } from '../src/core/sim/SimulationEngine';
import { MonteCarloEngine } from '../src/montecarlo/MonteCarloEngine';
import { NormalizedWeapon } from '../src/core/data/WeaponData';
import { NormalizedAttachment } from '../src/core/data/AttachmentData';

console.log('=== RecoilSim Deep Audit: data/canonical/11.17-provisional ===\n');

const provDir = path.resolve(__dirname, '../data/canonical/11.17-provisional');
const weaponsMap: Record<string, NormalizedWeapon> = JSON.parse(
    fs.readFileSync(path.join(provDir, 'weapons.json'), 'utf8')
);
const attachmentsMap: Record<string, NormalizedAttachment> = JSON.parse(
    fs.readFileSync(path.join(provDir, 'attachments.json'), 'utf8')
);
const detailsDir = path.join(provDir, 'weapon_details');

const compiler = new WeaponCompiler();
const modEngine = new ModifierEngine();

// Convert attachmentsMap to Map<string, NormalizedAttachment>
const attMap = new Map<string, NormalizedAttachment>();
for (const [id, att] of Object.entries(attachmentsMap)) {
    attMap.set(id, att);
}

// -------------------------------------------------------------
// 1. AUDIT OF ALL 424 WEAPONS
// -------------------------------------------------------------
console.log('1. Auditing all 424 weapons in 11.17-provisional...');

interface WeaponAuditIssue {
    weaponId: string;
    weaponName: string;
    category: string;
    classification: string;
    issues: string[];
    silentDefaultsTriggered: string[];
    simulatableInSimulationEngine: boolean;
    simulatableInMonteCarlo: boolean;
    recoilDisplacementNorm: number;
}

const weaponAuditResults: WeaponAuditIssue[] = [];
let missingDetailFiles = 0;
let zeroRecoilWeapons = 0;
let silentAimSpeedDefaults = 0;
let silentSprintSpeedDefaults = 0;
let silentFirerateDefaults = 0;
let modifierCutoffWarnings = 0;

for (const [wId, w] of Object.entries(weaponsMap)) {
    const detailPath = path.join(detailsDir, `${wId}.json`);
    if (!fs.existsSync(detailPath)) {
        missingDetailFiles++;
        weaponAuditResults.push({
            weaponId: wId,
            weaponName: w.name,
            category: w.category,
            classification: 'MISSING_DETAIL',
            issues: ['weapon_details JSON file does not exist'],
            silentDefaultsTriggered: [],
            simulatableInSimulationEngine: false,
            simulatableInMonteCarlo: false,
            recoilDisplacementNorm: 0
        });
        continue;
    }

    const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
    const issues: string[] = [];
    const silentDefaults: string[] = [];

    // Check recoil
    const hasRecoil = detail.recoil !== null && detail.recoil !== undefined;
    if (!hasRecoil) {
        issues.push('recoil is null/undefined');
    }

    // Check handling
    if (detail.aimspeed === undefined || detail.aimspeed === null) {
        silentDefaults.push('aimspeed (defaults to 15 in SimulationEngine, 16 in getPhysics)');
        silentAimSpeedDefaults++;
    }
    if (detail.sprintspeed === undefined || detail.sprintspeed === null) {
        silentDefaults.push('sprintspeed (defaults to 14 in getPhysics)');
        silentSprintSpeedDefaults++;
    }
    if (detail.firerate === undefined && w.stats.rpm === undefined) {
        silentDefaults.push('firerate/rpm (defaults to 800 in MonteCarloEngine)');
        silentFirerateDefaults++;
    }

    // Try WeaponCompiler
    let compiled: any = null;
    let compileError = false;
    try {
        const res = compiler.compileWeapon(w, {}, attMap, detail);
        compiled = res.compiledWeaponData;
    } catch (e: any) {
        compileError = true;
        issues.push(`WeaponCompiler error: ${e.message}`);
    }

    // Try SimulationEngine & measure recoil displacement
    let simOk = false;
    let mcOk = false;
    let dispNorm = 0;

    if (compiled) {
        try {
            const sim = new SimulationEngine({
                weaponData: compiled,
                seed: 12345
            });
            const interval = 60 / (compiled.firerate || 800);
            for (let s = 0; s < 5; s++) {
                sim.pushFireInput(s * interval);
                sim.advanceTo((s + 1) * interval);
            }
            const pose = sim.getWeaponPose();
            const p = pose.translationRecoilVec;
            const r = pose.rotationRecoilVec;
            dispNorm = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) + Math.sqrt(r.x * r.x + r.y * r.y + r.z * r.z);
            simOk = true;
            if (dispNorm === 0) {
                zeroRecoilWeapons++;
                if (hasRecoil) {
                    issues.push('recoil springs defined but produced 0 displacement');
                } else {
                    silentDefaults.push(`recoil is null -> flagged as ${sim.verificationStatus.status} (${sim.verificationStatus.reason})`);
                }
            }
        } catch (e: any) {
            issues.push(`SimulationEngine error: ${e.message}`);
        }

        // Try MonteCarloEngine
        try {
            const mc = new MonteCarloEngine({
                weaponData: compiled,
                masterSeed: 12345,
                trialCount: 2,
                burstSize: 5
            });
            const mcRes = mc.run();
            if (mcRes && (mcRes.simulationStatus === 'SUCCESS' || mcRes.simulationStatus === 'UNSUPPORTED_WEAPON_TYPE' || mcRes.simulationStatus === 'UNVERIFIED_RECOIL')) {
                mcOk = true;
            }
        } catch (e: any) {
            issues.push(`MonteCarloEngine error: ${e.message}`);
        }
    }

    weaponAuditResults.push({
        weaponId: wId,
        weaponName: w.name,
        category: w.category,
        classification: detail._provenance?.classification || 'UNKNOWN',
        issues,
        silentDefaultsTriggered: silentDefaults,
        simulatableInSimulationEngine: simOk,
        simulatableInMonteCarlo: mcOk,
        recoilDisplacementNorm: dispNorm
    });
}

console.log(`Total weapons checked: ${weaponAuditResults.length}`);
console.log(`Missing detail files: ${missingDetailFiles}`);
console.log(`Weapons producing exactly 0 recoil displacement: ${zeroRecoilWeapons}`);
console.log(`Weapons triggering silent aimspeed fallback (?? 15): ${silentAimSpeedDefaults}`);
console.log(`Weapons triggering silent sprintspeed fallback (?? 14): ${silentSprintSpeedDefaults}`);
console.log(`Weapons triggering silent firerate fallback (?? 800): ${silentFirerateDefaults}`);

// -------------------------------------------------------------
// 2. FOCUS AUDIT: THE 8 NEW WEAPONS & RECOIL UNVERIFIED WEAPONS
// -------------------------------------------------------------
console.log('\n2. Inspecting the 8 New Weapons in Detail...');
const new8Ids = ['hk416a5', 'mcx_virtus', 'mcx_rattler', 'regulator', 'cutlass', 'spear_lt', 'origin_12', 'titanium_fal'];

const new8Audit = weaponAuditResults.filter(r => new8Ids.includes(r.weaponId));
for (const item of new8Audit) {
    console.log(`--- [${item.weaponName}] (${item.category}) ---`);
    console.log(`  Classification: ${item.classification}`);
    console.log(`  SimulationEngine Ok: ${item.simulatableInSimulationEngine}`);
    console.log(`  MonteCarlo Ok: ${item.simulatableInMonteCarlo}`);
    console.log(`  Recoil Displacement Norm: ${item.recoilDisplacementNorm.toFixed(4)}`);
    console.log(`  Issues: ${item.issues.length ? item.issues.join('; ') : 'None'}`);
    console.log(`  Silent Defaults: ${item.silentDefaultsTriggered.length ? item.silentDefaultsTriggered.join('; ') : 'None'}`);
}

// -------------------------------------------------------------
// 3. AUDIT OF ATTACHMENT COMPATIBILITY & MODIFIER APPLICATION
// -------------------------------------------------------------
console.log('\n3. Auditing Attachment Modifiers against Weapon Details...');

let totalAttsTested = 0;
let attWarningsCount = 0;
const warningTypes: Record<string, number> = {};
const attCutoffExamples: Array<{ att: string, weapon: string, warning: string }> = [];

for (const [wId, w] of Object.entries(weaponsMap)) {
    const detailPath = path.join(detailsDir, `${wId}.json`);
    if (!fs.existsSync(detailPath)) continue;
    const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));

    for (const [slot, vIds] of Object.entries(w.attachmentSlots)) {
        for (const vId of vIds) {
            const att = attMap.get(vId);
            if (!att || !att.modifiers || att.modifiers.length === 0) continue;
            totalAttsTested++;

            // Run modifierEngine directly
            const modRes = modEngine.compileModifiers(detail, [att]);
            if (modRes.warnings.length > 0) {
                attWarningsCount += modRes.warnings.length;
                for (const warn of modRes.warnings) {
                    const key = warn.includes('cut off early') ? warn.split('\'')[1] : warn;
                    warningTypes[key] = (warningTypes[key] || 0) + 1;
                    if (attCutoffExamples.length < 15) {
                        attCutoffExamples.push({ att: att.name, weapon: w.name, warning: warn });
                    }
                }
            }
        }
    }
}

console.log(`Total attachment combinations tested: ${totalAttsTested}`);
console.log(`Total modifier warnings encountered: ${attWarningsCount}`);
console.log('Top modifier cutoff / warning targets:');
console.table(Object.entries(warningTypes).sort((a, b) => b[1] - a[1]).slice(0, 15));

console.log('\nSample cut-off warnings:');
for (const ex of attCutoffExamples.slice(0, 8)) {
    console.log(`  Attachment '${ex.att}' on '${ex.weapon}': ${ex.warning}`);
}

// -------------------------------------------------------------
// 4. AUDIT OF WEAPONS RUNNING ON 11.16 FALLBACK WITH 11.17 PATCH RECOIL CHANGES
// -------------------------------------------------------------
console.log('\n4. Checking Weapons with 11.17 Patch Recoil Notes but 11.16 Fallback Springs...');

const patchRecoilKeywords = ['recoil', 'kick', 'camera recoil', 'sway', 'recovery'];
const patchLines = fs.readFileSync('c:/Users/choez/OneDrive/바탕 화면/11.17.0.txt', 'utf8').split('\n');

const weaponsWithPatchRecoilNotes: Array<{ weapon: string, patchMention: string }> = [];

for (const [wId, w] of Object.entries(weaponsMap)) {
    // Search patch text for weapon name near recoil keywords
    const wUpper = w.name.toUpperCase();
    for (let i = 0; i < patchLines.length; i++) {
        const l = patchLines[i];
        if (l.toUpperCase().includes(wUpper)) {
            // Check next 15 lines
            for (let j = i; j < Math.min(i + 15, patchLines.length); j++) {
                const sub = patchLines[j];
                if (sub.startsWith('======')) break;
                if (patchRecoilKeywords.some(k => sub.toLowerCase().includes(k))) {
                    weaponsWithPatchRecoilNotes.push({ weapon: w.name, patchMention: sub.trim() });
                    break;
                }
            }
            break;
        }
    }
}

console.log(`Found ${weaponsWithPatchRecoilNotes.length} weapons with recoil mentioned in patch notes:`);
for (const item of weaponsWithPatchRecoilNotes.slice(0, 12)) {
    console.log(`  Weapon '${item.weapon}': ${item.patchMention}`);
}

console.log('\n=== Audit Complete ===');
