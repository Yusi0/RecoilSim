import { Vector3, CFrame } from '../core/math';
import { AnalyticRecoilSprings, AnalyticRngFn } from './AnalyticRecoilSprings';

export interface AnalyticCameraCFrames {
    bodyRecoilVec: Vector3;
    headRecoilVec: Vector3;
    bodyRecoilVelVec: Vector3;
    headRecoilVelVec: Vector3;
    v186: CFrame;
    shakeCFrame: CFrame;
    v187: CFrame;
}

/**
 * Independent Analytic Camera Recoil:
 * Manages CameraBody (shakeCFrame for Viewmodel/WeaponPose) and CameraHead (final eye camera only).
 * Strictly maintains 0% CameraHead presence in WeaponPose/PhysicalShot.
 */
export class AnalyticCameraRecoil {
    private _cameraBodySprings: AnalyticRecoilSprings;
    private _cameraHeadSprings: AnalyticRecoilSprings;
    private _aiming: boolean = false;

    constructor(recoilData?: Record<string, any>, rng?: AnalyticRngFn) {
        const recoil = recoilData ? (recoilData.camera || recoilData) : {};

        this._cameraBodySprings = new AnalyticRecoilSprings(
            recoil.hipCameraBody,
            recoil.aimCameraBody,
            recoil.hipCameraBodyRecovery,
            recoil.aimCameraBodyRecovery,
            rng
        );

        this._cameraHeadSprings = new AnalyticRecoilSprings(
            recoil.hipCameraHead,
            recoil.aimCameraHead,
            recoil.hipCameraHeadRecovery,
            recoil.aimCameraHeadRecovery,
            rng
        );
    }

    public get cameraBodySprings(): AnalyticRecoilSprings { return this._cameraBodySprings; }
    public get cameraHeadSprings(): AnalyticRecoilSprings { return this._cameraHeadSprings; }

    public isAiming(): boolean { return this._aiming; }

    public setAim(aimState: boolean, t: number): void {
        this._aiming = aimState;
        this._cameraBodySprings.setAim(aimState, t);
        this._cameraHeadSprings.setAim(aimState, t);
    }

    public applyImpulse(multiplier: number = 1.0, t: number = 0): void {
        this._cameraHeadSprings.applyImpulse(null, multiplier, t);
        this._cameraBodySprings.applyImpulse(null, multiplier, t);
    }

    public computeCFrames(
        baseOrientation: CFrame = CFrame.IDENTITY,
        positionOffset: Vector3 = Vector3.ZERO,
        t: number = 0
    ): AnalyticCameraCFrames {
        const bodyPV = this._cameraBodySprings.getPositionsAndVelocities(t);
        const headPV = this._cameraHeadSprings.getPositionsAndVelocities(t);

        const bodyRecoilVec = bodyPV.p;
        const headRecoilVec = headPV.p;
        const bodyRecoilVelVec = bodyPV.v;
        const headRecoilVelVec = headPV.v;

        const bodyRecoilCF = CFrame.fromAxisAngle(bodyRecoilVec);
        const headRecoilCF = CFrame.fromAxisAngle(headRecoilVec);

        // v186 = baseOrientation * bodyRecoilCF
        const v186 = baseOrientation.mul(bodyRecoilCF);

        // shakeCFrame = v186 + positionOffset (Authoritative Viewmodel/WeaponPose anchor)
        const shakeCFrame = v186.addPos(positionOffset);

        // v187 = v186 * headRecoilCF + positionOffset (Final visual camera ONLY)
        const v187 = v186.mul(headRecoilCF).addPos(positionOffset);

        return {
            bodyRecoilVec,
            headRecoilVec,
            bodyRecoilVelVec,
            headRecoilVelVec,
            v186,
            shakeCFrame,
            v187
        };
    }
}
