import * as fs from 'fs';
import * as path from 'path';
import { ModifierEngine } from '../src/core/modifier/ModifierEngine';
import { NormalizedModifier } from '../src/core/data/AttachmentData';

// Load all datasets
const wepDb = JSON.parse(fs.readFileSync('data/in-game-modules/weapon_database.json', 'utf8'));
const attDb = JSON.parse(fs.readFileSync('data/in-game-modules/attachment_database.json', 'utf8'));
const provAtts = JSON.parse(fs.readFileSync('data/canonical/11.17-provisional/attachments.json', 'utf8'));
const provWeps = JSON.parse(fs.readFileSync('data/canonical/11.17-provisional/weapons.json', 'utf8'));
const inGameOverrides = fs.existsSync('data/in-game-modules/attachment_overrides.json')
    ? JSON.parse(fs.readFileSync('data/in-game-modules/attachment_overrides.json', 'utf8')).modules || {}
    : {};

const engine = new ModifierEngine();

export interface ResolvedEffectSummary {
    status: 'RESOLVED' | 'UNVERIFIED';
    unverifiedReason?: string;
    weaponId: string;
    weaponName: string;
    changes: {
        ammoType?: { from: any; to: any };
        displayName?: { from: any; to: any };
        damage?: { from: string; to: string };
        rpm?: { from: any; to: any; delta?: string };
        magSize?: { from: any; to: any };
        reserveAmmo?: { from: any; to: any };
        fireModes?: { from: any; to: any };
        multHead?: { from: any; to: any };
        multTorso?: { from: any; to: any };
        bulletSpeed?: { from: any; to: any };
        penetration?: { from: any; to: any };
        aimSpeed?: { from: any; to: any };
        equipSpeed?: { from: any; to: any };
        recoilSummary?: string;
        otherEffects?: string[];
    };
    rawModifierCount: number;
    resolvedModifierCount: number;
    provenance: string;
}

