// PF Source:
// ClientModules.Weapons.Firearm.FirearmObject.lua (Recoil Related Logic)
// ClientModules.Weapons.RecoilSprings.lua

import { Vector3 } from '../math';
import { RecoilSprings, ClockFn, RandomFn, RecoilAxisParameters, RecoilRecoveryParameters } from './RecoilSprings';

export type StanceMode = 'stand' | 'crouch' | 'prone';
export type DeviceType = 'mouse' | 'touch' | 'controller';

export interface FireResult {
    impulseTime: number;
    weightMult: number;
    cameraRecoilMult: number;
}

export class FirearmObjectRecoil {
    private _weaponData: Record<string, any>;
    private _translationSprings: RecoilSprings;
    private _rotationSprings: RecoilSprings;

    private _aiming: boolean = false;
    private _stance: StanceMode = 'stand';
    private _device: DeviceType = 'mouse';
    private _firemodeStability: number = 0;

    private _clock: ClockFn;
    private _rng: RandomFn;

    constructor(
        weaponData: Record<string, any>,
        clock?: ClockFn,
        rng?: RandomFn
    ) {
        this._weaponData = weaponData;
        this._clock = clock || (() => 0);
        this._rng = rng || ((mean: number, variance: number) => variance * 2 * Math.random() - variance + mean);

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

        this._translationSprings = new RecoilSprings(
            recoil.hipTranslation,
            recoil.aimTranslation,
            recoil.hipTranslationRecovery,
            recoil.aimTranslationRecovery,
            this._clock,
            this._rng
        );

        this._rotationSprings = new RecoilSprings(
            recoil.hipRotation,
            recoil.aimRotation,
            recoil.hipRotationRecovery,
            recoil.aimRotationRecovery,
            this._clock,
            this._rng
        );
    }

    public isAiming(): boolean {
        return this._aiming;
    }

    public setAim(aimState: boolean, currentTime?: number): void {
        this._aiming = aimState;
        this._translationSprings.setAim(aimState, currentTime);
        this._rotationSprings.setAim(aimState, currentTime);
    }

    public getStance(): StanceMode {
        return this._stance;
    }

    public setStance(stance: StanceMode): void {
        this._stance = stance;
    }

    public getDevice(): DeviceType {
        return this._device;
    }

    public setDevice(device: DeviceType): void {
        this._device = device;
    }

    public getFiremodeStability(): number {
        return this._firemodeStability;
    }

    public setFiremodeStability(stability: number): void {
        this._firemodeStability = stability;
    }

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

    public fire(currentTime?: number): FireResult {
        const now = currentTime ?? this._clock();
        const recoilDelay = this.getRecoilDelay();
        const impulseTime = now + recoilDelay;
        const weightMult = this.computeWeightRecoilMult();
        const cameraRecoilMult = this.computeCameraRecoilMultiplier();

        // Impulse application to translation and rotation springs
        this._translationSprings.applyImpulse(null, weightMult, impulseTime);
        this._rotationSprings.applyImpulse(null, weightMult, impulseTime);

        return {
            impulseTime,
            weightMult,
            cameraRecoilMult
        };
    }

    public step(currentTime?: number): void {
        const now = currentTime ?? this._clock();
        this._translationSprings.step(now);
        this._rotationSprings.step(now);
    }

    public getPositions(currentTime?: number): { translation: Vector3; rotation: Vector3 } {
        const now = currentTime ?? this._clock();
        return {
            translation: this._translationSprings.getP(now),
            rotation: this._rotationSprings.getP(now)
        };
    }

    public getPositionsAndVelocities(currentTime?: number): {
        translation: Vector3;
        rotation: Vector3;
        translationVel: Vector3;
        rotationVel: Vector3;
    } {
        const now = currentTime ?? this._clock();
        return {
            translation: this._translationSprings.getP(now),
            rotation: this._rotationSprings.getP(now),
            translationVel: this._translationSprings.getV(now),
            rotationVel: this._rotationSprings.getV(now)
        };
    }

    public get translationSprings(): RecoilSprings {
        return this._translationSprings;
    }

    public get rotationSprings(): RecoilSprings {
        return this._rotationSprings;
    }

    public get weaponData(): Record<string, any> {
        return this._weaponData;
    }

    public get hasSprings(): boolean {
        return this._translationSprings.hasSprings || this._rotationSprings.hasSprings;
    }

    public get hasValidRecoil(): boolean {
        return this._weaponData.recoil !== null &&
            this._weaponData.recoil !== undefined &&
            this.hasSprings;
    }

    public get recoilVerificationStatus(): {
        status: 'VERIFIED' | 'UNVERIFIED_11_17' | 'INHERITED_FROM_11_16' | 'MISSING_RECOIL_DATA';
        reason?: string;
    } {
        if (this._weaponData.recoil === null || this._weaponData.recoil === undefined) {
            return {
                status: 'UNVERIFIED_11_17',
                reason: 'RECOIL_DATA_MISSING'
            };
        }
        if (!this.hasSprings) {
            return {
                status: 'MISSING_RECOIL_DATA',
                reason: 'RECOIL_SPRINGS_EMPTY'
            };
        }
        const provRecoil = this._weaponData._provenance?.recoil_springs;
        if (provRecoil === 'INHERITED_FROM_11_16') {
            return {
                status: 'INHERITED_FROM_11_16',
                reason: 'INHERITED_FROM_11_16_BASELINE'
            };
        }
        if (provRecoil === 'UNVERIFIED_11_17') {
            return {
                status: 'UNVERIFIED_11_17',
                reason: 'PROVISIONAL_11_17_UNVERIFIED'
            };
        }
        return {
            status: 'VERIFIED'
        };
    }
}
