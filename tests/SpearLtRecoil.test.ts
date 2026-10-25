import fs from 'fs';
import path from 'path';
import { SimulationEngine, Vector3, CFrame } from '../src/core';
import { TargetPlaneProjector } from '../src/montecarlo/TargetPlaneProjector';

/**
 * SPEAR LT recoil comes from the original in-game gunData (Weapon Labs), replacing the earlier
 * 3_LAYER_PROVISIONAL_11_17 numbers. The earlier numbers climbed from the 2nd shot; in the game the
 * first ~5 shots stay on the centre and the rise only starts after that (why players use 3-5 round bursts).
 */
const root = path.join(__dirname, '..');
const rawPath = path.join(root, 'data/raw/weapon-details/spear_lt.json');
const canonicalPath = path.join(root, 'data/canonical/11.17-provisional/weapon_details/spear_lt.json');

const WEAPON_LABS_AIM_CAMERA_BODY_X = [
    [0.65, 26, 1.5, 0.4],
    [0.4, 2.5, 0.09, 0.01],
    [1.2, 10, -0.58, 0],
];

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const STUDS = 50; // distance of the target plane

/** Vertical position of each shot on the target plane, averaged over seeds, relative to shot 1. */
function adsOffsets(weapon: any, shots: number): number[] {
    const perSeed = SEEDS.map((seed) => {
        const engine = new SimulationEngine({
            weaponData: weapon,
            seed,
            baseCameraOrientation: CFrame.IDENTITY,
            positionOffset: new Vector3(0, 1.5, 0),
            hipOffset: CFrame.newPos(new Vector3(0.18, -0.15, -0.42)),
            aimOffset: CFrame.newPos(new Vector3(0, -0.08, -0.32)),
        });
        engine.pushAimInput(true, 0);
        engine.advanceTo(0.3);
        const interval = 60 / weapon.firerate;
        const ys: number[] = [];
        for (let i = 0; i < shots; i++) {
            const t = 0.3 + i * interval;
            engine.pushFireInput(t);
            engine.advanceTo(t + interval);
            const shot = engine.physicalShots[i];
            ys.push(TargetPlaneProjector.project(shot.origin, shot.direction, STUDS)!.y);
        }
        return ys;
    });
    const mean = Array.from({ length: shots }, (_, i) => perSeed.reduce((sum, ys) => sum + ys[i], 0) / SEEDS.length);
    return mean.map((y) => y - mean[0]);
}

describe('SPEAR LT recoil (Weapon Labs original data)', () => {
    const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));

    it('uses the original aimCameraBody.x layers, including the negative third layer', () => {
        expect(raw.recoil.aimCameraBody.x).toEqual(WEAPON_LABS_AIM_CAMERA_BODY_X);
        expect(canonical.recoil.aimCameraBody.x).toEqual(WEAPON_LABS_AIM_CAMERA_BODY_X);
    });

    it('keeps raw and canonical recoil identical and labelled with their source', () => {
        expect(canonical.recoil).toEqual(raw.recoil);
        for (const detail of [raw, canonical]) {
            expect(detail._provenance.recoil_springs).toBe('WEAPON_LABS_ORIGINAL');
            // top-level on purpose: build_canonical_datasets.js rewrites _provenance but keeps other keys
            expect(detail.recoil_source.source).toMatch(/Weapon Labs/);
        }
    });

    it('is the SPEAR LT (850 RPM assault rifle), not the MCX SPEAR / M7 NGSW', () => {
        expect(raw.name).toBe('SPEAR LT');
        expect(raw.firerate).toBe(850);
        expect(raw.magsize).toBe(28);
    });

    describe('ADS full auto, standing', () => {
        const offsets = adsOffsets(raw, 28);

        it('keeps the first 5 shots on the centre', () => {
            for (let i = 0; i < 5; i++) {
                expect(Math.abs(offsets[i])).toBeLessThan(1.5);
            }
        });

        it('starts climbing from the 6th shot and keeps climbing', () => {
            expect(offsets[5]).toBeGreaterThan(offsets[4]);
            for (let i = 5; i < 9; i++) {
                expect(offsets[i + 1]).toBeGreaterThan(offsets[i]);
            }
            expect(offsets[9]).toBeGreaterThan(3); // shot 10
            expect(offsets[9]).toBeGreaterThan(offsets[5] + 2);
        });

        it('stays far below the old provisional climb (about 24 studs by shot 10)', () => {
            expect(offsets[9]).toBeLessThan(12);
            expect(Math.max(...offsets)).toBeLessThan(20);
        });
    });
});