export function resolveAttachmentForWeapon(variantId: string, weaponId?: string): ResolvedEffectSummary {
    const rawAtt = provAtts[variantId];
    if (!rawAtt) {
        return {
            status: 'UNVERIFIED',
            unverifiedReason: `Attachment variant ${variantId} not found in canonical dataset`,
            weaponId: weaponId || 'unknown',
            weaponName: 'Unknown',
            changes: {},
            rawModifierCount: 0,
            resolvedModifierCount: 0,
            provenance: 'NOT_FOUND'
        };
    }

    const targetWeaponId = weaponId || (rawAtt.compatibleWeaponIds && rawAtt.compatibleWeaponIds[0]) || '';
    
    // Find weapon data
    let baseWeapon: any = null;
    let weaponDisplayName = targetWeaponId;

    // 1. Try wepDb in-game
    for (const [k, w] of Object.entries(wepDb)) {
        const sanitized = k.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (sanitized === targetWeaponId.toLowerCase().replace(/[^a-z0-9_]/g, '_') ||
            (w as any).name?.toLowerCase() === targetWeaponId.toLowerCase()) {
            baseWeapon = JSON.parse(JSON.stringify(w));
            weaponDisplayName = (w as any).name || k;
            break;
        }
    }

    // 2. Try provWeps
    if (!baseWeapon && provWeps[targetWeaponId]) {
        const pw = provWeps[targetWeaponId];
        baseWeapon = {
            name: pw.displayName || pw.name,
            ammotype: pw.stats?.ammotype,
            damage0: pw.stats?.damage0,
            damage1: pw.stats?.damage1,
            firerate: pw.stats?.rpm || pw.stats?.firerate,
            magsize: pw.stats?.magsize,
            sparerounds: pw.stats?.sparerounds,
            multhead: pw.stats?.multhead,
            multtorso: pw.stats?.multtorso,
            recoil: pw.stats?.recoil ?? null
        };
        weaponDisplayName = pw.displayName || pw.name;
    }

    if (!baseWeapon) {
        return {
            status: 'UNVERIFIED',
            unverifiedReason: `Compatible weapon data for '${targetWeaponId}' not found`,
            weaponId: targetWeaponId,
            weaponName: weaponDisplayName,
            changes: {},
            rawModifierCount: rawAtt.modifiers ? rawAtt.modifiers.length : 0,
            resolvedModifierCount: 0,
            provenance: 'MISSING_WEAPON_BASE'
        };
    }

    // Resolve modifiers: In-game override -> Global AttachmentDatabase + Raw variant modifiers
    let activeModule: any = null;
    for (const modKey of Object.keys(inGameOverrides)) {
        const mod = inGameOverrides[modKey];
        if ((mod.targetVariantIds && mod.targetVariantIds.includes(rawAtt.id)) ||
            (mod.attachmentName && mod.attachmentName.toLowerCase() === (rawAtt.name || '').toLowerCase())) {
            activeModule = mod;
            break;
        }
    }

    let resolvedModifiers: NormalizedModifier[] = [];
    let provenance = 'RAW_ONLY';

    if (activeModule) {
        resolvedModifiers = activeModule.modifiers.map((m: any) => ({
            type: m.type,
            indexPath: m.indexPath,
            value: m.value,
            priority: m.priority || 1,
            insertIndex: m.insertIndex,
            extra: m.extra || { valueIndex: m.valueIndex, indexList: m.indexList }
        }));
        provenance = `OVERRIDE_${activeModule.source || 'MODULE'}`;
    } else {
        const globalAtt = attDb[rawAtt.name];
        if (globalAtt && globalAtt.attachmentModifiers) {
            provenance = 'VERIFIED_GLOBAL_MODULE + WEAPON_OVERRIDE';
            for (const [mType, list] of Object.entries(globalAtt.attachmentModifiers)) {
                if (Array.isArray(list)) {
                    for (const item of list as any[]) {
                        resolvedModifiers.push({
                            type: mType,
                            indexPath: item.indexPath,
                            value: item.value,
                            priority: item.priority || 1,
                            insertIndex: item.insertIndex,
                            extra: {
                                valueIndex: item.valueIndex,
                                indexList: item.indexList
                            }
                        });
                    }
                }
            }
        }

        // Append raw variant modifiers (local overrides from weapons.json)
        if (rawAtt.modifiers) {
            for (const m of rawAtt.modifiers) {
                // If path already exists in global with same type, local override takes precedence or appends
                resolvedModifiers.push({
                    type: m.type,
                    indexPath: m.indexPath,
                    value: m.value,
                    priority: m.priority || 1,
                    insertIndex: m.insertIndex,
                    extra: m.extra
                });
            }
        }
    }

    const rawModCount = rawAtt.modifiers ? rawAtt.modifiers.length : 0;
    const resolvedModCount = resolvedModifiers.length;

    // Check if modifiers are only cosmetic / visual
    const statModTypes = new Set(['trueMultipliers', 'relativeMultipliers', 'tableTrueMultipliers', 'tableRelativeMultipliers']);
    const hasStatMods = resolvedModifiers.some(m => 
        statModTypes.has(m.type) ||
        (m.indexPath && m.indexPath.some(seg => 
            typeof seg === 'string' && (
                seg.startsWith('damage') || seg.startsWith('rpm') || seg.startsWith('firerate') ||
                seg.startsWith('magsize') || seg.startsWith('ammotype') || seg.startsWith('casetype') ||
                seg.startsWith('multhead') || seg.startsWith('multtorso') || seg.startsWith('recoil')
            )
        ))
    );

    if (!hasStatMods && resolvedModifiers.length > 0) {
        const paths = resolvedModifiers.map(m => (m.indexPath?.join('.') || '').toLowerCase()).filter(Boolean);
        const onlyCosmetic = paths.every(p => 
            p.includes('animation') || p.includes('part') || p.includes('remove') || p.includes('color') || p.includes('node') || p.includes('transparency')
        );
        if (onlyCosmetic) {
            return {
                status: 'UNVERIFIED',
                unverifiedReason: `Only cosmetic/model modifiers present (${paths.join(', ')}). Core gameplay stats missing from API (pending 11.17 place dump).`,
                weaponId: targetWeaponId,
                weaponName: weaponDisplayName,
                changes: {},
                rawModifierCount: rawModCount,
                resolvedModifierCount: resolvedModCount,
                provenance: 'UNVERIFIED_PENDING_PLACE_DUMP'
            };
        }
    }

    // Run compileModifiers
    const mockAttachment = {
        id: rawAtt.id,
        name: rawAtt.name,
        displayName: rawAtt.displayName,
        slot: rawAtt.slot,
        modifiers: resolvedModifiers
    };

    const beforeWeapon = JSON.parse(JSON.stringify(baseWeapon));
    const compileResult = engine.compileModifiers(baseWeapon, [mockAttachment as any]);
    const afterWeapon = compileResult.compiledData;

    // Compute Stat Changes
    const changes: ResolvedEffectSummary['changes'] = {};

    // Ammo Type
    const beforeAmmo = beforeWeapon.ammotype;
    const afterAmmo = afterWeapon.ammotype;
    if (afterAmmo && afterAmmo !== beforeAmmo) {
        changes.ammoType = { from: beforeAmmo || 'Default', to: afterAmmo };
    }

    // Display Name
    const afterDisp = afterWeapon.displayname;
    if (afterDisp && afterDisp !== beforeWeapon.name) {
        changes.displayName = { from: beforeWeapon.name, to: afterDisp };
    }

    // Damage
    const getDamage = (w: any) => {
        if (w.damageGraph && Array.isArray(w.damageGraph) && w.damageGraph.length > 0) {
            const close = Math.round((w.damageGraph[0]?.damage ?? 0) * 10) / 10;
            const far = Math.round((w.damageGraph[w.damageGraph.length - 1]?.damage ?? 0) * 10) / 10;
            return `${close} → ${far}`;
        }
        if (w.damage0 !== undefined && w.damage1 !== undefined) {
            return `${Math.round(w.damage0 * 10) / 10} → ${Math.round(w.damage1 * 10) / 10}`;
        }
        return undefined;
    };
    const bDmg = getDamage(beforeWeapon);
    const aDmg = getDamage(afterWeapon);
    if (bDmg && aDmg && bDmg !== aDmg) {
        changes.damage = { from: bDmg, to: aDmg };
    }

    // Firerate / RPM
    const getRpm = (w: any) => {
        if (Array.isArray(w.firerate)) return w.firerate.map((r: number) => Math.round(r)).join(' / ');
        if (typeof w.firerate === 'number') return `${Math.round(w.firerate)}`;
        if (typeof w.rpm === 'number') return `${Math.round(w.rpm)}`;
        return undefined;
    };
    const bRpm = getRpm(beforeWeapon);
    const aRpm = getRpm(afterWeapon);
    if (bRpm && aRpm && bRpm !== aRpm) {
        changes.rpm = { from: bRpm, to: aRpm };
    }

    // Mag Size
    const bMag = beforeWeapon.magsize;
    const aMag = afterWeapon.magsize ? Math.round(afterWeapon.magsize) : undefined;
    if (bMag !== undefined && aMag !== undefined && bMag !== aMag) {
        changes.magSize = { from: bMag, to: aMag };
    }

    // Reserve Ammo
    const bRes = beforeWeapon.sparerounds ?? beforeWeapon.reserveammo;
    const aRes = afterWeapon.reserveammo ?? afterWeapon.sparerounds;
    if (bRes !== undefined && aRes !== undefined && bRes !== aRes) {
        changes.reserveAmmo = { from: bRes, to: Math.round(aRes) };
    }

    // Fire Modes
    const bModes = beforeWeapon.firemodes ? JSON.stringify(beforeWeapon.firemodes) : undefined;
    const aModes = afterWeapon.firemodes ? JSON.stringify(afterWeapon.firemodes) : undefined;
    if (bModes && aModes && bModes !== aModes) {
        changes.fireModes = { from: beforeWeapon.firemodes, to: afterWeapon.firemodes };
    }

    // Multipliers
    if (beforeWeapon.multhead !== undefined && afterWeapon.multhead !== undefined && beforeWeapon.multhead !== afterWeapon.multhead) {
        changes.multHead = { from: beforeWeapon.multhead, to: Math.round(afterWeapon.multhead * 100) / 100 };
    }
    if (beforeWeapon.multtorso !== undefined && afterWeapon.multtorso !== undefined && beforeWeapon.multtorso !== afterWeapon.multtorso) {
        changes.multTorso = { from: beforeWeapon.multtorso, to: Math.round(afterWeapon.multtorso * 100) / 100 };
    }

    // Bullet Speed & Penetration
    if (beforeWeapon.bulletspeed && afterWeapon.bulletspeed && beforeWeapon.bulletspeed !== afterWeapon.bulletspeed) {
        changes.bulletSpeed = { from: Math.round(beforeWeapon.bulletspeed), to: Math.round(afterWeapon.bulletspeed) };
    }
    if (beforeWeapon.penetrationdepth && afterWeapon.penetrationdepth && beforeWeapon.penetrationdepth !== afterWeapon.penetrationdepth) {
        changes.penetration = { from: Math.round(beforeWeapon.penetrationdepth * 10) / 10, to: Math.round(afterWeapon.penetrationdepth * 10) / 10 };
    }

    // Recoil Summary
    const recoilMods = resolvedModifiers.filter(m => m.indexPath && m.indexPath[0] === 'recoil');
    if (recoilMods.length > 0) {
        const multValues = recoilMods.map(m => m.value).filter(v => typeof v === 'number');
        const minMult = multValues.length ? Math.min(...multValues) : 1;
        const maxMult = multValues.length ? Math.max(...multValues) : 1;
        changes.recoilSummary = `${recoilMods.length} recoil parameters modified (factor range: ${minMult}x ~ ${maxMult}x)`;
    }

    return {
        status: 'RESOLVED',
        weaponId: targetWeaponId,
        weaponName: weaponDisplayName,
        changes,
        rawModifierCount: rawModCount,
        resolvedModifierCount: resolvedModCount,
        provenance
    };
}

