import fs from 'fs';
import path from 'path';
import { RecoilSprings } from '../src/core/recoil/RecoilSprings';

// Deterministic Seeded PRNG for testing (matching generate_recoilsprings_reference.js)
class SeededRandom {
    private seed: number;
    constructor(seed = 123456789) {
        this.seed = seed;
    }
    public next(): number {
        this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
        return this.seed / 4294967296;
    }
}

describe('RecoilSprings Independent Reference & Functional Tests', () => {
    const referencePath = path.join(__dirname, '../data/reference/recoilsprings_independent_reference.json');
    const referenceData = JSON.parse(fs.readFileSync(referencePath, 'utf8'));

    it('should match the independent reference trace exactly across all trajectory steps', () => {
        const c25 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/C25.json'), 'utf8'));
        const rng = new SeededRandom(42);

        let currentTime = 0;
        const springs = new RecoilSprings(
            c25.recoil.hipRotation,
            c25.recoil.aimRotation,
            c25.recoil.hipRotationRecovery,
            c25.recoil.aimRotationRecovery,
            () => currentTime,
            (mean, variance) => variance * 2 * rng.next() - variance + mean
        );

        const trace = referenceData.trace;

        // Step 0: init
        currentTime = 0;
        let p = springs.getP(0);
        expect(p.x).toBeCloseTo(trace[0].p.x, 6);
        expect(p.y).toBeCloseTo(trace[0].p.y, 6);
        expect(p.z).toBeCloseTo(trace[0].p.z, 6);

        // Step 1: impulse 1 at t = 0.05
        currentTime = 0.05;
        springs.applyImpulse(null, 1.0, 0.05);
        p = springs.getP(0.05);
        expect(p.x).toBeCloseTo(trace[1].p.x, 6);
        expect(p.y).toBeCloseTo(trace[1].p.y, 6);
        expect(p.z).toBeCloseTo(trace[1].p.z, 6);

        // Step 2: step at t = 0.10 (before recovery delay)
        currentTime = 0.10;
        springs.step(0.10);
        p = springs.getP(0.10);
        expect(p.x).toBeCloseTo(trace[2].p.x, 6);
        expect(p.y).toBeCloseTo(trace[2].p.y, 6);
        expect(p.z).toBeCloseTo(trace[2].p.z, 6);

        // Step 3: step at t = 0.18 (after recovery delay)
        currentTime = 0.18;
        springs.step(0.18);
        p = springs.getP(0.18);
        expect(p.x).toBeCloseTo(trace[3].p.x, 6);
        expect(p.y).toBeCloseTo(trace[3].p.y, 6);
        expect(p.z).toBeCloseTo(trace[3].p.z, 6);

        // Step 4: setAim(true) at t = 0.25
        currentTime = 0.25;
        springs.setAim(true, 0.25);
        p = springs.getP(0.25);
        expect(p.x).toBeCloseTo(trace[4].p.x, 6);
        expect(p.y).toBeCloseTo(trace[4].p.y, 6);
        expect(p.z).toBeCloseTo(trace[4].p.z, 6);

        // Step 5: impulse 2 in AIM state at t = 0.30
        currentTime = 0.30;
        springs.applyImpulse(null, 1.0, 0.30);
        p = springs.getP(0.30);
        expect(p.x).toBeCloseTo(trace[5].p.x, 6);
        expect(p.y).toBeCloseTo(trace[5].p.y, 6);
        expect(p.z).toBeCloseTo(trace[5].p.z, 6);

        // Step 6: step in AIM recovery at t = 0.50
        currentTime = 0.50;
        springs.step(0.50);
        p = springs.getP(0.50);
        expect(p.x).toBeCloseTo(trace[6].p.x, 6);
        expect(p.y).toBeCloseTo(trace[6].p.y, 6);
        expect(p.z).toBeCloseTo(trace[6].p.z, 6);
    });

    it('A. Single layer instantiation: initializes correctly', () => {
        const hipParams = {
            x: [[0.5, 20, 1.0, 0.0] as [number, number, number, number]]
        };
        const springs = new RecoilSprings(hipParams);
        expect(springs.vector3Springs.length).toBe(1);
        expect(springs.vector3Springs[0].d.x).toBe(0.5);
        expect(springs.vector3Springs[0].s.x).toBe(20);
    });

    it('B. Multi-layer instantiation: creates vector springs for all layers', () => {
        const hipParams = {
            x: [
                [0.3, 30, 0, 0],
                [0.5, 50, 0, 0]
            ] as [number, number, number, number][]
        };
        const springs = new RecoilSprings(hipParams);
        expect(springs.vector3Springs.length).toBe(2);
        expect(springs.vector3Springs[0].d.x).toBe(0.3);
        expect(springs.vector3Springs[1].d.x).toBe(0.5);
    });

    it('C. applyImpulse: modifies velocity with deterministic RNG & multiplier', () => {
        const hipParams = {
            x: [[0.5, 20, 2.0, 0.5] as [number, number, number, number]]
        };
        const springs = new RecoilSprings(
            hipParams,
            undefined,
            undefined,
            undefined,
            () => 0,
            (mean) => mean
        );

        springs.applyImpulse(null, 1.5, 0);
        expect(springs.vector3Springs[0].v.x).toBeCloseTo(3.0);
    });

    it('D. getP: correctly sums positions across multiple layers', () => {
        const hipParams = {
            x: [
                [0.5, 20, 1.0, 0] as [number, number, number, number],
                [0.5, 20, 2.0, 0] as [number, number, number, number]
            ]
        };
        const springs = new RecoilSprings(
            hipParams,
            undefined,
            undefined,
            undefined,
            () => 0,
            (mean) => mean
        );

        springs.applyImpulse(null, 1.0, 0);
        const pSum = springs.getP(0.05);
        const p0 = springs.vector3Springs[0].p.x;
        const p1 = springs.vector3Springs[1].p.x;
        expect(pSum.x).toBeCloseTo(p0 + p1);
    });

    it('E. setAim: transitions parameters between hip and aim while maintaining state continuity', () => {
        const hipParams = { x: [[0.4, 20, 1.0, 0] as [number, number, number, number]] };
        const aimParams = { x: [[0.8, 40, 0.5, 0] as [number, number, number, number]] };

        const springs = new RecoilSprings(hipParams, aimParams);
        expect(springs.vector3Springs[0].d.x).toBe(0.4);
        expect(springs.vector3Springs[0].s.x).toBe(20);

        springs.setAim(true, 0);
        expect(springs.vector3Springs[0].d.x).toBe(0.8);
        expect(springs.vector3Springs[0].s.x).toBe(40);
        expect(springs.lastAimState).toBe(true);
    });

    it('F. recovery delay: parameters transition only after delay has passed', () => {
        const hipParams = { x: [[0.3, 30, 1.0, 0] as [number, number, number, number]] };
        const hipRecovery = {
            x: { a: [[0.9, 10] as [number, number]], d: { delay: 0.1 } }
        };

        const springs = new RecoilSprings(hipParams, undefined, hipRecovery, undefined);
        springs.applyImpulse(null, 1.0, 0.0);

        springs.step(0.05);
        expect(springs.vector3Springs[0].d.x).toBe(0.3);
        expect(springs.vector3Springs[0].s.x).toBe(30);

        springs.step(0.15);
        expect(springs.vector3Springs[0].d.x).toBe(0.9);
        expect(springs.vector3Springs[0].s.x).toBe(10);
    });

    it('G. Rapid consecutive impulses: velocity accumulates across multiple shots', () => {
        const hipParams = { x: [[0.5, 20, 1.0, 0] as [number, number, number, number]] };
        const springs = new RecoilSprings(hipParams, undefined, undefined, undefined, () => 0, (mean) => mean);

        springs.applyImpulse(null, 1.0, 0.0);
        const v1 = springs.vector3Springs[0].v.x;
        springs.applyImpulse(null, 1.0, 0.0);
        const v2 = springs.vector3Springs[0].v.x;

        expect(v2).toBeCloseTo(v1 + 1.0);
    });

    it('H. Vector3 X/Y/Z independent springs calculation', () => {
        const hipParams = {
            x: [[0.3, 25, 1.0, 0] as [number, number, number, number]],
            y: [[0.6, 40, -2.0, 0] as [number, number, number, number]],
            z: [[0.8, 15, 0.5, 0] as [number, number, number, number]]
        };
        const springs = new RecoilSprings(hipParams, undefined, undefined, undefined, () => 0, (mean) => mean);

        springs.applyImpulse(null, 1.0, 0.0);
        const spring = springs.vector3Springs[0];

        expect(spring.d.x).toBe(0.3);
        expect(spring.d.y).toBe(0.6);
        expect(spring.d.z).toBe(0.8);

        expect(spring.v.x).toBeCloseTo(1.0);
        expect(spring.v.y).toBeCloseTo(-2.0);
        expect(spring.v.z).toBeCloseTo(0.5);
    });
});
