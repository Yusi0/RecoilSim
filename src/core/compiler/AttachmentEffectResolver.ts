import * as fs from 'fs';
import * as path from 'path';
import { ModifierEngine } from '../modifier/ModifierEngine';
import { NormalizedModifier } from '../data/AttachmentData';

export interface StatDelta<T = any> {
    from: T;
    to: T;
    delta?: string;
}

export interface ReloadMultiplierDetail {
    from: number;
    to: number;
    deltaPercent: string;
    timeFactor: number;
}

export interface ReloadStageDetail {
    stage: string;
    timescale?: number;
    resettime?: number;
}

export interface ReloadSequenceDetail {
    from: string;
    to: string;
    note: string;
}

export interface ReloadEffects {
    hasReloadEffects: boolean;
    standard?: {
        timescale?: ReloadMultiplierDetail;
        resettime?: ReloadMultiplierDetail;
    };
    tactical?: {
        timescale?: ReloadMultiplierDetail;
        resettime?: ReloadMultiplierDetail;
    };
    animationMods?: ReloadStageDetail[];
    alternativeSequence?: {
        reload?: ReloadSequenceDetail;
        reloadLong?: ReloadSequenceDetail;
    };
    special?: Array<{ name: string; value: any }>;
    summary?: string[];
}

export interface AttachmentStatChanges {
    ammoType?: StatDelta<string>;
    displayName?: StatDelta<string>;
    damage?: StatDelta<string>;
    rpm?: StatDelta<string>;
    magSize?: StatDelta<number>;
    reserveAmmo?: StatDelta<number>;
    fireModes?: StatDelta<string[]>;
    multHead?: StatDelta<number>;
    multTorso?: StatDelta<number>;
    bulletSpeed?: StatDelta<number>;
    penetration?: StatDelta<number>;
    suppression?: StatDelta<number>;
    pelletCount?: StatDelta<number>;
    aimSpeed?: StatDelta<number>;
    equipSpeed?: StatDelta<number>;
    equipTime?: StatDelta<number>;
    unequipTime?: StatDelta<number>;
    walkSpeed?: StatDelta<number>;
    sprintSpeed?: StatDelta<number>;
    aimWalkSpeed?: StatDelta<number>;
    hipfireSpread?: StatDelta<number>;
    choke?: StatDelta<number>;
    swaySummary?: string;
    specialMechanics?: string[];
    recoilSummary?: string;
    reloadEffects?: ReloadEffects;
    otherEffects?: string[];
}

export interface PerformanceContexts {
    ammo: boolean;
    optic: boolean;
    handling: boolean;
    magazine: boolean;
    recoilModifying: boolean;
    fireControl: boolean;
}

export interface RecommendationFeatures {
    // Firepower & TTK
    damageDelta?: { close: number; far: number };
    rpmDelta?: number;
    headMultiplierDelta?: number;
    torsoMultiplierDelta?: number;

    // Ballistics
    bulletSpeedDelta?: number;
    penetrationDelta?: number;
    suppressionDelta?: number;
    pelletCountDelta?: number;

    // Handling & Mobility (Weight & ADS)
    walkSpeedDelta?: number;
    sprintSpeedDelta?: number;
    aimWalkSpeedDelta?: number;
    aimSpeedDelta?: number;
    equipSpeedDelta?: number;
    equipTimeDelta?: number;
    unequipTimeDelta?: number;

    // Ammo & Magazine
    magSizeDelta?: number;
    reserveAmmoDelta?: number;
    reloadSpeedMultiplier?: number;
    reloadSequenceChanged?: boolean;

    // Recoil & Precision
    recoilFactorMin?: number;
    recoilFactorMax?: number;
    recoilParamCount: number;
    hipfireSpreadDelta?: number;
    chokeDelta?: number;
    swayModified?: boolean;

    // Optic & Aiming
    zoom?: number;
    hasAltAim?: boolean;

    // Identity & Mechanics
    ammoConversion?: boolean;
    fireModesChanged?: boolean;
    fireControlChanged?: boolean;
    fireControlMechanics?: string[];
    specialMechanics: string[];
}

export interface AttachmentPerformanceProfile {
    attachmentId: string;
    attachmentName: string;
    slot: string;
    targetWeaponId: string;
    targetWeaponName: string;

    // Core Architecture: Ammo Baseline vs Existing Weapon Baseline
    isAmmoBaseline: boolean;
    isPerformanceBaseline: boolean; // true only for Ammo Baseline
    baselineLabel: string;
    baselineType: 'AMMO_BASELINE' | 'CALIBER_CONVERSION' | 'NONE';
    baselineReason?: string;

    // Independent gameplay profile contexts
    contexts: PerformanceContexts;

    // Actual resolved gameplay changes
    effects: AttachmentStatChanges;

    // Recoil simulation metadata (Only evaluated for Non-Ammo attachments; Ammo is handled as its own baseline)
    recoilContext: boolean | 'unknown' | null;
    recoilModCount: number;

    // Extracted features ready for recommendation engine
    recommendationFeatures: RecommendationFeatures;
}

export interface ResolvedEffectSummary {
    status: 'RESOLVED' | 'UNVERIFIED';
    unverifiedReason?: string;
    weaponId: string;
    weaponName: string;
    changes: AttachmentStatChanges;
    reloadEffects?: ReloadEffects;
    profile?: AttachmentPerformanceProfile;
    rawModifierCount: number;
    resolvedModifierCount: number;
    provenance: string;
}

export class AttachmentEffectResolver {
    private engine: ModifierEngine;
    private wepDb: Record<string, any>;
    private attDb: Record<string, any>;
    private provWeps: Record<string, any>;
    private provAtts: Record<string, any>;
    private inGameOverrides: Record<string, any>;

