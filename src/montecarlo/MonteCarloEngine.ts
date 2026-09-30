import { Vector3, CFrame } from '../core/math';
import { SimulationEngine } from '../core/sim/SimulationEngine';
import { TargetPlaneProjector } from './TargetPlaneProjector';
import { StatisticsCalculator, Point2D } from './StatisticsCalculator';
import {
    MonteCarloConfig,
    MonteCarloResult,
    ImpactPoint
} from './MonteCarloTypes';

/**
 * Derives a strictly deterministic 32-bit integer seed for a given trial index from the master seed.
 * Ensures Trial 0 receives the exact masterSeed so trial 0 aligns 1:1 with a standalone SimulationEngine run.
 */
export function deriveTrialSeed(masterSeed: number, trialIndex: number): number {
    if (trialIndex === 0) {
        return masterSeed >>> 0;
    }
    // High-entropy 32-bit mixing function
    let h = (masterSeed ^ Math.imul(trialIndex, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Monte Carlo Simulation Engine:
 * Repeatedly runs the authoritative SimulationEngine under deterministic conditions to accumulate
 * massive physical shot trajectories, project them onto a 2D target plane, and compute comprehensive
 * dispersion and drift statistics.
 */
export class MonteCarloEngine {
    private _config: MonteCarloConfig;

    constructor(config: MonteCarloConfig) {
        this._config = {
            aimProgress: 1.0,
            aiming: true,
            stance: 'stand',
            device: 'mouse',
            burstSize: 30,
            targetDistance: 50,
            settleTime: 0.3,
            maxStoredImpacts: 1000,
            ...config
        };
    }

    public get config(): Readonly<MonteCarloConfig> {
        return this._config;
    }

    /**
     * Executes the Monte Carlo simulation synchronously.
     */
    public run(): MonteCarloResult {
        const startTimeMs = performance.now();

        const config = this._config;
        const trialCount = Math.max(1, config.trialCount);
        const burstSize = Math.max(1, config.burstSize ?? 30);
        const firerate = config.firerate ?? (config.weaponData.firerate ?? 800);
        const interval = 60 / firerate;
        const targetDistance = config.targetDistance ?? 50;
        const isAiming = config.aiming ?? ((config.aimProgress ?? 1.0) > 0.5);
        const settleTime = isAiming ? (config.settleTime ?? 0.3) : 0.0;
        const maxStored = config.maxStoredImpacts ?? 1000;

        const allPoints: Point2D[] = [];
        const storedImpacts: ImpactPoint[] = [];

        for (let trial = 0; trial < trialCount; trial++) {
            const trialSeed = deriveTrialSeed(config.masterSeed, trial);

            // Complete trial isolation: fresh SimulationEngine instance per trial
            const engine = new SimulationEngine({
                weaponData: config.weaponData,
                seed: trialSeed,
                baseCameraOrientation: config.baseCameraOrientation || CFrame.IDENTITY,
                positionOffset: config.positionOffset || new Vector3(0, 1.5, 0),
                hipOffset: config.hipOffset || CFrame.newPos(new Vector3(0.18, -0.15, -0.42)),
                aimOffset: config.aimOffset || CFrame.newPos(new Vector3(0, -0.08, -0.32)),
                rootCFrame: config.rootCFrame,
                mainOffset: config.mainOffset,
                barrelOffset: config.barrelOffset,
                sightOffset: config.sightOffset
            });

            engine.setStance(config.stance ?? 'stand');
            engine.setDevice(config.device ?? 'mouse');

            // Apply aim state and settle
            engine.pushAimInput(isAiming, 0.0);
            if (settleTime > 0) {
                engine.advanceTo(settleTime);
            }

            // Fire burst using genuine SimulationEngine event pipeline
            for (let shotIdx = 0; shotIdx < burstSize; shotIdx++) {
                const fireT = settleTime + shotIdx * interval;
                engine.pushFireInput(fireT);
                engine.advanceTo(fireT + interval);
            }

            // Project each physical shot onto the target plane
            const shots = engine.physicalShots;
            for (let shotIdx = 0; shotIdx < shots.length; shotIdx++) {
                const shot = shots[shotIdx];
                const proj = TargetPlaneProjector.project(shot.origin, shot.direction, targetDistance);

                allPoints.push({ x: proj.x, y: proj.y });

                if (maxStored === 0 || storedImpacts.length < maxStored) {
                    storedImpacts.push({
                        trialIndex: trial,
                        shotIndex: shotIdx,
                        timestamp: shot.timestamp,
                        x: proj.x,
                        y: proj.y,
                        targetZ: proj.z,
                        origin: shot.origin,
                        direction: shot.direction
                    });
                }
            }
        }

        const stats = StatisticsCalculator.compute(allPoints);
        const executionTimeMs = performance.now() - startTimeMs;

        return {
            weaponName: config.weaponData.name || config.weaponData.displayName,
            trialCount,
            shotsPerTrial: burstSize,
            totalShots: allPoints.length,
            masterSeed: config.masterSeed,
            targetDistance,
            conditions: {
                aimProgress: config.aimProgress ?? (isAiming ? 1.0 : 0.0),
                isAiming,
                stance: config.stance ?? 'stand',
                device: config.device ?? 'mouse',
                firerate
            },
            impacts: storedImpacts,
            statistics: stats,
            executionTimeMs
        };
    }

    /**
     * Executes the Monte Carlo simulation asynchronously in chunks to prevent blocking the event loop.
     */
    public async runAsync(
        chunkSize: number = 20,
        onProgress?: (completedTrials: number, totalTrials: number) => void
    ): Promise<MonteCarloResult> {
        const startTimeMs = performance.now();

        const config = this._config;
        const trialCount = Math.max(1, config.trialCount);
        const burstSize = Math.max(1, config.burstSize ?? 30);
        const firerate = config.firerate ?? (config.weaponData.firerate ?? 800);
        const interval = 60 / firerate;
        const targetDistance = config.targetDistance ?? 50;
        const isAiming = config.aiming ?? ((config.aimProgress ?? 1.0) > 0.5);
        const settleTime = isAiming ? (config.settleTime ?? 0.3) : 0.0;
        const maxStored = config.maxStoredImpacts ?? 1000;

        const allPoints: Point2D[] = [];
        const storedImpacts: ImpactPoint[] = [];

        for (let trial = 0; trial < trialCount; trial++) {
            const trialSeed = deriveTrialSeed(config.masterSeed, trial);

            const engine = new SimulationEngine({
                weaponData: config.weaponData,
                seed: trialSeed,
                baseCameraOrientation: config.baseCameraOrientation || CFrame.IDENTITY,
                positionOffset: config.positionOffset || new Vector3(0, 1.5, 0),
                hipOffset: config.hipOffset || CFrame.newPos(new Vector3(0.18, -0.15, -0.42)),
                aimOffset: config.aimOffset || CFrame.newPos(new Vector3(0, -0.08, -0.32)),
                rootCFrame: config.rootCFrame,
                mainOffset: config.mainOffset,
                barrelOffset: config.barrelOffset,
                sightOffset: config.sightOffset
            });

            engine.setStance(config.stance ?? 'stand');
            engine.setDevice(config.device ?? 'mouse');

            engine.pushAimInput(isAiming, 0.0);
            if (settleTime > 0) {
                engine.advanceTo(settleTime);
            }

            for (let shotIdx = 0; shotIdx < burstSize; shotIdx++) {
                const fireT = settleTime + shotIdx * interval;
                engine.pushFireInput(fireT);
                engine.advanceTo(fireT + interval);
            }

            const shots = engine.physicalShots;
            for (let shotIdx = 0; shotIdx < shots.length; shotIdx++) {
                const shot = shots[shotIdx];
                const proj = TargetPlaneProjector.project(shot.origin, shot.direction, targetDistance);

                allPoints.push({ x: proj.x, y: proj.y });

                if (maxStored === 0 || storedImpacts.length < maxStored) {
                    storedImpacts.push({
                        trialIndex: trial,
                        shotIndex: shotIdx,
                        timestamp: shot.timestamp,
                        x: proj.x,
                        y: proj.y,
                        targetZ: proj.z,
                        origin: shot.origin,
                        direction: shot.direction
                    });
                }
            }

            // Yield control back to event loop periodically
            if (trial % chunkSize === 0 && trial > 0) {
                if (onProgress) {
                    onProgress(trial, trialCount);
                }
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        if (onProgress) {
            onProgress(trialCount, trialCount);
        }

        const stats = StatisticsCalculator.compute(allPoints);
        const executionTimeMs = performance.now() - startTimeMs;

        return {
            weaponName: config.weaponData.name || config.weaponData.displayName,
            trialCount,
            shotsPerTrial: burstSize,
            totalShots: allPoints.length,
            masterSeed: config.masterSeed,
            targetDistance,
            conditions: {
                aimProgress: config.aimProgress ?? (isAiming ? 1.0 : 0.0),
                isAiming,
                stance: config.stance ?? 'stand',
                device: config.device ?? 'mouse',
                firerate
            },
            impacts: storedImpacts,
            statistics: stats,
            executionTimeMs
        };
    }
}
