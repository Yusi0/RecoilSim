/**
 * Stats for the pf-archive `:::compare` block. Pure functions: scripts/export_compare_stats.ts does the file IO.
 *
 * A weapon is reduced to the numbers a comparison table needs. An ammo conversion / attachment is not
 * stored as a full copy: it is compiled with the game's own modifier engine (WeaponCompiler) and only the
 * stats it changes are kept (`delta`), so a variant file stays small.
 */
import { WeaponCompiler } from '../core/compiler/WeaponCompiler';
import type { NormalizedAttachment, NormalizedWeapon } from '../core/data';

export interface DamagePoint {
    distance: number;
    damage: number;
}

export type ReloadKind = 'mag' | 'shotgun' | 'staged' | 'none';

export interface ReloadInfo {
    kind: ReloadKind;
    /** seconds, only for magazine-fed weapons (kind 'mag') */
    tactical: number | null;
    full: number | null;
}

export interface CompareStats {
    damageGraph: DamagePoint[];
    multhead: number | null;
    multtorso: number | null;
    /** rpm of the first fire mode */
    rpm: number | null;
    /** distinct rpm values when the weapon has several modes (e.g. [700, 1000]) */
    rpmModes: number[];
    magsize: number | null;
    chamber: boolean;
    sparerounds: number | null;
    pellets: number | null;
    bulletspeed: number | null;
    penetration: number | null;
    suppression: number | null;
    walkspeed: number | null;
    aimwalkspeed: number | null;
    aimspeed: number | null;
    sprintspeed: number | null;
    equipspeed: number | null;
    reload: ReloadInfo;
    /** multiplier on every recoil impulse (1 = unchanged); null when an attachment scales them unevenly */
    recoilScale: number | null;
}

export interface WeaponRecord {
    id: string;
    name: string;
    gameName: string;
    category: string;
    status: { base: string; mobility: string };
    stats: CompareStats;
}

export interface VariantRecord {
    id: string;
    name: string;
    gameName: string;
    slot: string;
    info: string;
    /** only the stats that differ from the base weapon */
    delta: Partial<CompareStats>;
}

/** Shotguns whose reload was checked against known in-game values (AA-12: 2.40 s / 3.06 s). */
const MAG_FED_SHOTGUNS = new Set(['aa_12']);

const round = (value: number, digits = 2): number => {
    const f = 10 ** digits;
    return Math.round(value * f) / f;
};

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? round(value, 3) : null);

