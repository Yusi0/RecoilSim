// PF Source:
// ClientModules.Weapons.RecoilSprings.lua
// SharedModules.Math.Vector3Spring.lua

import { Vector3, Vector3Spring } from '../math';

export type RecoilLayerTuple = [number, number, number, number]; // [d, s, impulseMean, impulseVariance]
export type RecoilRecoveryTuple = [number, number]; // [d, s]

export interface RecoilAxisParameters {
    x?: RecoilLayerTuple[];
    y?: RecoilLayerTuple[];
    z?: RecoilLayerTuple[];
}

export interface RecoveryAxisData {
    a?: RecoilRecoveryTuple[];
    d?: { delay?: number };
    delay?: number;
}

export type RecoilAxisRecoveryParameters = RecoilRecoveryTuple[] | RecoveryAxisData;

export interface RecoilRecoveryParameters {
    x?: RecoilAxisRecoveryParameters;
    y?: RecoilAxisRecoveryParameters;
    z?: RecoilAxisRecoveryParameters;
}

export interface CFrameLike {
    vectorToWorldSpace?(vec: Vector3): Vector3;
    mulVector?(vec: Vector3): Vector3;
}

export type ClockFn = () => number;
export type RandomFn = (mean: number, variance: number) => number;

const AXIS_VECTORS: Record<'x' | 'y' | 'z', Vector3> = {
    x: new Vector3(1, 0, 0),
    y: new Vector3(0, 1, 0),
    z: new Vector3(0, 0, 1)
};

const ALL_AXES: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];

function extractRecoveryLayers(data: RecoilAxisRecoveryParameters | undefined): RecoilRecoveryTuple[] {
    if (!data) return [];
    if (Array.isArray(data)) {
        return data as RecoilRecoveryTuple[];
    }
    if (typeof data === 'object' && data !== null && Array.isArray((data as RecoveryAxisData).a)) {
        return (data as RecoveryAxisData).a!;
    }
    return [];
}

function extractRecoveryDelay(data: RecoilAxisRecoveryParameters | undefined): number {
    if (!data || Array.isArray(data)) return 0;
    const obj = data as RecoveryAxisData;
    if (obj.d && typeof obj.d.delay === 'number') {
        return obj.d.delay;
    }
    if (typeof obj.delay === 'number') {
        return obj.delay;
    }
    return 0;
}

export class RecoilSprings {
    private _hipParameters: RecoilAxisParameters;
    private _aimParameters: RecoilAxisParameters;
    private _hipRecoveryParameters: RecoilRecoveryParameters;
    private _aimRecoveryParameters: RecoilRecoveryParameters;

    private _lastImpulseTime: number = 0;
    private _lastAimState: boolean = false;
    private _vector3Springs: Vector3Spring[] = [];
    private _springLastTimes: number[] = [];

    private _clock: ClockFn;
    private _rng: RandomFn;

    constructor(
        hipParameters?: RecoilAxisParameters,
        aimParameters?: RecoilAxisParameters,
        hipRecoveryParameters?: RecoilRecoveryParameters,
        aimRecoveryParameters?: RecoilRecoveryParameters,
        clock?: ClockFn,
        rng?: RandomFn
    ) {
        this._hipParameters = hipParameters || {};
        this._aimParameters = aimParameters || {};
        this._hipRecoveryParameters = hipRecoveryParameters || {};
        this._aimRecoveryParameters = aimRecoveryParameters || {};

        this._clock = clock || (() => 0);
        this._rng = rng || ((mean: number, variance: number) => variance * 2 * Math.random() - variance + mean);

        this.setVectorParameters(this._hipParameters);
    }

    private syncSpring(index: number, currentTime: number): void {
        const spring = this._vector3Springs[index];
        if (!spring) return;
        const lastTime = this._springLastTimes[index] ?? 0;
        if (currentTime > lastTime) {
            const dt = currentTime - lastTime;
            spring.update(dt);
            this._springLastTimes[index] = currentTime;
        }
    }

    public getP(currentTime?: number): Vector3 {
        const now = currentTime ?? this._clock();
        let sum = Vector3.ZERO;

        for (let i = 0; i < this._vector3Springs.length; i++) {
            this.syncSpring(i, now);
            sum = sum.add(this._vector3Springs[i].p);
        }

        return sum;
    }

    public getV(currentTime?: number): Vector3 {
        const now = currentTime ?? this._clock();
        let sum = Vector3.ZERO;

        for (let i = 0; i < this._vector3Springs.length; i++) {
            this.syncSpring(i, now);
            sum = sum.add(this._vector3Springs[i].v);
        }

        return sum;
    }

    public get springCount(): number {
        return this._vector3Springs.length;
    }

    public get hasSprings(): boolean {
        return this._vector3Springs.length > 0;
    }

    public getUniformDist(mean: number, variance: number): number {
        return this._rng(mean, variance);
    }