// Test Fixtures
const testFixtures = [
    { name: 'MTS-570 Conversion (Ammo/Damage/RPM/Recoil/Caliber)', id: 'mts_570_conversion_086fac7b', weapon: 'mts_569' },
    { name: 'Heavy Buffer (RPM conversion)', id: 'heavy_buffer_fccda4ec', weapon: 'm231' },
    { name: 'AR 20 Tact Conversion (Caliber/Mag)', id: 'ar_20_tact_conversion_8cadf7c4', weapon: 'c25' },
    { name: '.223 Remington (Class/Mag/Ammo)', id: '223_remington_98449be8', weapon: 'mk12_spr' },
    { name: '6.5 Grendel (Place Override on AR 7.62x39)', id: 'ar_7_62x39_conversion_c5833a25', weapon: 'c8a2' },
    { name: 'SA58 .243 Conversion (11.17 new conversion)', id: 'sa58_243_conversion_bdf9edfb', weapon: 'sa58_spr' },
    { name: 'Uzi Light Bolt (11.17 new RPM)', id: 'uzi_light_bolt_94f24fc0', weapon: 'uzi' },
    { name: 'HK416A5 .300 Conversion (11.17 Unverified Cosmetic Only)', id: 'hk416a5_300_conversion_edc421a5', weapon: 'hk416a5' }
];

console.log('=== RUNNING CONVERSION RESOLUTION VERIFICATION SUITE ===\n');

for (const tf of testFixtures) {
    console.log(`------------------------------------------------------------`);
    console.log(`FIXTURE: ${tf.name}`);
    console.log(`Variant ID: ${tf.id} | Weapon: ${tf.weapon}`);
    const result = resolveAttachmentForWeapon(tf.id, tf.weapon);
    console.log(`Status: ${result.status}`);
    console.log(`Provenance: ${result.provenance}`);
    console.log(`Modifier Count: Raw ${result.rawModifierCount} -> Resolved ${result.resolvedModifierCount}`);
    if (result.status === 'UNVERIFIED') {
        console.log(`Reason: ${result.unverifiedReason}`);
    } else {
        console.log('Resolved Gameplay Changes on', result.weaponName + ':');
        for (const [k, v] of Object.entries(result.changes)) {
            if (typeof v === 'object' && v !== null && 'from' in v) {
                console.log(`  - ${k}: ${JSON.stringify(v.from)} → ${JSON.stringify(v.to)}`);
            } else {
                console.log(`  - ${k}: ${v}`);
            }
        }
    }
}
