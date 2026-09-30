import { Vector3 } from '../core/math';
import { AnalyticRecoilSprings, AnalyticRngFn } from './AnalyticRecoilSprings';
import { StanceMode, DeviceType } from './AnalyticTypes';
import { RecoilAxisParameters, RecoilRecoveryParameters } from '../core/recoil/RecoilSprings';

export interface AnalyticFireResult {
    impulseTime: number;
    weightMult: number;
    cameraRecoilMult: number;
}

/**
 * Independent Analytic Firearm Recoil:
 * Manages translation & rotation recoil springs with stance, device, and firearm stability multipliers.
 */
export class AnalyticFirearmRecoil {
    private _weaponData: Record<string, any>;
    private _translationSprings: AnalyticRecoilSprings;
    private _rotationSprings: AnalyticRecoilSprings;

    private _aiming: boolean = false;
    private _stance: StanceMode = 'stand';
    private _device: DeviceType = 'mouse';
    private _firemodeStability: number = 0;

    constructor(weaponData: Record<string, any>, rng?: AnalyticRngFn) {
        this._weaponData = weaponData;

        const recoil = (weaponData.recoil || {}) as {
            hipTranslation?: RecoilAxisParameters;
            aimTranslation?: RecoilAxisParameters;
            hipTranslationRecovery?: RecoilRecoveryParameters;
            aimTranslationRecovery?: RecoilRecoveryParameters;
            hipRotation?: RecoilAxisParameters;
            aimRotation?: RecoilAxisParameters;
            hipRotationRecovery?: RecoilRecoveryParameters;
            aimRotationRecovery?: RecoilRecoveryParameters;
        };

        this._translationSprings = new AnalyticRecoilSprings(
            recoil.hipTranslation,
            recoil.aimTranslation,
            recoil.hipTranslationRecovery,
            recoil.aimTranslationRecovery,
            rng
        );

        this._rotationSprings = new AnalyticRecoilSprings(
            recoil.hipRotation,
            recoil.aimRotation,
            recoil.hipRotationRecovery,
            recoil.aimRotationRecovery,
            rng
        );
    }

    public get translationSprings(): AnalyticRecoilSprings { return this._translationSprings; }
    public get rotationSprings(): AnalyticRecoilSprings { return this._rotationSprings; }
    public get weaponData(): Record<string, any> { return this._weaponData; }

    public isAiming(): boolean { return this._aiming; }

    public setAim(aimState: boolean, t: number): void {
        this._aiming = aimState;
        this._translationSprings.setAim(aimState, t);
        this._rotationSprings.setAim(aimState, t);
    }

    public getStance(): StanceMode { return this._stance; }
    public setStance(stance: StanceMode): void { this._stance = stance; }

    public getDevice(): DeviceType { return this._device; }
    public setDevice(device: DeviceType): void { this._device = device; }

    public getFiremodeStability(): number { return this._firemodeStability; }
    public setFiremodeStability(stab: number): void { this._firemodeStability = stab; }

    public getWeaponStat<T = any>(statName: string): T | undefined {
        return (this._weaponData as any)[statName];
    }

    public computeStanceStability(): number {
        switch (this._stance) {
            case 'crouch': return 0.25;
            case 'prone': return 0.50;
            case 'stand':
            default: return 0.0;
        }
    }

    public computeDeviceMultiplier(): number {
        switch (this._device) {
            case 'touch': return 0.6;
            case 'controller': return 0.8;
            case 'mouse':
            default: return 1.0;
        }
    }

    public computeCameraRecoilMultiplier(): number {
        if (this.getWeaponStat<boolean>('disablecamerarecoil')) {
            return 0;
        }
        const stanceStab = this.computeStanceStability();
        const deviceMult = this.computeDeviceMultiplier();
        const camerarecoilmult = this.getWeaponStat<number>('camerarecoilmult') ?? 1.0;
        const totalStab = (1 - this._firemodeStability) * (1 - stanceStab) * deviceMult;
        return totalStab * camerarecoilmult;
    }

    public computeWeightRecoilMult(): number {
        const weightMult = this.getWeaponStat<number>('weightrecoilmult');
        return weightMult !== undefined ? weightMult : 1.0;
    }

    public getRecoilDelay(): number {
        const delay = this.getWeaponStat<number>('recoildelay');
        return delay !== undefined ? delay : 0.0;
    }

    public fire(t: number): AnalyticFireResult {
        const recoilDelay = this.getRecoilDelay();
        const impulseTime = t + recoilDelay;
        const weightMult = this.computeWeightRecoilMult();
        const cameraRecoilMult = this.computeCameraRecoilMultiplier();

        this._translationSprings.applyImpulse(null, weightMult, impulseTime);
        this._rotationSprings.applyImpulse(null, weightMult, impulseTime);

        return {
            impulseTime,
            weightMult,
            cameraRecoilMult
        };
    }

    public getPositions(t: number): { translation: Vector3; rotation: Vector3 } {
        return {
            translation: this._translationSprings.getP(t),
            rotation: this._rotationSprings.getP(t)
        };
    }

    public getPositionsAndVelocities(t: number): {
        translation: Vector3;
        rotation: Vector3;
        translationVel: Vector3;
        rotationVel: Vector3;
    } {
        const trans = this._translationSprings.getPositionsAndVelocities(t);
        const rot = this._rotationSprings.getPositionsAndVelocities(t);
        return {
            translation: trans.p,
            rotation: rot.p,
            translationVel: trans.v,
            rotationVel: rot.v
        };
    }
}
