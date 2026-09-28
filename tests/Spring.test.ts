import fs from 'fs';
import path from 'path';
import { Spring, calcSpringPV } from '../src/core/math/Spring';
import { Vector3Spring, calcVector3SpringPV } from '../src/core/math/Vector3Spring';
import { Vector3 } from '../src/core/math/Vector3';

describe('Spring & Vector3Spring Physics Core Suite (PF ODE Semantics)', () => {
    let independentRef: any;

    beforeAll(() => {
        const refPath = path.join(__dirname, '../data/reference/spring_independent_reference.json');
        independentRef = JSON.parse(fs.readFileSync(refPath, 'utf-8'));
    });

    test('1. Underdamped regime (d = 0.5 < 1): matches independent ODE reference', () => {
        const spring = new Spring(0, 0.5, 10);
        spring.v = 10; // Initial velocity impulse

        const res = spring.update(0.1);
        const ref = independentRef.underdamped_d0_5_s10_v10_dt0_1;

        expect(res.p).toBeCloseTo(ref.p, 8);
        expect(res.v).toBeCloseTo(ref.v, 8);
        expect(spring.p).toBeCloseTo(ref.p, 8);
        expect(spring.v).toBeCloseTo(ref.v, 8);
    });

    test('2. Critically damped regime (d = 1.0): matches independent ODE reference', () => {
        const spring = new Spring(0, 1.0, 10);
        spring.v = 10;

        const res = spring.update(0.1);
        const ref = independentRef.criticallyDamped_d1_0_s10_v10_dt0_1;

        expect(res.p).toBeCloseTo(ref.p, 8);
        expect(res.v).toBeCloseTo(ref.v, 8);
    });

    test('3. Overdamped regime (d = 2.0 > 1): matches independent ODE reference', () => {
        const spring = new Spring(0, 2.0, 10);
        spring.v = 10;

        const res = spring.update(0.1);
        const ref = independentRef.overdamped_d2_0_s10_v10_dt0_1;

        expect(res.p).toBeCloseTo(ref.p, 8);
        expect(res.v).toBeCloseTo(ref.v, 8);
    });

    test('4. Zero stiffness edge case (s = 0): free velocity movement', () => {
        const spring = new Spring(5, 1.0, 0);
        spring.v = 20;

        const res = spring.update(0.5);

        // p = 5 + 20 * 0.5 = 15, v = 20
        expect(res.p).toBeCloseTo(15, 8);
        expect(res.v).toBeCloseTo(20, 8);
    });

    test('5. Impulse & Acceleration: accelerate() adds to velocity', () => {
        const spring = new Spring(0, 1.0, 10);

        // Accelerate with impulse 15
        spring.accelerate(15);
        expect(spring.v).toBe(15);

        // Update dt=0.05
        const res1 = spring.update(0.05);
        expect(res1.p).toBeGreaterThan(0);

        // Accelerate with another impulse 10 at current step
        spring.accelerate(10);
        expect(spring.v).toBeCloseTo(res1.v + 10, 8);
    });

    test('6. Sequential State Transitions: Multi-step time integration determinism', () => {
        const spring1 = new Spring(0, 0.8, 12);
        spring1.v = 30;

        // Two step update: 0.05s then 0.05s
        spring1.update(0.05);
        const resStep2 = spring1.update(0.05);

        // Single step update: 0.1s
        const spring2 = new Spring(0, 0.8, 12);
        spring2.v = 30;
        const resSingle0_1 = spring2.update(0.1);

        // Analytical solution over 0.1s must match multi-step exact solution
        expect(resStep2.p).toBeCloseTo(resSingle0_1.p, 8);
        expect(resStep2.v).toBeCloseTo(resSingle0_1.v, 8);
    });

    test('7. Vector3Spring 3D Multi-Regime Integration: x=under, y=critical, z=over', () => {
        const d3 = new Vector3(0.5, 1.0, 2.0);
        const s3 = new Vector3(10, 10, 10);
        const p0 = Vector3.ZERO;

        const v3spring = new Vector3Spring(p0, d3, s3);
        v3spring.v = new Vector3(10, 10, 10); // 3D impulse vector

        const res = v3spring.update(0.1);
        const refV3 = independentRef.vector3Spring_multi_damped;

        expect(res.p.x).toBeCloseTo(refV3.p[0], 8);
        expect(res.p.y).toBeCloseTo(refV3.p[1], 8);
        expect(res.p.z).toBeCloseTo(refV3.p[2], 8);

        expect(res.v.x).toBeCloseTo(refV3.v[0], 8);
        expect(res.v.y).toBeCloseTo(refV3.v[1], 8);
        expect(res.v.z).toBeCloseTo(refV3.v[2], 8);
    });

    test('8. Vector3Spring Acceleration Impulse (a property & accelerate method)', () => {
        const v3spring = new Vector3Spring(Vector3.ZERO, Vector3.ONE, new Vector3(10, 10, 10));
        
        v3spring.accelerate(new Vector3(5, -10, 15));
        expect(v3spring.v.equals(new Vector3(5, -10, 15))).toBe(true);

        const res = v3spring.update(0.05);
        expect(res.p.x).toBeGreaterThan(0);
        expect(res.p.y).toBeLessThan(0);
        expect(res.p.z).toBeGreaterThan(0);
    });
});
