import { Vector3, CFrame } from '../core/math';
import { StanceMode, DeviceType } from '../core/recoil/FirearmObjectRecoil';
import { SelectedAttachments } from '../core/compiler/WeaponCompiler';

export type { StanceMode, DeviceType, SelectedAttachments };

export interface MonteCarloConfig {
    weaponData: Record<string, any>;
    attachments?: SelectedAttachments;
    aiming?: boolean;      // true for ADS (default), false for hipfire
    /**
     * @deprecated Monte Carlo only evaluates binary states (aiming: true | false).
     * Partial aimProgress is unsupported in Monte Carlo.
     */
    aimProgress?: number;
    stance?: StanceMode;   // 'stand' | 'crouch' | 'prone', default 'stand'
    device?: DeviceType;   // 'mouse' | 'touch' | 'controller', default 'mouse'
    burstSize?: number;    // default 30
    /**
     * @deprecated Monte Carlo strictly uses authoritative weaponData firerate (or aimedfirerate when aiming).
     * Mismatched firerate overrides are rejected to prevent firing cooldown desync.
     */
    firerate?: number;
    trialCount: number;    // Number of trials (e.g. 10, 100, 1000)
    masterSeed: number;    // Master seed for deterministic trial seeds
    targetDistance?: number; // Distance in studs/meters to target plane, default 50
    settleTime?: number;   // Time for aim spring to settle before firing (default 0.3s for ADS, 0.0s for hipfire)
    initialAimProgress?: number; // Explicit initial aim progress (e.g. 1.0 for instant ADS 100%)
    maxStoredImpacts?: number; // Maximum number of raw impact points to store in result (default 1000, 0 for all)
    aimSpeed?: number;

    // Optional geometry overrides (passed to SimulationEngine)
    rootCFrame?: CFrame;
    baseCameraOrientation?: CFrame;
    positionOffset?: Vector3;
    mainOffset?: CFrame;
    hipOffset?: CFrame;
    aimOffset?: CFrame;
    barrelOffset?: CFrame;
    sightOffset?: CFrame;
}

export interface ImpactPoint {
    trialIndex: number;
    shotIndex: number;
    timestamp: number;
    x: number;
    y: number;
    targetZ: number;
    origin: Vector3;
    direction: Vector3;
}

export interface DriftMetrics {
    meanX: number;
    meanY: number;
    meanRadius: number; // Raw Euclidean distance from origin (0, 0)
}

export interface DispersionMetrics {
    stdX: number;
    stdY: number;
    radialStd: number;
    centeredMeanRadius: number;
    centeredMedianRadius: number;
    centeredP90Radius: number;
    centeredP95Radius: number;
    centeredMaxRadius: number;
}

export interface DispersionStatistics {
    sampleCount: number;

    // Center of mass / Drift (원점 기준)
    meanX: number;
    meanY: number;
    meanRadius: number;

    // Spread & Standard Deviation
    stdX: number;
    stdY: number;
    radialStd: number;

    // Percentiles from (0, 0)
    medianRadius: number; // 50th percentile
    p90Radius: number;    // 90th percentile
    p95Radius: number;    // 95th percentile
    maxRadius: number;

    // Centered dispersion from (meanX, meanY) (평균 탄착점 기준 분산)
    centeredMeanRadius: number;
    centeredMedianRadius: number;
    centeredP90Radius: number;
    centeredP95Radius: number;
    centeredMaxRadius: number;

    // Covariance & Area
    covarianceXY: number;
    estimatedDispersionArea: number; // pi * stdX * stdY

    // Distinct Drift vs Dispersion Breakdown
    drift: DriftMetrics;
    dispersion: DispersionMetrics;
}

export interface SimulationVerificationStatus {
    recoil: 'VERIFIED' | 'UNVERIFIED_11_17' | 'INHERITED_FROM_11_16' | 'MISSING_RECOIL_DATA';
    reason?: string;
    isRecoilSimulated: boolean;
    isOutdatedPhysics?: boolean;
    unsupportedWeapon?: boolean;
    unsupportedReason?: string;
}

export interface MonteCarloResult {
    weaponName?: string;
    trialCount: number;
    shotsPerTrial: number;
    totalShots: number;
    masterSeed: number;
    targetDistance: number;
    conditions: {
        aimProgress: number;
        isAiming: boolean;
        stance: StanceMode;
        device: DeviceType;
        firerate: number;
    };
    impacts: ImpactPoint[];
    statistics: DispersionStatistics;
    executionTimeMs: number;
    simulationStatus?: 'SUCCESS' | 'UNSUPPORTED_WEAPON_TYPE' | 'UNVERIFIED_RECOIL';
    verificationStatus?: SimulationVerificationStatus;
    telemetry?: {
        handlingFallback?: {
            aimSpeedDefaulted: boolean;
            sprintSpeedDefaulted: boolean;
        };
        unappliedModifiers?: any[];
    };
}