    constructor(options?: {
        wepDb?: Record<string, any>;
        attDb?: Record<string, any>;
        provWeps?: Record<string, any>;
        provAtts?: Record<string, any>;
        inGameOverrides?: Record<string, any>;
        modifierEngine?: ModifierEngine;
    }) {
        this.engine = options?.modifierEngine || new ModifierEngine();
        this.wepDb = options?.wepDb || {};
        this.attDb = options?.attDb || {};
        this.provWeps = options?.provWeps || {};
        this.provAtts = options?.provAtts || {};
        this.inGameOverrides = options?.inGameOverrides || {};
    }

    public static createDefault(baseDir: string = process.cwd()): AttachmentEffectResolver {
        const wepDbPath = path.resolve(baseDir, 'data/in-game-modules/weapon_database.json');
        const attDbPath = path.resolve(baseDir, 'data/in-game-modules/attachment_database.json');
        const provWepsPath = path.resolve(baseDir, 'data/canonical/11.17-provisional/weapons.json');
        const provAttsPath = path.resolve(baseDir, 'data/canonical/11.17-provisional/attachments.json');
        const overridesPath = path.resolve(baseDir, 'data/in-game-modules/attachment_overrides.json');

        const wepDb = fs.existsSync(wepDbPath) ? JSON.parse(fs.readFileSync(wepDbPath, 'utf8')) : {};
        const attDb = fs.existsSync(attDbPath) ? JSON.parse(fs.readFileSync(attDbPath, 'utf8')) : {};
        const provWeps = fs.existsSync(provWepsPath) ? JSON.parse(fs.readFileSync(provWepsPath, 'utf8')) : {};
        const provAtts = fs.existsSync(provAttsPath) ? JSON.parse(fs.readFileSync(provAttsPath, 'utf8')) : {};
        const inGameOverrides = fs.existsSync(overridesPath)
            ? (JSON.parse(fs.readFileSync(overridesPath, 'utf8')).modules || {})
            : {};

        return new AttachmentEffectResolver({
            wepDb,
            attDb,
            provWeps,
            provAtts,
            inGameOverrides
        });
    }

    public resolveAttachmentForWeapon(
        attInput: string | {
            id: string;
            name?: string;
            displayName?: string;
            slot?: string;
            modifiers?: NormalizedModifier[];
            compatibleWeaponIds?: string[];
        },
        weaponId?: string
    ): ResolvedEffectSummary {
        const variantId = typeof attInput === 'string' ? attInput : attInput.id;
        const canonicalAtt = this.provAtts[variantId];
        const rawAtt = {
            id: variantId,
            name: (typeof attInput === 'object' && attInput.name) || canonicalAtt?.name || '',
            displayName: (typeof attInput === 'object' && attInput.displayName) || canonicalAtt?.displayName,
            slot: (typeof attInput === 'object' && attInput.slot) || canonicalAtt?.slot || '',
            modifiers: (typeof attInput === 'object' && attInput.modifiers && attInput.modifiers.length > 0)
                ? attInput.modifiers
                : (canonicalAtt?.modifiers || []),
            compatibleWeaponIds: (typeof attInput === 'object' && attInput.compatibleWeaponIds && attInput.compatibleWeaponIds.length > 0)
                ? attInput.compatibleWeaponIds
                : (canonicalAtt?.compatibleWeaponIds || [])
        };

        if (!rawAtt.name && !canonicalAtt) {
            return {
                status: 'UNVERIFIED',
                unverifiedReason: `Attachment variant '${variantId}' not found in canonical dataset`,
                weaponId: weaponId || 'unknown',
                weaponName: 'Unknown',
                changes: {},
                rawModifierCount: 0,
                resolvedModifierCount: 0,
                provenance: 'NOT_FOUND'
            };
        }
        const targetWeaponId = weaponId || (rawAtt.compatibleWeaponIds && rawAtt.compatibleWeaponIds[0]) || '';

        // 1. Locate Base Weapon Data
        let baseWeapon: any = null;
        let weaponDisplayName = targetWeaponId;

        for (const [k, w] of Object.entries(this.wepDb)) {
            const sanitized = k.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            if (sanitized === targetWeaponId.toLowerCase().replace(/[^a-z0-9_]/g, '_') ||
                (w as any).name?.toLowerCase() === targetWeaponId.toLowerCase()) {
                baseWeapon = JSON.parse(JSON.stringify(w));
                weaponDisplayName = (w as any).name || k;
                break;
            }
        }

        if (!baseWeapon && this.provWeps[targetWeaponId]) {
            const pw = this.provWeps[targetWeaponId];
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
                walkspeed: pw.stats?.walkspeed,
                aimspeed: pw.stats?.aimspeed,
                equipspeed: pw.stats?.equipspeed,
                sprintspeed: pw.stats?.sprintspeed,
                aimwalkspeedmult: pw.stats?.aimwalkspeedmult,
                suppression: pw.stats?.suppression,
                pelletcount: pw.stats?.pelletcount,
                equiptime: pw.stats?.equiptime,
                unequiptime: pw.stats?.unequiptime,
                recoil: pw.stats?.recoil ?? null
            };
            weaponDisplayName = pw.displayName || pw.name;
        }

        if (baseWeapon) {
            if (baseWeapon.suppression === undefined) baseWeapon.suppression = 1.0;
            if (baseWeapon.equiptime === undefined) baseWeapon.equiptime = 1.0;
            if (baseWeapon.unequiptime === undefined) baseWeapon.unequiptime = 1.0;
            const isShotgun = (baseWeapon.type === 'SHOTGUN' || baseWeapon.category === 'SHOTGUN' || baseWeapon.class === 'SHOTGUN');
            if (baseWeapon.pelletcount === undefined) baseWeapon.pelletcount = isShotgun ? 8 : 1;
        }

        const rawModCount = rawAtt.modifiers ? rawAtt.modifiers.length : 0;