    public setVectorParameters(params: RecoilAxisParameters, currentTime?: number): void {
        const now = currentTime ?? this._clock();

        // 1. Ensure required Vector3Spring instances exist for each layer
        for (const axis of ALL_AXES) {
            const layers = params[axis];
            if (layers) {
                for (let i = 0; i < layers.length; i++) {
                    if (!this._vector3Springs[i]) {
                        this._vector3Springs[i] = new Vector3Spring();
                        this._springLastTimes[i] = now;
                    }
                }
            }
        }

        // 2. Set damping/speed parameters across all layers
        for (let i = 0; i < this._vector3Springs.length; i++) {
            this.syncSpring(i, now);
            const spring = this._vector3Springs[i];
            let d = spring.d;
            let s = spring.s;

            for (const axis of ALL_AXES) {
                const axisDir = AXIS_VECTORS[axis];
                const layers = params[axis];
                if (layers && layers[i]) {
                    const layer = layers[i];
                    // d = d * (1 - axisDir) + layer[0] * axisDir
                    d = d.mul(Vector3.ONE.sub(axisDir)).add(axisDir.mul(layer[0]));
                    // s = s * (1 - axisDir) + layer[1] * axisDir
                    s = s.mul(Vector3.ONE.sub(axisDir)).add(axisDir.mul(layer[1]));
                }
            }

            spring.d = d;
            spring.s = s;
        }
    }

    public setSingleAxisParameters(
        params: RecoilRecoveryParameters,
        axis: 'x' | 'y' | 'z',
        currentTime?: number
    ): void {
        const now = currentTime ?? this._clock();
        const axisDir = AXIS_VECTORS[axis];
        const recoveryLayers = extractRecoveryLayers(params[axis]);

        for (let i = 0; i < this._vector3Springs.length; i++) {
            const spring = this._vector3Springs[i];
            if (recoveryLayers[i]) {
                this.syncSpring(i, now);
                const layer = recoveryLayers[i];
                let d = spring.d;
                let s = spring.s;

                d = d.mul(Vector3.ONE.sub(axisDir)).add(axisDir.mul(layer[0]));
                s = s.mul(Vector3.ONE.sub(axisDir)).add(axisDir.mul(layer[1]));

                spring.d = d;
                spring.s = s;
            }
        }
    }

    public setAim(aimState: boolean, currentTime?: number): RecoilAxisParameters {
        const params = aimState ? this._aimParameters : this._hipParameters;
        this._lastAimState = aimState;
        this.setVectorParameters(params, currentTime);
        return params;
    }

    public applyImpulse(cframe?: CFrameLike | null, multiplier?: number, currentTime?: number): void {
        const now = currentTime ?? this._clock();
        const mult = multiplier ?? 1;
        const currentParams = this.setAim(this._lastAimState, now);

        for (let i = 0; i < this._vector3Springs.length; i++) {
            this.syncSpring(i, now);
            const spring = this._vector3Springs[i];
            let impulse = Vector3.ZERO;

            for (const axis of ALL_AXES) {
                const axisDir = AXIS_VECTORS[axis];
                const layers = currentParams[axis];
                if (layers && layers[i]) {
                    const layer = layers[i];
                    const val = this.getUniformDist(layer[2], layer[3]);
                    impulse = impulse.add(axisDir.mul(val));
                }
            }

            // Transform impulse by cframe if provided
            let transformedImpulse = impulse;
            if (cframe) {
                if (typeof cframe.vectorToWorldSpace === 'function') {
                    transformedImpulse = cframe.vectorToWorldSpace(impulse);
                } else if (typeof cframe.mulVector === 'function') {
                    transformedImpulse = cframe.mulVector(impulse);
                }
            }

            transformedImpulse = transformedImpulse.mul(mult);
            spring.v = spring.v.add(transformedImpulse);
        }

        this._lastImpulseTime = now;
    }

    public step(currentTime?: number): void {
        const now = currentTime ?? this._clock();

        for (let i = 0; i < this._vector3Springs.length; i++) {
            this.syncSpring(i, now);
        }

        const recoveryParams = this._lastAimState ? this._aimRecoveryParameters : this._hipRecoveryParameters;
        if (!recoveryParams) return;

        for (const axis of ALL_AXES) {
            const axisRecoveryData = recoveryParams[axis];
            if (axisRecoveryData) {
                const delay = extractRecoveryDelay(axisRecoveryData);
                if (this._lastImpulseTime + delay < now) {
                    this.setSingleAxisParameters(recoveryParams, axis, now);
                }
            }
        }
    }

    public get lastImpulseTime(): number {
        return this._lastImpulseTime;
    }

    public get lastAimState(): boolean {
        return this._lastAimState;
    }

    public get vector3Springs(): readonly Vector3Spring[] {
        return this._vector3Springs;
    }
}
