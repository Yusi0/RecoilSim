// PF Source:
// ClientModules.Camera.Types.MainCamera.MainCameraObject.lua
// ClientModules.Weapons.RecoilSprings.lua

import { Vector3, CFrame } from '../math';
import { RecoilSprings, ClockFn, RandomFn, RecoilAxisParameters, RecoilRecoveryParameters } from './RecoilSprings';

export interface CameraCFramesResult {
    bodyRecoilVec: Vector3;
    headRecoilVec: Vector3;
    v186: CFrame;
    shakeCFrame: CFrame;
    v187: CFrame;
}

export class MainCameraObjectRecoil {
    private _cameraBodySprings: RecoilSprings;
    private _cameraHeadSprings: RecoilSprings;

    private _aiming: boolean = false;
    private _clock: ClockFn;
    private _rng: RandomFn;

    constructor(
        recoilData?: Record<string, any>,
        clock?: ClockFn,
        rng?: RandomFn
    ) {
        this._clock = clock || (() => 0);
        this._rng = rng || ((mean: number, variance: number) => variance * 2 * Math.random() - variance + mean);

        const recoil = recoilData ? (recoilData.camera || recoilData) : {};

        this._cameraBodySprings = new RecoilSprings(
            recoil.hipCameraBody,
            recoil.aimCameraBody,
            recoil.hipCameraBodyRecovery,
            recoil.aimCameraBodyRecovery,
            this._clock,
            this._rng
        );

        this._cameraHeadSprings = new RecoilSprings(
            recoil.hipCameraHead,
            recoil.aimCameraHead,
            recoil.hipCameraHeadRecovery,
            recoil.aimCameraHeadRecovery,
            this._clock,
            this._rng
        );
    }

    public setBodyParameters(
        hip?: RecoilAxisParameters,
        aim?: RecoilAxisParameters,
        hipRecovery?: RecoilRecoveryParameters,
        aimRecovery?: RecoilRecoveryParameters
    ): void {
        this._cameraBodySprings = new RecoilSprings(hip, aim, hipRecovery, aimRecovery, this._clock, this._rng);
    }

    public setHeadParameters(
        hip?: RecoilAxisParameters,
        aim?: RecoilAxisParameters,
        hipRecovery?: RecoilRecoveryParameters,
        aimRecovery?: RecoilRecoveryParameters
    ): void {
        this._cameraHeadSprings = new RecoilSprings(hip, aim, hipRecovery, aimRecovery, this._clock, this._rng);
    }

    public isAiming(): boolean {
        return this._aiming;
    }

    public setAim(aimState: boolean, currentTime?: number): void {
        this._aiming = aimState;
        this._cameraBodySprings.setAim(aimState, currentTime);
        this._cameraHeadSprings.setAim(aimState, currentTime);
    }

    public applyImpulse(multiplier: number = 1.0, currentTime?: number): void {
        // Lua MainCameraObject.lua line 316-319:
        // _cameraHeadSprings:applyImpulse(nil, mult)
        // _cameraBodySprings:applyImpulse(nil, mult)
        this._cameraHeadSprings.applyImpulse(null, multiplier, currentTime);
        this._cameraBodySprings.applyImpulse(null, multiplier, currentTime);
    }

    public step(currentTime?: number): void {
        const now = currentTime ?? this._clock();
        this._cameraBodySprings.step(now);
        this._cameraHeadSprings.step(now);
    }

    public computeCFrames(
        baseOrientationCFrame: CFrame = CFrame.IDENTITY,
        positionOffset: Vector3 = Vector3.ZERO,
        currentTime?: number
    ): CameraCFramesResult {
        const now = currentTime ?? this._clock();

        const bodyRecoilVec = this._cameraBodySprings.getP(now);
        const headRecoilVec = this._cameraHeadSprings.getP(now);

        const bodyRecoilCF = CFrame.fromAxisAngle(bodyRecoilVec);
        const headRecoilCF = CFrame.fromAxisAngle(headRecoilVec);

        // v186 = v185 * bodyRecoilCF
        const v186 = baseOrientationCFrame.mul(bodyRecoilCF);

        // _shakeCFrame = v186 + positionOffset (Viewmodel Reference Frame)
        const shakeCFrame = v186.addPos(positionOffset);

        // v187 = v186 * headRecoilCF + positionOffset (Final Camera CFrame)
        const v187 = v186.mul(headRecoilCF).addPos(positionOffset);

        return {
            bodyRecoilVec,
            headRecoilVec,
            v186,
            shakeCFrame,
            v187
        };
    }

    public get cameraBodySprings(): RecoilSprings {
        return this._cameraBodySprings;
    }

    public get cameraHeadSprings(): RecoilSprings {
        return this._cameraHeadSprings;
    }

    public get hasSprings(): boolean {
        return this._cameraBodySprings.hasSprings || this._cameraHeadSprings.hasSprings;
    }
}