        if (!baseWeapon) {
            return {
                status: 'UNVERIFIED',
                unverifiedReason: `Compatible weapon data for '${targetWeaponId}' not found`,
                weaponId: targetWeaponId,
                weaponName: weaponDisplayName,
                changes: {},
                rawModifierCount: rawModCount,
                resolvedModifierCount: 0,
                provenance: 'MISSING_WEAPON_BASE'
            };
        }

        // 2. Resolve Modifiers: Override -> Global DB + Raw local overrides
        let activeModule: any = null;
        for (const modKey of Object.keys(this.inGameOverrides)) {
            const mod = this.inGameOverrides[modKey];
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
            const seen = new Set<string>();
            const makeKey = (m: any) => {
                const type = m.type || '';
                const p = (m.indexPath ? m.indexPath.join('.') : m.path || '').toLowerCase();
                const v = typeof m.value === 'object' && m.value !== null ? JSON.stringify(m.value) : String(m.value);
                const idx = m.insertIndex !== undefined ? String(m.insertIndex) : '';
                const vIdx = m.extra?.valueIndex || m.valueIndex || '';
                const iList = JSON.stringify(m.extra?.indexList || m.indexList || '');
                return `${type}|${p}|${v}|${idx}|${vIdx}|${iList}`;
            };

            const globalAtt = this.attDb[rawAtt.name];
            if (globalAtt && globalAtt.attachmentModifiers) {
                provenance = 'VERIFIED_GLOBAL_MODULE + WEAPON_OVERRIDE';
                for (const [mType, list] of Object.entries(globalAtt.attachmentModifiers)) {
                    if (Array.isArray(list)) {
                        for (const item of list as any[]) {
                            const norm: NormalizedModifier = {
                                type: mType,
                                indexPath: item.indexPath,
                                value: item.value,
                                priority: item.priority || 1,
                                insertIndex: item.insertIndex,
                                extra: {
                                    valueIndex: item.valueIndex,
                                    indexList: item.indexList
                                }
                            };
                            const key = makeKey(norm);
                            if (!seen.has(key)) {
                                seen.add(key);
                                resolvedModifiers.push(norm);
                            }
                        }
                    }
                }
            }

            // Append raw local modifiers (prevent duplicate application of modifiers already inherited from global module)
            if (rawAtt.modifiers) {
                for (const m of rawAtt.modifiers) {
                    const norm: NormalizedModifier = {
                        type: m.type,
                        indexPath: m.indexPath,
                        value: m.value,
                        priority: m.priority || 1,
                        insertIndex: m.insertIndex,
                        extra: m.extra
                    };
                    const key = makeKey(norm);
                    if (!seen.has(key)) {
                        seen.add(key);
                        resolvedModifiers.push(norm);
                    }
                }
            }
        }

        const resolvedModCount = resolvedModifiers.length;

        // 3. Inspect if modifiers contain actual gameplay stats or only cosmetic/animation/model properties
        const statModTypes = new Set(['trueMultipliers', 'relativeMultipliers', 'tableTrueMultipliers', 'tableRelativeMultipliers']);
        const hasStatMods = resolvedModifiers.some(m => 
            statModTypes.has(m.type) ||
            (m.indexPath && m.indexPath.some(seg => 
                typeof seg === 'string' && (
                    seg.startsWith('damage') || seg.startsWith('rpm') || seg.startsWith('firerate') ||
                    seg.startsWith('magsize') || seg.startsWith('ammotype') || seg.startsWith('casetype') ||
                    seg.startsWith('multhead') || seg.startsWith('multtorso') || seg.startsWith('recoil') ||
                    seg.startsWith('altreload') || seg.includes('reload') || seg.startsWith('pelletcount') ||
                    seg.startsWith('suppression') || seg.includes('choke') || seg.includes('sway') ||
                    seg.includes('spread') || seg.startsWith('straightpull') || seg.startsWith('hideminimap') ||
                    seg.includes('equiptime') || seg.includes('unequiptime')
                )
            ))
        );

