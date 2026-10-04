import { Vector3, CFrame } from '../core/math';
import { StanceMode, DeviceType } from '../core/recoil/FirearmObjectRecoil';
import { SelectedAttachments } from '../core/compiler/WeaponCompiler';

export type { StanceMode, DeviceType, SelectedAttachments };

export interface MonteCarloConfig {
    weaponData: Record<string, any>;
    attachments?: SelectedAttachments;
    aimProgress?: number; // 0 (hipfire) to 1 (full ADS), default 1.0
    aiming?: boolean;      // true for ADS, false for hipfire
    stance?: StanceMode;   // 'stand' | 'crouch' | 'prone', default 'stand'
    device?: DeviceType;   // 'mouse' | 'touch' | 'controller', default 'mouse'
    burstSize?: number;    // default 30
    firerate?: number;     // default from weaponData or 800
    trialCount: number;    // Number of trials (e.g. 10, 100, 1000)
    masterSeed: number;    // Master seed for deterministic trial seeds
    targetDistance?: number; // Distance in studs/meters to target plane, default 50
    settleTime?: number;   // Time for aim spring to settle before firing (default 0.3s for ADS)
    initialAimProgress?: number; // Explicit initial aim progress (e.g. 1.0 for instant ADS 100%)
    maxStoredImpacts?: number; // Maximum number of raw impact points to store in result (default 1000, 0 for all)

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
}
