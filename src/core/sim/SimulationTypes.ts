/**
 * SimulationTypes.ts
 *
 * Core type definitions for the deterministic virtual-time recoil simulation loop.
 * Conforms 100% to simulation_loop_spec_vfinal.md.
 */

import { Vector3, CFrame } from '../math';
import type { StanceMode, DeviceType } from '../recoil/FirearmObjectRecoil';

export { StanceMode, DeviceType };

/**
 * Deterministic Simulation Events queued in Virtual Time.
 */
export type SimEvent =
    | { type: 'AIM_INPUT'; timestamp: number; aiming: boolean }
    | { type: 'FIRE_INPUT'; timestamp: number }
    | { type: 'RECOIL_IMPULSE'; timestamp: number; aimProgressAtFire: number }
    | { type: 'SHOT_GENERATE'; timestamp: number; fireCount: number; aimProgressAtFire: number }
    | { type: 'STEP'; timestamp: number };

/**
 * Snapshot representing a Physical Shot generated at t_shot (t_fire + firedelay).
 * Note: CameraHead has ZERO presence in PhysicalShotSnapshot (0% influence on origin/direction).
 */
export interface PhysicalShotSnapshot {
    readonly timestamp: number;
    readonly fireCount: number;
    readonly aimProgressAtFire: number;

    /** Physical shot origin in world space (u341 or v474.p) */
    readonly origin: Vector3;

    /** Physical shot direction in world space (normalized unit vector including spread) */
    readonly direction: Vector3;

    /** Barrel / Sight CFrame in world space (v474 = C_root * _mainC0 * offset) */
    readonly v474: CFrame;

    /** Physical recoil spring states at t_shot */
    readonly cameraBodyRecoilVec: Vector3;
    readonly translationRecoilVec: Vector3;
    readonly rotationRecoilVec: Vector3;
    readonly rotationRecoilVelVec?: Vector3;
    readonly spreadSpringVec: Vector3;
}

/**
 * Snapshot representing Player View & Camera state at any virtual timestamp t.
 * Includes CameraHead (v187) for visual camera presentation.
 */
export interface PlayerViewSnapshot {
    readonly timestamp: number;
    readonly baseCameraOrientation: CFrame; // v185
    readonly v186: CFrame;                   // v185 * bodyRecoilCF
    readonly shakeCFrame: CFrame;             // v186 + positionOffset
    readonly v187: CFrame;                   // v186 * headRecoilCF + positionOffset
    readonly cameraBodyRecoilVec: Vector3;
    readonly cameraHeadRecoilVec: Vector3;
}

/**
 * Firearm Cooldown & Recoil State
 */
export interface FirearmState {
    /** Corresponds to PF _nextShot (persistent firearm cooldown property) */
    nextShotTime: number;

    /** Corresponds to PF _fireCount */
    fireCount: number;

    /** Corresponds to PF _firemodeStability */
    firemodeStability: number;

    /** Single action ready state */
    singleActionReady: boolean;
}

/**
 * Complete Simulation Engine Config
 */
export interface SimulationEngineConfig {
    weaponData: Record<string, any>;
    seed?: number;

    rootCFrame?: CFrame;
    baseCameraOrientation?: CFrame;
    positionOffset?: Vector3;

    mainOffset?: CFrame;
    barrelOffset?: CFrame;
    sightOffset?: CFrame;

    aimSpeed?: number;
    firemodeDamping?: number;
}
