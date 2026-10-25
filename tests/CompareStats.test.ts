import fs from 'fs';
import path from 'path';
import { animationSeconds, buildStats, compileVariants, normalizeName, reloadInfo, weaponRecord } from '../src/export/compareStats';

/**
 * Stats behind the pf-archive `:::compare` block. Numbers are tied to values checked against the game:
 *  - reload time: known 11.16 / retail menu values (AA-12 2.40 s / 3.06 s, KS-23M 1.14 s, AK-12/76 2.79 s / 3.69 s,
 *    TERMINATOR 12G 1.61 s)
 *  - UAR A3 ammo conversions: the 7.62x39mm and .300 BLK numbers players quote (37->24, 36->19, 45->125 studs ...)
 */
const root = path.join(__dirname, '..');
const canonical = (v: string, file: string) => JSON.parse(fs.readFileSync(path.join(root, 'data/canonical', v, file), 'utf8'));
const detail16 = (id: string) => canonical('11.16', `weapon_details/${id}.json`);

describe('normalizeName', () => {
    it('ignores case, spaces and punctuation', () => {
        expect(normalizeName('VZ. 808')).toBe(normalizeName('vz.808'));
        expect(normalizeName('AK-12/76')).toBe('AK1276');
    });
});

describe('reload time = sum(delay) * timescale + resettime', () => {
    it.each([
        ['aa_12', 'tacticalreload', 2.4],
        ['aa_12', 'reload', 3.06],
        ['ks_23m', 'reload', 1.14],
        ['dbv12', 'tacticalreload', 2.79],
        ['dbv12', 'reload', 3.69],
        ['cobray_terminator', 'reload', 1.61],
    ])('%s %s is %s s', (id, animation, expected) => {
        const seconds = animationSeconds(detail16(id).animations[animation])!;
        expect(seconds).toBeCloseTo(expected, 1);
    });

    it('only magazine-fed weapons get a reload time', () => {
        expect(reloadInfo(detail16('m4'), 'm4')).toMatchObject({ kind: 'mag', tactical: 1.892, full: 2.294 });
        expect(reloadInfo(detail16('aa_12'), 'aa_12')).toMatchObject({ kind: 'mag', tactical: 2.4, full: 3.06 });
        expect(reloadInfo(detail16('henry_45_70'), 'henry_45_70').kind).toBe('staged'); // loads shell by shell
        expect(reloadInfo(detail16('remington_870'), 'remington_870')).toEqual({ kind: 'shotgun', tactical: null, full: null });
    });
});

describe('UAR A3 (aug_a3) and its ammo conversions, 11.17 canonical data', () => {
    const weapons = canonical('11.17-provisional', 'weapons.json');
    const attachments = canonical('11.17-provisional', 'attachments.json');
    const entry = weapons.aug_a3;
    const detail = canonical('11.17-provisional', 'weapon_details/aug_a3.json');
    const variants = compileVariants(entry, detail, attachments, ['Ammo']);
    const variant = (name: string) => variants.find((v) => v.name === name)!;

    it('base stats', () => {
        const stats = weaponRecord(entry, detail).stats;
        expect(stats.rpm).toBe(720);
        expect(stats.damageGraph).toEqual([{ distance: 0, damage: 34 }, { distance: 40, damage: 34 }, { distance: 150, damage: 21 }]);
        expect(stats).toMatchObject({ multhead: 1.4, multtorso: 1, bulletspeed: 3050, penetration: 1, recoilScale: 1 });
    });

    it('7.62x39mm: more damage and penetration, slower bullets, +25% recoil, 8% slower reload', () => {
        const d = variant('7.62x39mm').delta;
        expect(d.damageGraph).toEqual([{ distance: 0, damage: 37 }, { distance: 40, damage: 37 }, { distance: 150, damage: 24 }]);
        expect(d).toMatchObject({ bulletspeed: 2350, penetration: 1.4, recoilScale: 1.25 });
        expect(d.reload!.tactical).toBeCloseTo(2.484 * 1.08, 2);
        expect(d.reload!.full).toBeCloseTo(3.611 * 1.08, 2);
        expect(d.multtorso).toBeUndefined();
    });

    it('.300 BLK: closer range damage, shorter reach, torso x1.1, +10% recoil, no reload penalty', () => {
        const d = variant('.300 BLK').delta;
        expect(d.damageGraph).toEqual([{ distance: 0, damage: 36 }, { distance: 45, damage: 36 }, { distance: 125, damage: 19 }]);
        expect(d).toMatchObject({ multtorso: 1.1, bulletspeed: 2250, penetration: 1.15, recoilScale: 1.1 });
        expect(d.reload).toBeUndefined();
    });

    it('keeps only what changes', () => {
        expect(variant('7.62x39mm').delta.rpm).toBeUndefined();
        expect(variant('7.62x39mm').delta.magsize).toBeUndefined();
    });
});

describe('canonical attachments keep which rows a table modifier hits', () => {
    it('every damage-graph multiplier has valueIndex and indexList (the builder used to drop them)', () => {
        const attachments = canonical('11.17-provisional', 'attachments.json');
        const mods = Object.values<any>(attachments).flatMap((a) => a.modifiers).filter((m: any) => m.type === 'tableTrueMultipliers');
        expect(mods.length).toBeGreaterThan(400);
        expect(mods.every((m: any) => m.valueIndex && m.indexList)).toBe(true);
    });
});

describe('damage curves match the numbers read off them', () => {
    // damage0 = first point, range0 = second point's distance, damage1 / range1 = last point. The 11.17 builder once
    // updated damage0/range0 for rebalanced weapons but left the old 11.16 curve in place (K2: 32@0 32@90 20@150).
    it.each(['11.16', '11.17-provisional'])('%s: every weapon with a curve', (version) => {
        const dir = path.join(root, 'data/canonical', version, 'weapon_details');
        let checked = 0;
        const bad: string[] = [];
        for (const file of fs.readdirSync(dir)) {
            const d = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
            const g = d.damageGraph;
            if (!Array.isArray(g) || g.length < 2 || typeof d.damage0 !== 'number') continue;
            checked++;
            const last = g[g.length - 1];
            if (d.damage0 !== g[0].damage || d.range0 !== g[1].distance || d.damage1 !== last.damage || d.range1 !== last.distance) bad.push(file);
        }
        expect(checked).toBeGreaterThan(300);
        expect(bad).toEqual([]);
    });

    it('11.17 K2 has its 11.17 curve', () => {
        const k2 = canonical('11.17-provisional', 'weapon_details/k2.json');
        expect(k2.damageGraph).toEqual([{ damage: 34, distance: 0 }, { damage: 34, distance: 50 }, { damage: 23, distance: 140 }]);
    });
});
