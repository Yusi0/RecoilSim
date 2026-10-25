import fs from 'fs';
import path from 'path';
import { SimulationEngine, Vector3, CFrame } from '../src/core';
import { TargetPlaneProjector } from '../src/montecarlo/TargetPlaneProjector';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const importer = require('../scripts/import_weapon_labs_recoil.js');

/**
 * Original in-game recoil tables (Weapon Labs) for the 11.17 weapons whose dump had no recoil.
 * Source of truth: "11.17 guns/*.txt" -> data/overrides/weapon_recoil_overrides.json -> canonical files.
 */
const root = path.join(__dirname, '..');
const gunsDir = path.join(root, '11.17 guns');
const canonicalDir = path.join(root, 'data/canonical/11.17-provisional');
const overrides = JSON.parse(fs.readFileSync(path.join(root, 'data/overrides/weapon_recoil_overrides.json'), 'utf8'));
const weapons = JSON.parse(fs.readFileSync(path.join(canonicalDir, 'weapons.json'), 'utf8'));

const EXPECTED_IDS = ['mcx_rattler', 'mcx_virtus', 'regulator'];

// A few values copied by hand from the text files, to catch a parser that is wrong in a consistent way
const SPOT_CHECKS: Record<string, any[]> = {
    mcx_rattler: [['aimCameraBody', 'x', [[1.0, 29, 1.3, 0.4], [2.0, 6, 0.38, 0.05]]]],
    regulator: [['aimCameraBody', 'x', [[0.65, 26, 1.25, 0.6], [0.75, 4, 0.23, 0.03]]]],
    mcx_virtus: [['aimCameraBody', 'x', [[1.05, 25, 2.5, 0.65], [3.45, 5, 0.24, 0.02]]]],
};

function detail(id: string) {
    return JSON.parse(fs.readFileSync(path.join(canonicalDir, 'weapon_details', `${id}.json`), 'utf8'));
}

describe('Weapon Labs recoil overrides (11.17 guns)', () => {
    it('covers Rattler, Regulator and Virtus', () => {
        for (const id of EXPECTED_IDS) expect(overrides[id]).toBeDefined();
    });

    describe.each(EXPECTED_IDS)('%s', (id) => {
        it('is what the text file parses to (override file is reproducible)', () => {
            const file = fs.readdirSync(gunsDir).find((f) => importer.resolveWeaponId(path.basename(f, '.txt'), weapons) === id)!;
            expect(file).toBeDefined();
            const parsed = importer.parseWeaponLabsRecoil(fs.readFileSync(path.join(gunsDir, file), 'utf8'), file);
            expect(overrides[id].recoil).toEqual(parsed);
        });

        it('matches hand-copied values from the source text', () => {
            for (const [group, axis, layers] of SPOT_CHECKS[id]) {
                expect(overrides[id].recoil[group][axis]).toEqual(layers);
            }
        });

        it('is written into the canonical file with its source labelled', () => {
            const d = detail(id);
            expect(d.recoil).toEqual(overrides[id].recoil);
            expect(d._provenance.recoil_springs).toBe('WEAPON_LABS_ORIGINAL');
            // top-level on purpose: build_canonical_datasets.js rewrites _provenance but keeps other keys
            expect(d.recoil_source.source).toMatch(/Weapon Labs/);
        });

        it('has all 16 recoil groups, each with x, y and z', () => {
            const recoil = overrides[id].recoil;
            expect(Object.keys(recoil)).toHaveLength(16);
            for (const group of Object.values<any>(recoil)) {
                expect(Object.keys(group).sort()).toEqual(['x', 'y', 'z']);
            }
        });

        it('is simulated as verified and climbs shot after shot (ADS, standing)', () => {
            const weapon = detail(id);
            const rpm = Array.isArray(weapon.firerate) ? weapon.firerate[0] : weapon.firerate;
            const shots = 10;
            const perSeed = [1, 2, 3, 4].map((seed) => {
                const engine = new SimulationEngine({
                    weaponData: weapon,
                    seed,
                    baseCameraOrientation: CFrame.IDENTITY,
                    positionOffset: new Vector3(0, 1.5, 0),
                    hipOffset: CFrame.newPos(new Vector3(0.18, -0.15, -0.42)),
                    aimOffset: CFrame.newPos(new Vector3(0, -0.08, -0.32)),
                });
                expect(engine.isRecoilVerified).toBe(true);
                engine.pushAimInput(true, 0);
                engine.advanceTo(0.3);
                const interval = 60 / rpm;
                const ys: number[] = [];
                for (let i = 0; i < shots; i++) {
                    const t = 0.3 + i * interval;
                    engine.pushFireInput(t);
                    engine.advanceTo(t + interval);
                    const shot = engine.physicalShots[i];
                    ys.push(TargetPlaneProjector.project(shot.origin, shot.direction, 50)!.y);
                }
                return ys;
            });
            const mean = Array.from({ length: shots }, (_, i) => perSeed.reduce((s, ys) => s + ys[i], 0) / perSeed.length);
            expect(mean.every(Number.isFinite)).toBe(true);
            expect(mean[shots - 1] - mean[0]).toBeGreaterThan(2); // clearly climbing, not the old "null = no recoil"
        });
    });
});
