import { Vector3, CFrame } from '../core/math';
import { AnalyticScalarSpring, AnalyticVectorSpring } from './AnalyticSpring';
import { AnalyticFirearmRecoil } from './AnalyticFirearmRecoil';
import { AnalyticCameraRecoil } from './AnalyticCameraRecoil';
import {
    AnalyticConfig,
    AnalyticShotSnapshot,
    AnalyticWeaponPose,
    StanceMode,
    DeviceType
} from './AnalyticTypes';

/**
 * Independent Mulberry32 PRNG for pure analytical deterministic reproducibility.
 */
export class AnalyticPRNG {
    private _state: number;

    constructor(seed: number = 1337) {
        this._state = seed >>> 0;
    }

    public nextFloat(): number {
        let t = (this._state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    public range(min: number, max: number): number {
        return min + (max - min) * this.nextFloat();
    }

    public recoilRandom(mean: number, variance: number): number {
        return variance * 2 * this.nextFloat() - variance + mean;
    }
}

/**
 * Independent Analytic Model:
 * Closed-form, pure mathematical reference model of Phantom Forces recoil mechanics.
 * Computes all spring states, weapon poses, and shot trajectories analytically.
 */
export class AnalyticModel {
    private _config: AnalyticConfig;
    private _prng: AnalyticPRNG;

    private _firearmRecoil: AnalyticFirearmRecoil;
    private _cameraRecoil: AnalyticCameraRecoil;

    private _aimSpring: AnalyticScalarSpring;
    private _spreadSpring: AnalyticVectorSpring;

    private _stance: StanceMode = 'stand';
    private _device: DeviceType = 'mouse';
    private _firemodeStability: number = 0;
    private _firemodeDamping: number;

    private _nextShotTime: number = 0;
    private _fireCount: number = 0;

    private _rootCFrame: CFrame;
    private _baseCameraOrientation: CFrame;
    private _positionOffset: Vector3;
    private _mainOffset: CFrame;
    private _hipOffset?: CFrame;
    private _aimOffset?: CFrame;
    private _barrelOffset: CFrame;
    private _sightOffset: CFrame;

    private _shots: AnalyticShotSnapshot[] = [];

    constructor(config: AnalyticConfig) {
        this._config = config;
        this._prng = new AnalyticPRNG(config.seed ?? 1337);

        const rngFn = (mean: number, variance: number) => this._prng.recoilRandom(mean, variance);

        this._firearmRecoil = new AnalyticFirearmRecoil(config.weaponData, rngFn);
        this._cameraRecoil = new AnalyticCameraRecoil(
            config.weaponData.cameraRecoil || config.weaponData.recoil,
            rngFn
        );

        const aimSpeed = config.aimSpeed ?? (config.weaponData.aimspeed ?? 15);
        this._aimSpring = new AnalyticScalarSpring(0, 1.0, aimSpeed, 0, 0);

        const spreadRecover = this._firearmRecoil.getWeaponStat<number>('hipfirespreadrecover') ?? 1.0;
        const spreadStability = this._firearmRecoil.getWeaponStat<number>('hipfirestability') ?? 0.7;

        this._spreadSpring = new AnalyticVectorSpring(
            Vector3.ZERO,
            new Vector3(spreadStability, spreadStability, spreadStability),
            new Vector3(spreadRecover, spreadRecover, spreadRecover),
            Vector3.ZERO,
            0
        );

        this._firemodeDamping = config.firemodeDamping ?? (config.weaponData.firemodedamping ?? 0.9);

        this._rootCFrame = config.rootCFrame || CFrame.IDENTITY;
        this._baseCameraOrientation = config.baseCameraOrientation || CFrame.IDENTITY;
        this._positionOffset = config.positionOffset || Vector3.ZERO;
        this._mainOffset = config.mainOffset || CFrame.IDENTITY;
        this._hipOffset = config.hipOffset;
        this._aimOffset = config.aimOffset;
        this._barrelOffset = config.barrelOffset || CFrame.IDENTITY;
        this._sightOffset = config.sightOffset || CFrame.IDENTITY;
    }

    public get firearmRecoil(): AnalyticFirearmRecoil { return this._firearmRecoil; }
    public get cameraRecoil(): AnalyticCameraRecoil { return this._cameraRecoil; }
    public get aimSpring(): AnalyticScalarSpring { return this._aimSpring; }
    public get spreadSpring(): AnalyticVectorSpring { return this._spreadSpring; }
    public get shots(): readonly AnalyticShotSnapshot[] { return this._shots; }
    public get nextShotTime(): number { return this._nextShotTime; }
    public get fireCount(): number { return this._fireCount; }

    public setStance(stance: StanceMode): void {
        this._stance = stance;
        this._firearmRecoil.setStance(stance);
    }

    public setDevice(device: DeviceType): void {
        this._device = device;
        this._firearmRecoil.setDevice(device);
    }

    public setAim(aiming: boolean, t: number): void {
        this._aimSpring.setTarget(aiming ? 1 : 0, t);
        this._firearmRecoil.setAim(aiming, t);
        this._cameraRecoil.setAim(aiming, t);
    }

    public getAimProgress(t: number): number {
        return this._aimSpring.evaluate(t).p;
    }

    public isAiming(t: number): boolean {
        return this.getAimProgress(t) > 0.5;
    }

    public canFire(t: number): boolean {
        return t >= (this._nextShotTime - 1e-9);
    }

    /**
     * Executes a single round fire analytically at virtual timestamp t.
     */
    public fireSingle(t: number): AnalyticShotSnapshot | null {
        if (!this.canFire(t)) {
            return null;
        }

        const aimProgressAtFire = this._aimSpring.evaluate(t).p;

        const firerate = (aimProgressAtFire > 0.5 ? this._firearmRecoil.getWeaponStat<number>('aimedfirerate') : undefined)
            ?? (this._firearmRecoil.getWeaponStat<number>('firerate') ?? 600);
        const recoildelay = this._firearmRecoil.getRecoilDelay();
        const firedelay = this._firearmRecoil.getWeaponStat<number>('firedelay') ?? 0;

        const fireInterval = 60 / firerate;
        this._nextShotTime = t + fireInterval;

        // Recoil impulse application at t + recoildelay
        const impulseTime = t + recoildelay;
        this._firearmRecoil.setStance(this._stance);
        this._firearmRecoil.setDevice(this._device);
        this._firearmRecoil.setFiremodeStability(this._firemodeStability);

        const weightMult = this._firearmRecoil.computeWeightRecoilMult();
        const cameraRecoilMult = this._firearmRecoil.computeCameraRecoilMultiplier();

        this._firearmRecoil.fire(t);
        this._cameraRecoil.applyImpulse(cameraRecoilMult, impulseTime);

        // Spread spring impulse
        const stanceStab = this._firearmRecoil.computeStanceStability();
        const hipfirespread = this._firearmRecoil.getWeaponStat<number>('hipfirespread') ?? 1.0;
        const hipfirespreadrecover = this._firearmRecoil.getWeaponStat<number>('hipfirespreadrecover') ?? 1.0;

        const spreadMagnitude = 0.5 * (1 - aimProgressAtFire) * (1 - stanceStab) * hipfirespread * hipfirespreadrecover;
        const randX = this._prng.range(-1, 1);
        const randY = this._prng.range(-1, 1);
        this._spreadSpring.accelerate(new Vector3(spreadMagnitude * randX, spreadMagnitude * randY, 0), impulseTime);

        this._firemodeStability *= this._firemodeDamping;

        // Shot generation at t + firedelay
        const shotTime = t + firedelay;
        const pose = this.getWeaponPose(shotTime);
        const v474 = pose.v474;
        const origin = v474.p;

        const spreadStat = this._firearmRecoil.getWeaponStat<number>('spread') ?? 0;
        let dir = pose.barrelForward;

        if (spreadStat > 0) {
            const r1 = this._prng.nextFloat();
            const r2 = this._prng.nextFloat();
            const r = Math.sqrt(r1) * spreadStat;
            const theta = r2 * 2 * Math.PI;
            const dx = r * Math.cos(theta);
            const dy = r * Math.sin(theta);
            dir = v474.vectorToWorldSpace(new Vector3(dx, dy, -1)).unit;
        }

        const snapshot: AnalyticShotSnapshot = {
            shotIndex: this._fireCount,
            timestamp: shotTime,
            fireCount: this._fireCount,
            aimProgressAtFire,
            origin,
            direction: dir,
            v474,
            cameraBodyRecoilVec: pose.cameraBodyRecoilVec,
            cameraBodyRecoilVelVec: pose.cameraBodyRecoilVec, // available from pose or camCFs
            cameraHeadRecoilVec: pose.cameraHeadRecoilVec,
            translationRecoilVec: pose.translationRecoilVec,
            translationRecoilVelVec: pose.translationRecoilVec,
            rotationRecoilVec: pose.rotationRecoilVec,
            rotationRecoilVelVec: pose.rotationRecoilVelVec,
            spreadSpringVec: pose.spreadSpringVec,
            weaponPose: pose
        };

        this._shots.push(snapshot);
        this._fireCount++;

        return snapshot;
    }

    /**
     * Computes the authoritative WeaponPose at any timestamp t analytically.
     * Conforms 100% to PF _mainC0 / _mainWeld.C0.
     */
    public getWeaponPose(t: number): AnalyticWeaponPose {
        const cameraCFs = this._cameraRecoil.computeCFrames(this._baseCameraOrientation, this._positionOffset, t);
        const bodyRecoilVec = cameraCFs.bodyRecoilVec;
        const headRecoilVec = cameraCFs.headRecoilVec;
        const shakeCFrame = cameraCFs.shakeCFrame;

        const firearmPV = this._firearmRecoil.getPositionsAndVelocities(t);
        const translationRecoilVec = firearmPV.translation;
        const rotationRecoilVec = firearmPV.rotation;
        const rotationRecoilVelVec = firearmPV.rotationVel;
        const spreadSpringVec = this._spreadSpring.evaluate(t).p;

        const aimProgress = this._aimSpring.evaluate(t).p;
        const isAim = aimProgress > 0.5;

        const mainOffset = this._computeMainOffset(aimProgress);

        const mainC0 = shakeCFrame
            .mul(mainOffset)
            .mul(CFrame.fromAxisAngle(spreadSpringVec))
            .mul(CFrame.newPos(translationRecoilVec))
            .mul(CFrame.fromAxisAngle(rotationRecoilVec));

        const activeOffset = isAim ? this._sightOffset : this._barrelOffset;
        const weaponCFrame = this._rootCFrame.mul(mainC0);
        const v474 = weaponCFrame.mul(activeOffset);
        const forward = weaponCFrame.zVector.neg();
        const barrelForward = v474.zVector.neg();

        return {
            timestamp: t,
            mainC0,
            weaponCFrame,
            v474,
            forward,
            barrelForward,
            isAiming: isAim,
            aimProgress,
            cameraBodyRecoilVec: bodyRecoilVec,
            cameraHeadRecoilVec: headRecoilVec,
            translationRecoilVec,
            rotationRecoilVec,
            rotationRecoilVelVec,
            spreadSpringVec
        };
    }

    private _computeMainOffset(aimProgress: number): CFrame {
        if (this._hipOffset && this._aimOffset) {
            const hp = this._hipOffset.p;
            const ap = this._aimOffset.p;
            const x = hp.x + (ap.x - hp.x) * aimProgress;
            const y = hp.y + (ap.y - hp.y) * aimProgress;
            const z = hp.z + (ap.z - hp.z) * aimProgress;
            return new CFrame(this._mainOffset.r, new Vector3(x, y, z));
        }
        return this._mainOffset;
    }

    /**
     * Simulates an N-shot burst starting at startTime with precise fire intervals.
     */
    public simulateBurst(shotsCount: number, startTime: number = 0): AnalyticShotSnapshot[] {
        const results: AnalyticShotSnapshot[] = [];
        let t = startTime;

        for (let i = 0; i < shotsCount; i++) {
            const shot = this.fireSingle(t);
            if (shot) {
                results.push(shot);
                t = this._nextShotTime;
            } else {
                break;
            }
        }

        return results;
    }
}
