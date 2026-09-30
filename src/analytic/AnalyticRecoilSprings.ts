import { Vector3, CFrame } from '../core/math';
import { AnalyticVectorSpring } from './AnalyticSpring';
import {
    RecoilAxisParameters,
    RecoilRecoveryParameters,
    RecoilLayerTuple,
    RecoilRecoveryTuple,
    RecoveryAxisData,
    CFrameLike
} from '../core/recoil/RecoilSprings';

export type AnalyticRngFn = (mean: number, variance: number) => number;

const AXIS_VECTORS: Record<'x' | 'y' | 'z', Vector3> = {
    x: new Vector3(1, 0, 0),
    y: new Vector3(0, 1, 0),
    z: new Vector3(0, 0, 1)
};

const ALL_AXES: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];

function extractRecoveryLayers(data: any): RecoilRecoveryTuple[] {
    if (!data) return [];
    if (Array.isArray(data)) {
        return data as RecoilRecoveryTuple[];
    }
    if (typeof data === 'object' && data !== null && Array.isArray((data as RecoveryAxisData).a)) {
        return (data as RecoveryAxisData).a!;
    }
    return [];
}

function extractRecoveryDelay(data: any): number {
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

/**
 * Independent Analytic RecoilSprings:
 * Models multi-layered Vector3 springs and recovery transitions analytically without Euler integration.
 */
export class AnalyticRecoilSprings {
    private _hipParameters: RecoilAxisParameters;
    private _aimParameters: RecoilAxisParameters;
    private _hipRecoveryParameters: RecoilRecoveryParameters;
    private _aimRecoveryParameters: RecoilRecoveryParameters;

    private _vectorSprings: AnalyticVectorSpring[] = [];
    private _lastImpulseTime: number = 0;
    private _lastAimState: boolean = false;
    private _axisRecovered: Record<'x' | 'y' | 'z', boolean> = { x: false, y: false, z: false };

    private _rng: AnalyticRngFn;

    constructor(
        hipParameters?: RecoilAxisParameters,
        aimParameters?: RecoilAxisParameters,
        hipRecoveryParameters?: RecoilRecoveryParameters,
        aimRecoveryParameters?: RecoilRecoveryParameters,
        rng?: AnalyticRngFn
    ) {
        this._hipParameters = hipParameters || {};
        this._aimParameters = aimParameters || {};
        this._hipRecoveryParameters = hipRecoveryParameters || {};
        this._aimRecoveryParameters = aimRecoveryParameters || {};
        this._rng = rng || ((mean: number, variance: number) => mean + variance * (2 * Math.random() - 1));

        this.initLayers(this._hipParameters, 0);
    }

    public get lastImpulseTime(): number { return this._lastImpulseTime; }
    public get lastAimState(): boolean { return this._lastAimState; }
    public get vectorSprings(): readonly AnalyticVectorSpring[] { return this._vectorSprings; }

    private initLayers(params: RecoilAxisParameters, t: number): void {
        let maxLayers = 0;
        for (const axis of ALL_AXES) {
            const layers = params[axis];
            if (layers && layers.length > maxLayers) {
                maxLayers = layers.length;
            }
        }

        while (this._vectorSprings.length < maxLayers) {
            this._vectorSprings.push(new AnalyticVectorSpring(Vector3.ZERO, Vector3.ONE, Vector3.ONE, Vector3.ZERO, t));
        }

        this.applyLayerParameters(params, t);
    }

    private applyLayerParameters(params: RecoilAxisParameters, t: number): void {
        for (let i = 0; i < this._vectorSprings.length; i++) {
            const spring = this._vectorSprings[i];
            for (const axis of ALL_AXES) {
                const layers = params[axis];
                if (layers && layers[i]) {
                    const layer = layers[i];
                    spring.setAxisParameters(axis, layer[0], layer[1], t);
                }
            }
        }
    }

    public setAim(aimState: boolean, t: number): RecoilAxisParameters {
        const params = aimState ? this._aimParameters : this._hipParameters;
        this._lastAimState = aimState;
        this.applyLayerParameters(params, t);
        for (const axis of ALL_AXES) {
            this._axisRecovered[axis] = false;
        }
        return params;
    }

    public applyImpulse(cframe: CFrameLike | null = null, multiplier: number = 1.0, t: number = 0): void {
        const currentParams = this.setAim(this._lastAimState, t);

        for (let i = 0; i < this._vectorSprings.length; i++) {
            const spring = this._vectorSprings[i];
            let impulse = Vector3.ZERO;

            for (const axis of ALL_AXES) {
                const axisDir = AXIS_VECTORS[axis];
                const layers = currentParams[axis];
                if (layers && layers[i]) {
                    const layer = layers[i];
                    const val = this._rng(layer[2], layer[3]);
                    impulse = impulse.add(axisDir.mul(val));
                }
            }

            let transformed = impulse;
            if (cframe) {
                if (typeof cframe.vectorToWorldSpace === 'function') {
                    transformed = cframe.vectorToWorldSpace(impulse);
                } else if (typeof cframe.mulVector === 'function') {
                    transformed = cframe.mulVector(impulse);
                }
            }

            transformed = transformed.mul(multiplier);
            spring.accelerate(transformed, t);
        }

        this._lastImpulseTime = t;
        for (const axis of ALL_AXES) {
            this._axisRecovered[axis] = false;
        }
    }

    /**
     * Checks and applies recovery transitions analytically at timestamp t.
     */
    public checkRecovery(t: number): void {
        const recoveryParams = this._lastAimState ? this._aimRecoveryParameters : this._hipRecoveryParameters;
        if (!recoveryParams) return;

        for (const axis of ALL_AXES) {
            const axisRecoveryData = recoveryParams[axis];
            if (axisRecoveryData && !this._axisRecovered[axis]) {
                const delay = extractRecoveryDelay(axisRecoveryData);
                if (this._lastImpulseTime + delay < t) {
                    const recoveryLayers = extractRecoveryLayers(axisRecoveryData);
                    for (let i = 0; i < this._vectorSprings.length; i++) {
                        if (recoveryLayers[i]) {
                            const layer = recoveryLayers[i];
                            this._vectorSprings[i].setAxisParameters(axis, layer[0], layer[1], t);
                        }
                    }
                    this._axisRecovered[axis] = true;
                }
            }
        }
    }

    /**
     * Evaluates total accumulated recoil position p(t) across all layers.
     */
    public getP(t: number): Vector3 {
        this.checkRecovery(t);
        let sum = Vector3.ZERO;
        for (let i = 0; i < this._vectorSprings.length; i++) {
            sum = sum.add(this._vectorSprings[i].evaluate(t).p);
        }
        return sum;
    }

    /**
     * Evaluates total accumulated recoil velocity v(t) across all layers.
     */
    public getV(t: number): Vector3 {
        this.checkRecovery(t);
        let sum = Vector3.ZERO;
        for (let i = 0; i < this._vectorSprings.length; i++) {
            sum = sum.add(this._vectorSprings[i].evaluate(t).v);
        }
        return sum;
    }

    public getPositionsAndVelocities(t: number): { p: Vector3; v: Vector3 } {
        this.checkRecovery(t);
        let sumP = Vector3.ZERO;
        let sumV = Vector3.ZERO;
        for (let i = 0; i < this._vectorSprings.length; i++) {
            const res = this._vectorSprings[i].evaluate(t);
            sumP = sumP.add(res.p);
            sumV = sumV.add(res.v);
        }
        return { p: sumP, v: sumV };
    }
}
