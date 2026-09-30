import { Vector3 } from '../core/math';
import { AnalyticSpringState } from './AnalyticTypes';

/**
 * Closed-form analytical solution of a 1D second-order damped harmonic oscillator:
 *   p''(t) + 2 * d * s * p'(t) + s^2 * (p(t) - target) = 0
 *
 * Implements the exact closed-form equations from Phantom Forces SharedModules.Math.Spring.lua:
 * - Underdamped (d < 1)
 * - Critically damped (d == 1)
 * - Overdamped (d > 1)
 * - Zero natural frequency (s == 0)
 *
 * Guaranteed zero Euler integration, zero frame rate dependence, purely analytic evaluation.
 */
export class AnalyticScalarSpring {
    private _d: number;
    private _s: number;
    private _t0: number;
    private _p0: number;
    private _v0: number;
    private _target: number;

    constructor(
        initialPosition: number = 0,
        dampingRatio: number = 1.0,
        naturalFrequency: number = 1.0,
        target: number = initialPosition,
        initialTime: number = 0
    ) {
        this._p0 = initialPosition;
        this._v0 = 0;
        this._d = dampingRatio;
        this._s = naturalFrequency;
        this._target = target;
        this._t0 = initialTime;
    }

    public get d(): number { return this._d; }
    public get s(): number { return this._s; }
    public get target(): number { return this._target; }
    public get t0(): number { return this._t0; }

    public getState(): AnalyticSpringState {
        return {
            p0: this._p0,
            v0: this._v0,
            t0: this._t0,
            target: this._target,
            d: this._d,
            s: this._s
        };
    }

    /**
     * Exact closed-form evaluation at timestamp t.
     */
    public evaluate(t: number): { p: number; v: number } {
        const dt = t - this._t0;
        if (dt === 0) {
            return { p: this._p0, v: this._v0 };
        }

        const d = this._d;
        const s = this._s;
        const p0 = this._p0;
        const v0 = this._v0;
        const target = this._target;

        // s == 0: zero restoring force (free motion)
        if (s === 0) {
            return {
                p: p0 + dt * v0,
                v: v0
            };
        }

        const v14 = s * dt;
        const v15 = d * d;
        let v16: number, v18: number, v19: number;

        if (v15 < 1) {
            // Underdamped regime
            v16 = Math.sqrt(1 - v15);
            const v17 = Math.exp(-d * v14) / v16;
            v18 = v17 * Math.cos(v16 * v14);
            v19 = v17 * Math.sin(v16 * v14);
        } else if (Math.abs(v15 - 1) < 1e-12) {
            // Critically damped regime
            v16 = 1;
            v18 = Math.exp(-d * v14);
            v19 = v18 * v14;
        } else {
            // Overdamped regime
            v16 = Math.sqrt(v15 - 1);
            const v20 = Math.exp((-d + v16) * v14) / (2 * v16);
            const v21 = Math.exp((-d - v16) * v14) / (2 * v16);
            v18 = v20 + v21;
            v19 = v20 - v21;
        }

        const v22 = v16 * v18 + d * v19;
        const v23 = 1 - (v16 * v18 + d * v19);
        const v24 = v19 / s;
        const v25 = -s * v19;
        const v26 = s * v19;
        const v27 = v16 * v18 - d * v19;

        const p = v22 * p0 + v23 * target + v24 * v0;
        const v = v25 * p0 + v26 * target + v27 * v0;

        return { p, v };
    }

    /**
     * Instantly adds velocity impulse at timestamp t, resetting initial state conditions.
     */
    public accelerate(impulse: number, t: number): void {
        const current = this.evaluate(t);
        this._t0 = t;
        this._p0 = current.p;
        this._v0 = current.v + impulse;
    }

    /**
     * Smoothly updates spring damping (d) and natural frequency (s) at timestamp t.
     */
    public updateParameters(d: number, s: number, t: number): void {
        const current = this.evaluate(t);
        this._t0 = t;
        this._p0 = current.p;
        this._v0 = current.v;
        this._d = d;
        this._s = s;
    }

    /**
     * Updates target position at timestamp t.
     */
    public setTarget(target: number, t: number): void {
        const current = this.evaluate(t);
        this._t0 = t;
        this._p0 = current.p;
        this._v0 = current.v;
        this._target = target;
    }

    /**
     * Resets spring state explicitly.
     */
    public reset(position: number = 0, velocity: number = 0, target: number = position, t: number = 0): void {
        this._p0 = position;
        this._v0 = velocity;
        this._target = target;
        this._t0 = t;
    }
}

/**
 * Closed-form analytical 3D Vector spring consisting of three independent scalar springs.
 */
export class AnalyticVectorSpring {
    private _x: AnalyticScalarSpring;
    private _y: AnalyticScalarSpring;
    private _z: AnalyticScalarSpring;

    constructor(
        initialPosition: Vector3 = Vector3.ZERO,
        dampingRatio: Vector3 = Vector3.ONE,
        naturalFrequency: Vector3 = Vector3.ONE,
        target: Vector3 = initialPosition,
        initialTime: number = 0
    ) {
        this._x = new AnalyticScalarSpring(initialPosition.x, dampingRatio.x, naturalFrequency.x, target.x, initialTime);
        this._y = new AnalyticScalarSpring(initialPosition.y, dampingRatio.y, naturalFrequency.y, target.y, initialTime);
        this._z = new AnalyticScalarSpring(initialPosition.z, dampingRatio.z, naturalFrequency.z, target.z, initialTime);
    }

    public get x(): AnalyticScalarSpring { return this._x; }
    public get y(): AnalyticScalarSpring { return this._y; }
    public get z(): AnalyticScalarSpring { return this._z; }

    public evaluate(t: number): { p: Vector3; v: Vector3 } {
        const rx = this._x.evaluate(t);
        const ry = this._y.evaluate(t);
        const rz = this._z.evaluate(t);
        return {
            p: new Vector3(rx.p, ry.p, rz.p),
            v: new Vector3(rx.v, ry.v, rz.v)
        };
    }

    public accelerate(impulse: Vector3, t: number): void {
        this._x.accelerate(impulse.x, t);
        this._y.accelerate(impulse.y, t);
        this._z.accelerate(impulse.z, t);
    }

    public updateParameters(d: Vector3, s: Vector3, t: number): void {
        this._x.updateParameters(d.x, s.x, t);
        this._y.updateParameters(d.y, s.y, t);
        this._z.updateParameters(d.z, s.z, t);
    }

    public setAxisParameters(axis: 'x' | 'y' | 'z', d: number, s: number, t: number): void {
        if (axis === 'x') this._x.updateParameters(d, s, t);
        else if (axis === 'y') this._y.updateParameters(d, s, t);
        else if (axis === 'z') this._z.updateParameters(d, s, t);
    }

    public reset(position: Vector3 = Vector3.ZERO, velocity: Vector3 = Vector3.ZERO, target: Vector3 = position, t: number = 0): void {
        this._x.reset(position.x, velocity.x, target.x, t);
        this._y.reset(position.y, velocity.y, target.y, t);
        this._z.reset(position.z, velocity.z, target.z, t);
    }
}
