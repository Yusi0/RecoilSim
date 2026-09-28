export interface SpringPV {
    p: number;
    v: number;
}

export function calcSpringPV(
    d: number,
    s: number,
    p0: number,
    v0: number,
    p1: number,
    dt: number
): SpringPV {
    if (dt <= 0) {
        return { p: p0, v: v0 };
    }

    if (s === 0) {
        return {
            p: p0 + v0 * dt,
            v: v0
        };
    }

    const v14 = s * dt;
    const v15 = d * d;
    let v16: number, v18: number, v19: number;

    if (v15 < 1) {
        // Underdamped (d < 1)
        v16 = Math.sqrt(1 - v15);
        const v17 = Math.exp(-d * v14) / v16;
        v18 = v17 * Math.cos(v16 * v14);
        v19 = v17 * Math.sin(v16 * v14);
    } else if (v15 === 1) {
        // Critically Damped (d == 1)
        v16 = 1;
        v18 = Math.exp(-d * v14) / v16;
        v19 = v18 * v14;
    } else {
        // Overdamped (d > 1)
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

    const p = v22 * p0 + v23 * p1 + v24 * v0;
    const v = v25 * p0 + v26 * p1 + v27 * v0;

    return { p, v };
}

export class Spring {
    private _d: number;
    private _s: number;
    private _p0: number;
    private _v0: number;
    private _p1: number;

    constructor(initialPos: number = 0, damping: number = 1, stiffness: number = 1) {
        this._p0 = initialPos;
        this._v0 = 0;
        this._p1 = initialPos;
        this._d = damping;
        this._s = stiffness;
    }

    public get p(): number {
        return this._p0;
    }

    public set p(val: number) {
        if (!isNaN(val)) this._p0 = val;
    }

    public get v(): number {
        return this._v0;
    }

    public set v(val: number) {
        if (!isNaN(val)) this._v0 = val;
    }

    public get t(): number {
        return this._p1;
    }

    public set t(val: number) {
        if (!isNaN(val)) this._p1 = val;
    }

    public get d(): number {
        return this._d;
    }

    public set d(val: number) {
        if (!isNaN(val)) this._d = val;
    }

    public get s(): number {
        return this._s;
    }

    public set s(val: number) {
        if (!isNaN(val)) this._s = val;
    }

    public get a(): number {
        return this._s * this._s * (this._p1 - this._p0) - 2 * this._s * this._d * this._v0;
    }

    public set a(impulse: number) {
        if (!isNaN(impulse)) this._v0 += impulse;
    }

    public update(
        dt: number,
        target?: number,
        pos?: number,
        vel?: number,
        damping?: number,
        stiffness?: number
    ): SpringPV {
        const currentTarget = target !== undefined ? target : this._p1;
        const currentPos = pos !== undefined ? pos : this._p0;
        const currentVel = vel !== undefined ? vel : this._v0;
        const currentDamping = damping !== undefined ? damping : this._d;
        const currentStiffness = stiffness !== undefined ? stiffness : this._s;

        const res = calcSpringPV(currentDamping, currentStiffness, currentPos, currentVel, currentTarget, dt);

        this._p0 = currentPos !== pos ? res.p : (pos !== undefined ? pos : res.p);
        this._v0 = currentVel !== vel ? res.v : (vel !== undefined ? vel : res.v);
        this._p1 = currentTarget;
        this._d = currentDamping;
        this._s = currentStiffness;

        return res;
    }

    public accelerate(impulse: number, dt: number = 0): void {
        if (dt > 0) {
            const res = calcSpringPV(this._d, this._s, this._p0, this._v0, this._p1, dt);
            this._p0 = res.p;
            this._v0 = res.v + impulse;
        } else {
            this._v0 += impulse;
        }
    }
}