        if (!hasStatMods && resolvedModifiers.length > 0) {
            const paths = resolvedModifiers.map(m => (m.indexPath?.join('.') || '').toLowerCase()).filter(Boolean);
            const hasGameplayInMods = paths.some(p => 
                p.includes('reload') || p.includes('altreload') || p.includes('pellet') || 
                p.includes('choke') || p.includes('suppression') || p.includes('sway') || 
                p.includes('spread') || p.includes('pullbolt') || p.includes('straightpull') ||
                p.includes('hideminimap') || p.includes('equiptime') || p.includes('speed')
            );
            const onlyCosmetic = !hasGameplayInMods && paths.every(p => 
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

        // 4. Compile Modifiers onto Weapon
        const mockAttachment = {
            id: rawAtt.id,
            name: rawAtt.name,
            displayName: rawAtt.displayName,
            slot: rawAtt.slot,
            modifiers: resolvedModifiers
        };

        const beforeWeapon = JSON.parse(JSON.stringify(baseWeapon));
        const compileResult = this.engine.compileModifiers(baseWeapon, [mockAttachment as any]);
        const afterWeapon = compileResult.compiledData;

        // 5. Compute Stat Changes
        const changes: AttachmentStatChanges = {};

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

        // Ballistics & Combat Physics
        if (beforeWeapon.bulletspeed && afterWeapon.bulletspeed && beforeWeapon.bulletspeed !== afterWeapon.bulletspeed) {
            changes.bulletSpeed = { from: Math.round(beforeWeapon.bulletspeed), to: Math.round(afterWeapon.bulletspeed) };
        }
        if (beforeWeapon.penetrationdepth && afterWeapon.penetrationdepth && beforeWeapon.penetrationdepth !== afterWeapon.penetrationdepth) {
            changes.penetration = { from: Math.round(beforeWeapon.penetrationdepth * 10) / 10, to: Math.round(afterWeapon.penetrationdepth * 10) / 10 };
        }
        if (beforeWeapon.suppression !== undefined && afterWeapon.suppression !== undefined && beforeWeapon.suppression !== afterWeapon.suppression) {
            changes.suppression = { from: Math.round(beforeWeapon.suppression * 100) / 100, to: Math.round(afterWeapon.suppression * 100) / 100 };
        }
        if (beforeWeapon.pelletcount !== undefined && afterWeapon.pelletcount !== undefined && beforeWeapon.pelletcount !== afterWeapon.pelletcount) {
            changes.pelletCount = { from: beforeWeapon.pelletcount, to: afterWeapon.pelletcount };
        }

        // Handling & Mobility (Weight / Movement Penalties)
        if (beforeWeapon.walkspeed && afterWeapon.walkspeed && beforeWeapon.walkspeed !== afterWeapon.walkspeed) {
            changes.walkSpeed = { from: Math.round(beforeWeapon.walkspeed * 10) / 10, to: Math.round(afterWeapon.walkspeed * 10) / 10 };
        }
        if (beforeWeapon.aimspeed && afterWeapon.aimspeed && beforeWeapon.aimspeed !== afterWeapon.aimspeed) {
            changes.aimSpeed = { from: Math.round(beforeWeapon.aimspeed * 10) / 10, to: Math.round(afterWeapon.aimspeed * 10) / 10 };
        }
        if (beforeWeapon.equipspeed && afterWeapon.equipspeed && beforeWeapon.equipspeed !== afterWeapon.equipspeed) {
            changes.equipSpeed = { from: Math.round(beforeWeapon.equipspeed * 10) / 10, to: Math.round(afterWeapon.equipspeed * 10) / 10 };
        }
        if (beforeWeapon.equiptime !== undefined && afterWeapon.equiptime !== undefined && beforeWeapon.equiptime !== afterWeapon.equiptime) {
            changes.equipTime = { from: Math.round(beforeWeapon.equiptime * 100) / 100, to: Math.round(afterWeapon.equiptime * 100) / 100 };
        }
        if (beforeWeapon.unequiptime !== undefined && afterWeapon.unequiptime !== undefined && beforeWeapon.unequiptime !== afterWeapon.unequiptime) {
            changes.unequipTime = { from: Math.round(beforeWeapon.unequiptime * 100) / 100, to: Math.round(afterWeapon.unequiptime * 100) / 100 };
        }
        if (beforeWeapon.sprintspeed && afterWeapon.sprintspeed && beforeWeapon.sprintspeed !== afterWeapon.sprintspeed) {
            changes.sprintSpeed = { from: Math.round(beforeWeapon.sprintspeed * 10) / 10, to: Math.round(afterWeapon.sprintspeed * 10) / 10 };
        }
        if (beforeWeapon.aimwalkspeedmult && afterWeapon.aimwalkspeedmult && beforeWeapon.aimwalkspeedmult !== afterWeapon.aimwalkspeedmult) {
            changes.aimWalkSpeed = { from: Math.round(beforeWeapon.aimwalkspeedmult * 100) / 100, to: Math.round(afterWeapon.aimwalkspeedmult * 100) / 100 };
        }

        // Accuracy, Spread & Sway
        const bChoke = beforeWeapon.aimchoke ?? beforeWeapon.hipchoke ?? beforeWeapon.choke;
        const aChoke = afterWeapon.aimchoke ?? afterWeapon.hipchoke ?? afterWeapon.choke;
        if (bChoke !== undefined && aChoke !== undefined && bChoke !== aChoke) {
            changes.choke = { from: Math.round(bChoke * 100) / 100, to: Math.round(aChoke * 100) / 100 };
        }
        if (beforeWeapon.hipfirespread !== undefined && afterWeapon.hipfirespread !== undefined && beforeWeapon.hipfirespread !== afterWeapon.hipfirespread) {
            changes.hipfireSpread = { from: Math.round(beforeWeapon.hipfirespread * 100) / 100, to: Math.round(afterWeapon.hipfirespread * 100) / 100 };
        }

        const swayMods = resolvedModifiers.filter(m => {
            const p = (m.indexPath ? m.indexPath.join('.') : '').toLowerCase();
            return p.includes('sway') || p.includes('steady') || p.includes('breath') || p.includes('recover') || p.includes('stability') || p.includes('swing');
        });
        if (swayMods.length > 0) {
            const multValues = swayMods.map(m => m.value).filter(v => typeof v === 'number');
            const minMult = multValues.length ? Math.min(...multValues) : 1;
            const maxMult = multValues.length ? Math.max(...multValues) : 1;
            changes.swaySummary = `${swayMods.length} sway/steadiness parameters modified (factor range: ${minMult}x ~ ${maxMult}x)`;
        }

        // Special Combat Mechanics
        const specials: string[] = [];
        if (afterWeapon.hideminimap === true || resolvedModifiers.some(m => m.indexPath?.[0] === 'hideminimap' && m.value === true)) {
            specials.push('Radar Stealth (hideminimap)');
        }
        if (afterWeapon.straightpull === true || resolvedModifiers.some(m => m.indexPath?.[0] === 'straightpull' && m.value === true)) {
            specials.push('Straight Pull Bolt (ADS cycling)');
        }
        if (afterWeapon.burstlock === true || resolvedModifiers.some(m => m.indexPath?.[0] === 'burstlock' && m.value === true)) {
            specials.push('Burst Lock');
        }
        if (afterWeapon.tracerless === true || resolvedModifiers.some(m => m.indexPath?.[0] === 'tracerless' && m.value === true)) {
            specials.push('Tracerless Ammunition');
        }
        if (afterWeapon.restrictedads === true || resolvedModifiers.some(m => m.indexPath?.[0] === 'restrictedads' && m.value === true)) {
            specials.push('ADS Disabled (Hipfire Only)');
        }
        if (afterWeapon.caselessammo === true || resolvedModifiers.some(m => m.indexPath?.[0] === 'caselessammo' && m.value === true)) {
            specials.push('Caseless Ammunition');
        }
        if (afterWeapon.hasnoscopebonus === true || resolvedModifiers.some(m => m.indexPath?.[0] === 'hasnoscopebonus' && m.value === true)) {
            specials.push('No-Scope Bonus');
        }
        if (afterWeapon.variablefirerate === true || resolvedModifiers.some(m => m.indexPath?.[0] === 'variablefirerate' && m.value === true)) {
            specials.push('Variable Firerate');
        }
        if (afterWeapon.heatfireratecap !== undefined || resolvedModifiers.some(m => String(m.indexPath?.[0] || '').startsWith('heatfirerate'))) {
            specials.push('Heat-based Firerate Dynamics');
        }
        if (afterWeapon.doubleactiondelay !== undefined || resolvedModifiers.some(m => m.indexPath?.[0] === 'doubleactiondelay')) {
            specials.push('Double-Action Trigger Delay');
        }
        if (afterWeapon.bulletaccel !== undefined || resolvedModifiers.some(m => m.indexPath?.[0] === 'bulletaccel')) {
            specials.push('Bullet Acceleration (Rocket/Gyrojet)');
        }
        if (specials.length > 0) {
            changes.specialMechanics = specials;
        }

        // Recoil Summary
        const recoilMods = resolvedModifiers.filter(m => m.indexPath && m.indexPath[0] === 'recoil');
        if (recoilMods.length > 0) {
            const multValues = recoilMods.map(m => m.value).filter(v => typeof v === 'number');
            const minMult = multValues.length ? Math.min(...multValues) : 1;
            const maxMult = multValues.length ? Math.max(...multValues) : 1;
            changes.recoilSummary = `${recoilMods.length} recoil parameters modified (factor range: ${minMult}x ~ ${maxMult}x)`;
        }

        // 6. Reload Effects Resolution
        let reloadEffects: ReloadEffects | undefined = undefined;
        let standardTimescale: ReloadMultiplierDetail | undefined = undefined;
        let standardResettime: ReloadMultiplierDetail | undefined = undefined;
        let tacticalTimescale: ReloadMultiplierDetail | undefined = undefined;
        let tacticalResettime: ReloadMultiplierDetail | undefined = undefined;
        const animationModsList: ReloadStageDetail[] = [];
        let seqReload: ReloadSequenceDetail | undefined = undefined;
        let seqReloadLong: ReloadSequenceDetail | undefined = undefined;
        const specialReloadList: Array<{ name: string; value: any }> = [];
        const reloadSummary: string[] = [];

        for (const m of resolvedModifiers) {
            const rawPath = (m.indexPath ? m.indexPath.join('.') : '').toLowerCase();

            // 1. Time multipliers (standard / tactical / shotgun tube)
            if (rawPath === 'animations.reload.timescale' || rawPath === 'animations.tubereload.timescale') {
                const val = typeof m.value === 'number' ? m.value : parseFloat(m.value);
                if (!isNaN(val)) {
                    const pct = Math.round((val - 1.0) * 100);
                    const sign = pct > 0 ? `+${pct}%` : `${pct}%`;
                    standardTimescale = { from: 1.0, to: val, timeFactor: val, deltaPercent: sign };
                    reloadSummary.push(`Standard Reload Time ×${val} (${sign} reload time)`);
                }
            } else if (rawPath === 'animations.reload.resettime' || rawPath === 'animations.tubereload.resettime') {
                const val = typeof m.value === 'number' ? m.value : parseFloat(m.value);
                if (!isNaN(val)) {
                    const pct = Math.round((val - 1.0) * 100);
                    const sign = pct > 0 ? `+${pct}%` : `${pct}%`;
                    standardResettime = { from: 1.0, to: val, timeFactor: val, deltaPercent: sign };
                }
            } else if (rawPath === 'animations.tacticalreload.timescale' || rawPath === 'animations.tubetacticalreload.timescale') {
                const val = typeof m.value === 'number' ? m.value : parseFloat(m.value);
                if (!isNaN(val)) {
                    const pct = Math.round((val - 1.0) * 100);
                    const sign = pct > 0 ? `+${pct}%` : `${pct}%`;
                    tacticalTimescale = { from: 1.0, to: val, timeFactor: val, deltaPercent: sign };
                    reloadSummary.push(`Tactical Reload Time ×${val} (${sign} reload time)`);
                }
            } else if (rawPath === 'animations.tacticalreload.resettime' || rawPath === 'animations.tubetacticalreload.resettime') {
                const val = typeof m.value === 'number' ? m.value : parseFloat(m.value);
                if (!isNaN(val)) {
                    const pct = Math.round((val - 1.0) * 100);
                    const sign = pct > 0 ? `+${pct}%` : `${pct}%`;
                    tacticalResettime = { from: 1.0, to: val, timeFactor: val, deltaPercent: sign };
                }
            }

            // 2. Animation-specific reload stage modifiers
            else if (rawPath === 'animationmods' && typeof m.value === 'object' && m.value !== null) {
                for (const [stageKey, stageVal] of Object.entries(m.value as Record<string, any>)) {
                    const sLower = stageKey.toLowerCase();
                    if (sLower.includes('reload') || sLower.includes('stage') || sLower.includes('bolt')) {
                        const ts = typeof stageVal?.timescale === 'number' ? stageVal.timescale : undefined;
                        const rt = typeof stageVal?.resettime === 'number' ? stageVal.resettime : undefined;
                        if (ts !== undefined || rt !== undefined) {
                            animationModsList.push({ stage: stageKey, timescale: ts, resettime: rt });
                            let stageDesc = `${stageKey}: `;
                            if (ts !== undefined) stageDesc += `Timescale ×${ts}`;
                            if (rt !== undefined) stageDesc += `${ts !== undefined ? ', ' : ''}Reset Time ×${rt}`;
                            reloadSummary.push(stageDesc);
                        }
                    }
                }
            } else if (rawPath.startsWith('animationmods.')) {
                const parts = (m.indexPath || []).map(String);
                const stageKey = parts[1];
                const prop = parts[2] || '';
                const sLower = (stageKey || '').toLowerCase();
                if (sLower.includes('reload') || sLower.includes('stage') || sLower.includes('bolt')) {
                    let entry = animationModsList.find(e => e.stage === stageKey);
                    if (!entry) {
                        entry = { stage: stageKey };
                        animationModsList.push(entry);
                    }
                    if (prop.toLowerCase() === 'timescale' && typeof m.value === 'number') entry.timescale = m.value;
                    if (prop.toLowerCase() === 'resettime' && typeof m.value === 'number') entry.resettime = m.value;
                }
            }

            // 3. Alternative reload sequence (altreload, altreloadlong)
            else if (rawPath === 'altreload' || rawPath === 'altreload,altreloadlong') {
                const fromVal = baseWeapon.altreload || 'Default';
                const toVal = String(m.value);
                seqReload = { from: fromVal, to: toVal, note: 'Sequence-specific' };
                reloadSummary.push(`Reload Sequence: ${fromVal} → ${toVal} (Sequence-specific)`);
                if (rawPath === 'altreload,altreloadlong') {
                    const fromLongVal = baseWeapon.altreloadlong || 'Default';
                    seqReloadLong = { from: fromLongVal, to: toVal, note: 'Sequence-specific' };
                    reloadSummary.push(`Long Reload Sequence: ${fromLongVal} → ${toVal} (Sequence-specific)`);
                }
            } else if (rawPath === 'altreloadlong') {
                const fromVal = baseWeapon.altreloadlong || 'Default';
                const toVal = String(m.value);
                seqReloadLong = { from: fromVal, to: toVal, note: 'Sequence-specific' };
                reloadSummary.push(`Long Reload Sequence: ${fromVal} → ${toVal} (Sequence-specific)`);
            } else if (rawPath === 'forcereload' || rawPath === 'uniquereload') {
                specialReloadList.push({ name: rawPath, value: m.value });
                reloadSummary.push(`${rawPath}: ${m.value}`);
            }
        }

        const hasReloadEffects = Boolean(
            standardTimescale || standardResettime ||
            tacticalTimescale || tacticalResettime ||
            animationModsList.length > 0 ||
            seqReload || seqReloadLong ||
            specialReloadList.length > 0
        );

        if (hasReloadEffects) {
            reloadEffects = {
                hasReloadEffects: true,
                standard: (standardTimescale || standardResettime) ? {
                    timescale: standardTimescale,
                    resettime: standardResettime
                } : undefined,
                tactical: (tacticalTimescale || tacticalResettime) ? {
                    timescale: tacticalTimescale,
                    resettime: tacticalResettime
                } : undefined,
                animationMods: animationModsList.length > 0 ? animationModsList : undefined,
                alternativeSequence: (seqReload || seqReloadLong) ? {
                    reload: seqReload,
                    reloadLong: seqReloadLong
                } : undefined,
                special: specialReloadList.length > 0 ? specialReloadList : undefined,
                summary: reloadSummary
            };
            changes.reloadEffects = reloadEffects;
        }

        const profile = this.buildPerformanceProfile(
            rawAtt,
            targetWeaponId,
            weaponDisplayName,
            changes,
            resolvedModifiers
        );

        return {
            status: 'RESOLVED',
            weaponId: targetWeaponId,
            weaponName: weaponDisplayName,
            changes,
            reloadEffects,
            profile,
            rawModifierCount: rawModCount,
            resolvedModifierCount: resolvedModCount,
            provenance
        };
    }

    public buildPerformanceProfile(
        rawAtt: any,
        weaponId?: string,
        weaponName?: string,
        changes?: AttachmentStatChanges,
        resolvedModifiers?: NormalizedModifier[],
        existingRecoilContext?: boolean | 'unknown' | null
    ): AttachmentPerformanceProfile {
        const effChanges = changes || {};
        const mods = resolvedModifiers || rawAtt.modifiers || [];
        const rawSlot = (rawAtt.slot || '').toLowerCase();

        // 1. Contexts identification
        const isAmmo = rawSlot === 'ammo' || !!effChanges.ammoType;
        const isOptic = ['optic', 'optics', 'sight'].includes(rawSlot) ||
            mods.some((m: any) => {
                const p = String(m.indexPath ? m.indexPath[0] : '').toLowerCase();
                return p === 'zoom' || p === 'sight' || p === 'altaimdata';
            });
        const isHandling = !!(
            effChanges.aimSpeed || effChanges.equipSpeed || effChanges.equipTime ||
            effChanges.unequipTime || effChanges.walkSpeed || effChanges.sprintSpeed ||
            effChanges.aimWalkSpeed || effChanges.swaySummary
        );
        const isMagazine = !!(
            effChanges.magSize !== undefined || effChanges.reserveAmmo !== undefined ||
            effChanges.reloadEffects?.hasReloadEffects
        );
        const recoilMods = mods.filter((m: any) => m.indexPath && m.indexPath[0] === 'recoil');
        const isRecoil = recoilMods.length > 0 || !!effChanges.recoilSummary;

        // Fire-Control Context (Behavioral alteration of firing mechanism)
        const specials = effChanges.specialMechanics || [];
        const hasFireModesChanged = Boolean(effChanges.fireModes);
        const hasBurstLock = specials.includes('Burst Lock') || mods.some((m: any) => (m.path || (m.indexPath ? m.indexPath.join('.') : '')).toLowerCase() === 'burstlock');
        const hasBinary = (effChanges.fireModes && JSON.stringify(effChanges.fireModes).includes('BINARY')) || (rawAtt.name || '').toLowerCase().includes('binary') || (rawAtt.name || '').toLowerCase().includes('duplex');
        const hasVariableFireRate = specials.includes('Variable Firerate') || mods.some((m: any) => (m.path || (m.indexPath ? m.indexPath.join('.') : '')).toLowerCase() === 'variablefirerate');
        const hasHeatFireRateMechanics = mods.some((m: any) => {
            const p = (m.path || (m.indexPath ? m.indexPath.join('.') : '')).toLowerCase();
            return (m.type === 'setters' && p.startsWith('heatfirerate')) || p === 'heatfirerateignorelist' || p === 'heatfireratekick';
        });
        const hasTriggerDelay = specials.includes('Double-Action Trigger Delay') || mods.some((m: any) => (m.path || (m.indexPath ? m.indexPath.join('.') : '')).toLowerCase().includes('doubleaction'));
        const hasBurstFireRate = mods.some((m: any) => (m.path || (m.indexPath ? m.indexPath.join('.') : '')).toLowerCase() === 'burstfirerate');

        const isFireControl = hasFireModesChanged || hasBurstLock || hasBinary || hasVariableFireRate || hasHeatFireRateMechanics || hasTriggerDelay || hasBurstFireRate;

        const fireControlMechanics: string[] = [];
        if (hasFireModesChanged && effChanges.fireModes) {
            const fromStr = Array.isArray(effChanges.fireModes.from) ? effChanges.fireModes.from.map((m: any) => m === true ? 'Auto' : (m === 1 ? 'Semi' : m)).join('/') : String(effChanges.fireModes.from);
            const toStr = Array.isArray(effChanges.fireModes.to) ? effChanges.fireModes.to.map((m: any) => m === true ? 'Auto' : (m === 1 ? 'Semi' : m)).join('/') : String(effChanges.fireModes.to);
            fireControlMechanics.push(`Firemodes: ${fromStr} → ${toStr}`);
        }
        if (hasBurstLock) fireControlMechanics.push('Burst Lock');
        if (hasBinary) fireControlMechanics.push('Binary Trigger');
        if (hasVariableFireRate) fireControlMechanics.push('Variable Firerate');
        if (hasHeatFireRateMechanics) fireControlMechanics.push('Heat-based Firerate Dynamics');
        if (hasTriggerDelay) fireControlMechanics.push('Double-Action Trigger Delay');
        if (hasBurstFireRate) fireControlMechanics.push('Burst Firerate');

        const contexts: PerformanceContexts = {
            ammo: isAmmo,
            optic: isOptic,
            handling: isHandling,
            magazine: isMagazine,
            recoilModifying: isRecoil,
            fireControl: isFireControl
        };

        // 2. Core Architecture:
        // Ammo = Independent Ammunition / Weapon Baseline (Excluded from general classifier)
        // Non-Ammo Attachment = Applied on Existing Weapon Baseline (isPerformanceBaseline = false)
        const isAmmoBaseline = isAmmo;
        const isPerformanceBaseline = isAmmoBaseline;
        const baselineLabel = isAmmoBaseline ? 'Ammo Baseline' : 'Existing Weapon Baseline';
        const baselineType: 'AMMO_BASELINE' | 'CALIBER_CONVERSION' | 'NONE' = isAmmoBaseline
            ? (effChanges.ammoType || (rawAtt.name || '').toLowerCase().includes('conversion') || (rawAtt.name || '').toLowerCase().includes('conv') ? 'CALIBER_CONVERSION' : 'AMMO_BASELINE')
            : 'NONE';
        const baselineReason = isAmmoBaseline
            ? (effChanges.ammoType
                ? `Caliber conversion (${effChanges.ammoType.from} → ${effChanges.ammoType.to}) establishes independent ammunition baseline`
                : 'Ammunition slot forms an independent baseline profile')
            : undefined;

        // 3. Recoil simulation metadata:
        // For Ammo: not evaluated by general attachment classifier (handled as its own baseline) -> null
        // For Optic: existing weapon baseline, does not alter weapon recoil mechanics -> false
        // For General Attachments: evaluated for recoil simulation context
        const recoilContext = isAmmoBaseline
            ? null
            : (existingRecoilContext !== undefined ? existingRecoilContext : (isOptic || recoilMods.length === 0 ? false : null));

        // 4. Recommendation Features Extraction
        const parseDmg = (dmgStr?: string) => {
            if (!dmgStr) return undefined;
            const parts = dmgStr.split('→').map(s => parseFloat(s.trim()));
            return (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) ? { close: parts[0], far: parts[1] } : undefined;
        };
        const bDmg = parseDmg(effChanges.damage?.from);
        const aDmg = parseDmg(effChanges.damage?.to);
        const damageDelta = (bDmg && aDmg) ? {
            close: Math.round((aDmg.close - bDmg.close) * 10) / 10,
            far: Math.round((aDmg.far - bDmg.far) * 10) / 10
        } : undefined;

        const parseRpm = (rpmStr?: string) => {
            if (!rpmStr) return undefined;
            const val = parseFloat(rpmStr.trim());
            return isNaN(val) ? undefined : val;
        };
        const bRpm = parseRpm(effChanges.rpm?.from);
        const aRpm = parseRpm(effChanges.rpm?.to);
        const rpmDelta = (bRpm !== undefined && aRpm !== undefined) ? Math.round(aRpm - bRpm) : undefined;

        const multValues = recoilMods.map((m: any) => m.value).filter((v: any) => typeof v === 'number');
        const zoomMod = mods.find((m: any) => m.indexPath?.[0] === 'zoom');
        const altAimMod = mods.find((m: any) => m.indexPath?.[0] === 'altaimdata');

        const recommendationFeatures: RecommendationFeatures = {
            damageDelta,
            rpmDelta,
            headMultiplierDelta: (effChanges.multHead && effChanges.multHead.to !== undefined && effChanges.multHead.from !== undefined)
                ? Math.round((effChanges.multHead.to - effChanges.multHead.from) * 100) / 100 : undefined,
            torsoMultiplierDelta: (effChanges.multTorso && effChanges.multTorso.to !== undefined && effChanges.multTorso.from !== undefined)
                ? Math.round((effChanges.multTorso.to - effChanges.multTorso.from) * 100) / 100 : undefined,
            bulletSpeedDelta: (effChanges.bulletSpeed && effChanges.bulletSpeed.to !== undefined && effChanges.bulletSpeed.from !== undefined)
                ? Math.round(effChanges.bulletSpeed.to - effChanges.bulletSpeed.from) : undefined,
            penetrationDelta: (effChanges.penetration && effChanges.penetration.to !== undefined && effChanges.penetration.from !== undefined)
                ? Math.round((effChanges.penetration.to - effChanges.penetration.from) * 10) / 10 : undefined,
            suppressionDelta: (effChanges.suppression && effChanges.suppression.to !== undefined && effChanges.suppression.from !== undefined)
                ? Math.round((effChanges.suppression.to - effChanges.suppression.from) * 100) / 100 : undefined,
            pelletCountDelta: (effChanges.pelletCount && effChanges.pelletCount.to !== undefined && effChanges.pelletCount.from !== undefined)
                ? (effChanges.pelletCount.to - effChanges.pelletCount.from) : undefined,
            walkSpeedDelta: (effChanges.walkSpeed && effChanges.walkSpeed.to !== undefined && effChanges.walkSpeed.from !== undefined)
                ? Math.round((effChanges.walkSpeed.to - effChanges.walkSpeed.from) * 10) / 10 : undefined,
            sprintSpeedDelta: (effChanges.sprintSpeed && effChanges.sprintSpeed.to !== undefined && effChanges.sprintSpeed.from !== undefined)
                ? Math.round((effChanges.sprintSpeed.to - effChanges.sprintSpeed.from) * 10) / 10 : undefined,
            aimWalkSpeedDelta: (effChanges.aimWalkSpeed && effChanges.aimWalkSpeed.to !== undefined && effChanges.aimWalkSpeed.from !== undefined)
                ? Math.round((effChanges.aimWalkSpeed.to - effChanges.aimWalkSpeed.from) * 100) / 100 : undefined,
            aimSpeedDelta: (effChanges.aimSpeed && effChanges.aimSpeed.to !== undefined && effChanges.aimSpeed.from !== undefined)
                ? Math.round((effChanges.aimSpeed.to - effChanges.aimSpeed.from) * 10) / 10 : undefined,
            equipSpeedDelta: (effChanges.equipSpeed && effChanges.equipSpeed.to !== undefined && effChanges.equipSpeed.from !== undefined)
                ? Math.round((effChanges.equipSpeed.to - effChanges.equipSpeed.from) * 10) / 10 : undefined,
            equipTimeDelta: (effChanges.equipTime && effChanges.equipTime.to !== undefined && effChanges.equipTime.from !== undefined)
                ? Math.round((effChanges.equipTime.to - effChanges.equipTime.from) * 100) / 100 : undefined,
            unequipTimeDelta: (effChanges.unequipTime && effChanges.unequipTime.to !== undefined && effChanges.unequipTime.from !== undefined)
                ? Math.round((effChanges.unequipTime.to - effChanges.unequipTime.from) * 100) / 100 : undefined,
            magSizeDelta: (effChanges.magSize && effChanges.magSize.to !== undefined && effChanges.magSize.from !== undefined)
                ? (effChanges.magSize.to - effChanges.magSize.from) : undefined,
            reserveAmmoDelta: (effChanges.reserveAmmo && effChanges.reserveAmmo.to !== undefined && effChanges.reserveAmmo.from !== undefined)
                ? (effChanges.reserveAmmo.to - effChanges.reserveAmmo.from) : undefined,
            reloadSpeedMultiplier: effChanges.reloadEffects?.standard?.timescale?.timeFactor,
            reloadSequenceChanged: Boolean(effChanges.reloadEffects?.alternativeSequence),
            recoilFactorMin: multValues.length ? Math.min(...multValues) : undefined,
            recoilFactorMax: multValues.length ? Math.max(...multValues) : undefined,
            recoilParamCount: recoilMods.length,
            hipfireSpreadDelta: (effChanges.hipfireSpread && effChanges.hipfireSpread.to !== undefined && effChanges.hipfireSpread.from !== undefined)
                ? Math.round((effChanges.hipfireSpread.to - effChanges.hipfireSpread.from) * 100) / 100 : undefined,
            chokeDelta: (effChanges.choke && effChanges.choke.to !== undefined && effChanges.choke.from !== undefined)
                ? Math.round((effChanges.choke.to - effChanges.choke.from) * 100) / 100 : undefined,
            swayModified: Boolean(effChanges.swaySummary),
            zoom: zoomMod ? (typeof zoomMod.value === 'number' ? zoomMod.value : parseFloat(zoomMod.value)) : undefined,
            hasAltAim: Boolean(altAimMod),
            ammoConversion: Boolean(effChanges.ammoType),
            fireModesChanged: Boolean(effChanges.fireModes),
            fireControlChanged: isFireControl,
            fireControlMechanics: fireControlMechanics.length > 0 ? fireControlMechanics : undefined,
            specialMechanics: effChanges.specialMechanics || []
        };

        return {
            attachmentId: rawAtt.id,
            attachmentName: rawAtt.name || rawAtt.displayName || rawAtt.id,
            slot: rawAtt.slot || 'Other',
            targetWeaponId: weaponId || '',
            targetWeaponName: weaponName || weaponId || '',
            isAmmoBaseline,
            isPerformanceBaseline,
            baselineLabel,
            baselineType,
            baselineReason,
            contexts,
            effects: effChanges,
            recoilContext,
            recoilModCount: recoilMods.length,
            recommendationFeatures
        };
    }
}