/** Upper-case letters and digits only: "VZ. 808" and "VZ.808" both become "VZ808". */
export function normalizeName(text: string): string {
    return String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeGraph(detail: any): DamagePoint[] {
    let points: DamagePoint[] = Array.isArray(detail.damageGraph)
        ? detail.damageGraph
              .filter((p: any) => typeof p?.damage === 'number' && typeof p?.distance === 'number')
              .map((p: any) => ({ distance: round(p.distance), damage: round(p.damage) }))
        : [];
    if (!points.length && typeof detail.damage0 === 'number') {
        points = [
            { distance: 0, damage: detail.damage0 },
            { distance: detail.range0 ?? 0, damage: detail.damage0 },
            { distance: detail.range1 ?? detail.range0 ?? 0, damage: detail.damage1 ?? detail.damage0 },
        ].map((p) => ({ distance: round(p.distance), damage: round(p.damage) }));
    }
    points.sort((a, b) => a.distance - b.distance);
    if (points.length && points[0].distance > 0) points.unshift({ distance: 0, damage: points[0].damage });
    return points;
}

export function animationSeconds(animation: any): number | null {
    const steps: any[] = animation?.a ?? [];
    if (!steps.some((s) => typeof s?.d?.delay === 'number')) return null;
    const total = steps.reduce((sum, s) => sum + (typeof s?.d?.delay === 'number' ? s.d.delay : 0), 0);
    const timescale = typeof animation.d?.timescale === 'number' ? animation.d.timescale : 0.5;
    const resettime = typeof animation.d?.resettime === 'number' ? animation.d.resettime : 0.5;
    return round(total * timescale + resettime, 3);
}

/**
 * Reload time as the game's loadout menu shows it: sum(step delay) * timescale + resettime
 * (checked against AA-12, KS-23M, AK-12/76 and TERMINATOR 12G). Only magazine-fed weapons are computed:
 * staged weapons (HENRY 45-70, bolt actions, revolvers) and tube shotguns reload shell by shell, and the
 * menu value is not their real reload time, so they are left out instead of showing a misleading number.
 */
export function reloadInfo(detail: any, id: string): ReloadInfo {
    const animations = detail.animations ?? {};
    if (animations.reloadstage?.a?.length) return { kind: 'staged', tactical: null, full: null };

    const isShotgun = /SHOTGUN/i.test(String(detail.type ?? '')) || /SHOTGUN/i.test(String(detail.category ?? ''));
    if (isShotgun && !MAG_FED_SHOTGUNS.has(id)) return { kind: 'shotgun', tactical: null, full: null };

    const tactical = animationSeconds(animations.tacticalreload);
    const full = animationSeconds(animations.reload);
    if (tactical === null && full === null) return { kind: 'none', tactical: null, full: null };
    return { kind: 'mag', tactical, full };
}

function fireRates(detail: any): { rpm: number | null; modes: number[] } {
    const raw = detail.firerate ?? detail.rpm;
    const list: number[] = (Array.isArray(raw) ? raw : [raw]).filter((v) => typeof v === 'number' && v > 0);
    if (!list.length) return { rpm: null, modes: [] };
    return { rpm: list[0], modes: [...new Set(list)] };
}

/** Every recoil impulse multiplier an attachment declares; one shared value means a plain "+25% recoil". */
export function recoilScale(modifiers: Array<{ type: string; indexPath: Array<string | number>; value?: any }> = []): number | null {
    const values = modifiers
        .filter((m) => m.type === 'trueMultipliers' && m.indexPath[0] === 'recoil' && m.indexPath.length === 5 && m.indexPath[4] === 3)
        .map((m) => m.value)
        .filter((v) => typeof v === 'number');
    if (!values.length) return 1;
    const first = values[0];
    return values.every((v) => Math.abs(v - first) < 1e-9) ? round(first, 3) : null;
}

export function buildStats(detail: any, id: string, scale: number | null = 1): CompareStats {
    const rates = fireRates(detail);
    const walk = num(detail.walkspeed);
    const aimMult = num(detail.aimwalkspeedmult);
    return {
        damageGraph: normalizeGraph(detail),
        multhead: num(detail.multhead),
        multtorso: num(detail.multtorso),
        rpm: rates.rpm,
        rpmModes: rates.modes,
        magsize: num(detail.magsize),
        chamber: Boolean(detail.chamber),
        sparerounds: num(detail.sparerounds),
        pellets: num(detail.pelletcount),
        bulletspeed: num(detail.bulletspeed),
        penetration: num(detail.penetrationdepth),
        suppression: num(detail.suppression),
        walkspeed: walk,
        aimwalkspeed: walk !== null && aimMult !== null ? round(walk * aimMult, 2) : null,
        aimspeed: num(detail.aimspeed),
        sprintspeed: num(detail.sprintspeed),
        equipspeed: num(detail.equipspeed),
        reload: reloadInfo(detail, id),
        recoilScale: scale,
    };
}

export function weaponRecord(entry: any, detail: any): WeaponRecord {
    const provenance = detail._provenance ?? {};
    return {
        id: entry.id,
        name: entry.displayName || entry.name || entry.id,
        gameName: entry.name || entry.id,
        category: entry.category || detail.category || '',
        status: { base: provenance.base_stats ?? 'UNKNOWN', mobility: provenance.mobility_stats ?? 'UNKNOWN' },
        stats: buildStats(detail, entry.id),
    };
}

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function diffStats(base: CompareStats, next: CompareStats): Partial<CompareStats> {
    const delta: Record<string, unknown> = {};
    for (const key of Object.keys(next) as Array<keyof CompareStats>) {
        if (!deepEqual(base[key], next[key])) delta[key] = next[key];
    }
    return delta as Partial<CompareStats>;
}

/** Compiles every attachment of the given slots on one weapon and keeps what changes. */
export function compileVariants(
    entry: any,
    detail: any,
    attachments: Record<string, any>,
    slots: string[],
    compiler = new WeaponCompiler(),
): VariantRecord[] {
    const base = buildStats(detail, entry.id);
    const out: VariantRecord[] = [];
    const seen = new Set<string>();

    for (const slot of slots) {
        for (const attachmentId of entry.attachmentSlots?.[slot] ?? []) {
            const attachment = attachments[attachmentId];
            if (!attachment) continue;

            const key = normalizeName(attachment.displayName || attachment.name);
            if (seen.has(`${slot}:${key}`)) continue; // two variants with one name would be unreachable from a post
            seen.add(`${slot}:${key}`);

            const weapon = { ...entry, attachmentSlots: { [slot]: [attachmentId] } } as NormalizedWeapon;
            const map = new Map<string, NormalizedAttachment>([[attachmentId, attachment as NormalizedAttachment]]);
            const result = compiler.compileWeapon(weapon, { [slot]: attachment.name }, map, detail);

            const stats = buildStats(result.compiledWeaponData, entry.id, recoilScale(attachment.modifiers));
            const delta = diffStats(base, stats);
            out.push({
                id: attachmentId,
                name: attachment.displayName || attachment.name,
                gameName: attachment.name,
                slot,
                info: String(attachment.info ?? ''),
                delta,
            });
        }
    }
    return out;
}
