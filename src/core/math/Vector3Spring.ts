import { Vector3 } from './Vector3';
import { calcSpringPV } from './Spring';

export interface Vector3SpringPV {
    p: Vector3;
    v: Vector3;
}

export function calcVector3SpringPV(
    d: Vector3,
    s: Vector3,
    p0: Vector3,
    v0: Vector3,
    p1: Vector3,
    dt: number
): Vector3SpringPV {
    const resX = calcSpringPV(d.x, s.x, p0.x, v0.x, p1.x, dt);
    const resY = calcSpringPV(d.y, s.y, p0.y, v0.y, p1.y, dt);
    const resZ = calcSpringPV(d.z, s.z, p0.z, v0.z, p1.z, dt);

    return {
        p: new Vector3(resX.p, resY.p, resZ.p),
        v: new Vector3(resX.v, resY.v, resZ.v)
    };
}

export class Vector3Spring {
    private _d: Vector3;
    private _s: Vector3;
    private _p0: Vector3;
    private _v0: Vector3;
    private _p1: Vector3;

    constructor(
        initialPos: Vector3 = Vector3.ZERO,
        damping: Vector3 = Vector3.ONE,
        stiffness: Vector3 = Vector3.ONE
    ) {
        this._p0 = initialPos.clone();
        this._v0 = Vector3.ZERO;
        this._p1 = initialPos.clone();
        this._d = damping.clone();
        this._s = stiffness.clone();
    }

    public get p(): Vector3 {
        return this._p0;
    }

    public set p(val: Vector3) {
        if (val) this._p0 = val.clone();
    }

    public get v(): Vector3 {
        return this._v0;
    }

    public set v(val: Vector3) {
        if (val) this._v0 = val.clone();
    }

    public get t(): Vector3 {
        return this._p1;
    }

    public set t(val: Vector3) {
        if (val) this._p1 = val.clone();
    }

    public get d(): Vector3 {
        return this._d;
    }

    public set d(val: Vector3) {
        if (val) this._d = val.clone();
    }

    public get s(): Vector3 {
        return this._s;
    }

    public set s(val: Vector3) {
        if (val) this._s = val.clone();
    }

    public get a(): Vector3 {
        // s * s * (t - p) - 2 * s * d * v
        const term1 = this._s.mul(this._s).mul(this._p1.sub(this._p0));
        const term2 = this._s.mul(2).mul(this._d).mul(this._v0);
        return term1.sub(term2);
    }

    public set a(impulse: Vector3) {
        if (impulse) this._v0 = this._v0.add(impulse);
    }

    public update(
        dt: number,
        target?: Vector3,
        pos?: Vector3,
        vel?: Vector3,
        damping?: Vector3,
        stiffness?: Vector3
    ): Vector3SpringPV {
        const currentTarget = target ? target : this._p1;
        const currentPos = pos ? pos : this._p0;
        const currentVel = vel ? vel : this._v0;
        const currentDamping = damping ? damping : this._d;
        const currentStiffness = stiffness ? stiffness : this._s;

        const res = calcVector3SpringPV(
            currentDamping,
            currentStiffness,
            currentPos,
            currentVel,
            currentTarget,
            dt
        );

        this._p0 = res.p;
        this._v0 = res.v;
        this._p1 = currentTarget;
        this._d = currentDamping;
        this._s = currentStiffness;

        return res;
    }

    public accelerate(impulse: Vector3, dt: number = 0): void {
        if (dt > 0) {
            const res = calcVector3SpringPV(this._d, this._s, this._p0, this._v0, this._p1, dt);
            this._p0 = res.p;
            this._v0 = res.v.add(impulse);
        } else {
            this._v0 = this._v0.add(impulse);
        }
    }
}
