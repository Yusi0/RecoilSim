import { Vector3, CFrame } from '../core/math';
import { StanceMode, DeviceType } from '../core/recoil/FirearmObjectRecoil';

export type { StanceMode, DeviceType };

export interface AnalyticSpringState {
    p0: number;
    v0: number;
    t0: number;
    target: number;
    d: number;
    s: number;
}

export interface AnalyticVector3SpringState {
    x: AnalyticSpringState;
    y: AnalyticSpringState;
    z: AnalyticSpringState;
}

export interface AnalyticWeaponPose {
    timestamp: number;
    mainC0: CFrame;
    weaponCFrame: CFrame;
    v474: CFrame;
    forward: Vector3;
    barrelForward: Vector3;
    isAiming: boolean;
    aimProgress: number;
    cameraBodyRecoilVec: Vector3;
    cameraHeadRecoilVec: Vector3;
    translationRecoilVec: Vector3;
    rotationRecoilVec: Vector3;
    rotationRecoilVelVec: Vector3;
    spreadSpringVec: Vector3;
}

export interface AnalyticShotSnapshot {
    shotIndex: number;
    timestamp: number;
    fireCount: number;
    aimProgressAtFire: number;
    origin: Vector3;
    direction: Vector3;
    v474: CFrame;
    cameraBodyRecoilVec: Vector3;
    cameraBodyRecoilVelVec?: Vector3;
    cameraHeadRecoilVec: Vector3;
    cameraHeadRecoilVelVec?: Vector3;
    translationRecoilVec: Vector3;
    translationRecoilVelVec?: Vector3;
    rotationRecoilVec: Vector3;
    rotationRecoilVelVec: Vector3;
    spreadSpringVec: Vector3;
    weaponPose: AnalyticWeaponPose;
}

export interface AnalyticConfig {
    weaponData: Record<string, any>;
    seed?: number;
    randomSequence?: number[];
    rootCFrame?: CFrame;
    baseCameraOrientation?: CFrame;
    positionOffset?: Vector3;
    mainOffset?: CFrame;
    hipOffset?: CFrame;
    aimOffset?: CFrame;
    barrelOffset?: CFrame;
    sightOffset?: CFrame;
    aimSpeed?: number;
    firemodeDamping?: number;
}

export interface SubsystemErrorSummary {
    subsystem: string;
    maxAbsError: number;
    meanAbsError: number;
    unit: string;
    passed: boolean;
}

export interface ShotComparisonRecord {
    shotIndex: number;
    timestamp: number;
    simTimestamp: number;
    errors: {
        rotationP: number;
        rotationV: number;
        translationP: number;
        translationV: number;
        cameraBodyP: number;
        cameraBodyV: number;
        cameraHeadP: number;
        cameraHeadV: number;
        spreadSpringP: number;
        weaponPoseForwardAngleDeg: number;
        shotDirectionAngleDeg: number;
        originDistance: number;
    };
    divergence?: {
        subsystem: string;
        error: number;
        threshold: number;
    };
}

export interface ValidationReport {
    totalShots: number;
    passed: boolean;
    firstDivergenceShot: number | null;
    firstDivergenceSubsystem: string | null;
    subsystemSummaries: SubsystemErrorSummary[];
    shotRecords: ShotComparisonRecord[];
    formattedReport: string;
}
