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
        const targetDistance = config.targetDistance ?? 50;

        // Binary aiming state: true for ADS, false for HIPFIRE
        const isAiming = config.aiming !== undefined
            ? config.aiming
            : (config.aimProgress !== undefined ? config.aimProgress > 0.5 : true);
        const settleTime = isAiming ? (config.settleTime ?? 0.3) : 0.0;

        // Guard against non-firearm / melee / zero firerate weapons (e.g. CUTLASS)
        const categoryUpper = String(config.weaponData.category || '').toUpperCase();
        const isMelee = config.weaponData.fireType === 'Melee' ||
            categoryUpper.includes('MELEE') ||
            categoryUpper.includes('BLADE') ||
            categoryUpper.includes('BLUNT') ||
            config.weaponData.type === 'Melee';
        const rawFirerate = (isAiming ? config.weaponData.aimedfirerate : undefined) ?? config.weaponData.firerate;

        if (isMelee || rawFirerate === undefined || rawFirerate === null || rawFirerate <= 0 || !Number.isFinite(rawFirerate)) {
            const reason = isMelee ? 'MELEE_WEAPON_UNSUPPORTED' : 'MISSING_FIRE_RATE';
            const unsupportedReason = isMelee
                ? 'Melee weapon does not support ballistic simulation'
                : 'Weapon missing firerate/rpm; cannot calculate shot interval';
            return {
                weaponName: config.weaponData.name || config.weaponData.displayName,
                trialCount: 0,
                shotsPerTrial: 0,
                totalShots: 0,
                masterSeed: config.masterSeed,
                targetDistance,
                conditions: {
                    isAiming,
                    aimProgress: isAiming ? 1.0 : 0.0,
                    stance: config.stance ?? 'stand',
                    device: config.device ?? 'mouse',
                    firerate: 0
                },
                impacts: [],
                statistics: StatisticsCalculator.compute([]),
                executionTimeMs: performance.now() - startTimeMs,
                simulationStatus: 'UNSUPPORTED_WEAPON_TYPE',
                verificationStatus: {
                    recoil: 'MISSING_RECOIL_DATA',
                    reason,
                    isRecoilSimulated: false,
                    unsupportedWeapon: true,
                    unsupportedReason
                }
            };
        }

        // Authoritative weapon firerate as single source of truth
        const effectiveFirerate = rawFirerate;

        if (config.firerate !== undefined && Math.abs(config.firerate - effectiveFirerate) > 1e-4) {
            throw new Error(
                `[MonteCarloEngine] Specified firerate (${config.firerate}) does not match weapon effective firerate (${effectiveFirerate}). ` +
                `Monte Carlo strictly adheres to authoritative weaponData firerate to avoid firing cooldown desync.`
            );
        }
        const firerate = effectiveFirerate;
        const interval = 60 / firerate;
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
                sightOffset: config.sightOffset,
                initialAimProgress: config.initialAimProgress,
                aimSpeed: config.aimSpeed
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
                const accepted = engine.pushFireInput(fireT);
                if (!accepted) {
                    throw new Error(
                        `[MonteCarloEngine] pushFireInput rejected at virtual time t=${fireT}s (shot ${shotIdx + 1}/${burstSize}). ` +
                        `SimulationEngine cooldown active. Ensure firing interval (${interval}s) matches weapon firerate.`
                    );
                }
                engine.advanceTo(fireT + interval);
            }

            // Project each physical shot onto the target plane
            const shots = engine.physicalShots;
            for (let shotIdx = 0; shotIdx < shots.length; shotIdx++) {
                const shot = shots[shotIdx];
                const proj = TargetPlaneProjector.project(shot.origin, shot.direction, targetDistance);

                if (!proj) {
                    continue; // Skip invalid projection (do not add to stats or impacts)
                }

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

        // Recoil Verification & Provenance tracking
        const isRecoilMissing = config.weaponData.recoil === null || config.weaponData.recoil === undefined;
        let simStatus: 'SUCCESS' | 'UNVERIFIED_RECOIL' | 'UNSUPPORTED_WEAPON_TYPE' = 'SUCCESS';
        let recoilStatus: 'VERIFIED' | 'UNVERIFIED_11_17' | 'INHERITED_FROM_11_16' | 'MISSING_RECOIL_DATA' = 'VERIFIED';
        let recoilReason: string | undefined = undefined;
        let isRecoilSimulated = true;

        if (isRecoilMissing) {
            simStatus = 'UNVERIFIED_RECOIL';
            recoilStatus = 'UNVERIFIED_11_17';
            recoilReason = 'RECOIL_DATA_MISSING';
            isRecoilSimulated = false;
        } else if (config.weaponData._provenance?.recoil_springs === 'INHERITED_FROM_11_16') {
            recoilStatus = 'INHERITED_FROM_11_16';
            recoilReason = 'INHERITED_FROM_11_16_OUTDATED_PHYSICS';
        }

        const isAimSpeedDefaulted = config.weaponData.aimspeed === undefined && config.aimSpeed === undefined;
        const isSprintSpeedDefaulted = config.weaponData.sprintspeed === undefined;

        return {
            weaponName: config.weaponData.name || config.weaponData.displayName,
            trialCount,
            shotsPerTrial: burstSize,
            totalShots: allPoints.length,
            masterSeed: config.masterSeed,
            targetDistance,
            conditions: {
                isAiming,
                aimProgress: isAiming ? 1.0 : 0.0,
                stance: config.stance ?? 'stand',
                device: config.device ?? 'mouse',
                firerate
            },
            impacts: storedImpacts,
            statistics: stats,
            executionTimeMs,
            simulationStatus: simStatus,
            verificationStatus: {
                recoil: recoilStatus,
                reason: recoilReason,
                isRecoilSimulated,
                isOutdatedPhysics: recoilStatus === 'INHERITED_FROM_11_16'
            },
            telemetry: {
                handlingFallback: {
                    aimSpeedDefaulted: isAimSpeedDefaulted,
                    sprintSpeedDefaulted: isSprintSpeedDefaulted
                }
            }
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
        const targetDistance = config.targetDistance ?? 50;

        // Binary aiming state: true for ADS, false for HIPFIRE
        const isAiming = config.aiming !== undefined
            ? config.aiming
            : (config.aimProgress !== undefined ? config.aimProgress > 0.5 : true);
        const settleTime = isAiming ? (config.settleTime ?? 0.3) : 0.0;

        // Guard against non-firearm / melee / zero firerate weapons (e.g. CUTLASS)
        const categoryUpper = String(config.weaponData.category || '').toUpperCase();
        const isMelee = config.weaponData.fireType === 'Melee' ||
            categoryUpper.includes('MELEE') ||
            categoryUpper.includes('BLADE') ||
            categoryUpper.includes('BLUNT') ||
            config.weaponData.type === 'Melee';
        const rawFirerate = (isAiming ? config.weaponData.aimedfirerate : undefined) ?? config.weaponData.firerate;

        if (isMelee || rawFirerate === undefined || rawFirerate === null || rawFirerate <= 0 || !Number.isFinite(rawFirerate)) {
            const reason = isMelee ? 'MELEE_WEAPON_UNSUPPORTED' : 'MISSING_FIRE_RATE';
            const unsupportedReason = isMelee
                ? 'Melee weapon does not support ballistic simulation'
                : 'Weapon missing firerate/rpm; cannot calculate shot interval';
            return {
                weaponName: config.weaponData.name || config.weaponData.displayName,
                trialCount: 0,
                shotsPerTrial: 0,
                totalShots: 0,
                masterSeed: config.masterSeed,
                targetDistance,
                conditions: {
                    isAiming,
                    aimProgress: isAiming ? 1.0 : 0.0,
                    stance: config.stance ?? 'stand',
                    device: config.device ?? 'mouse',
                    firerate: 0
                },
                impacts: [],
                statistics: StatisticsCalculator.compute([]),
                executionTimeMs: performance.now() - startTimeMs,
                simulationStatus: 'UNSUPPORTED_WEAPON_TYPE',
                verificationStatus: {
                    recoil: 'MISSING_RECOIL_DATA',
                    reason,
                    isRecoilSimulated: false,
                    unsupportedWeapon: true,
                    unsupportedReason
                }
            };
        }

        // Authoritative weapon firerate as single source of truth
        const effectiveFirerate = rawFirerate;

        if (config.firerate !== undefined && Math.abs(config.firerate - effectiveFirerate) > 1e-4) {
            throw new Error(
                `[MonteCarloEngine] Specified firerate (${config.firerate}) does not match weapon effective firerate (${effectiveFirerate}). ` +
                `Monte Carlo strictly adheres to authoritative weaponData firerate to avoid firing cooldown desync.`
            );
        }
        const firerate = effectiveFirerate;
        const interval = 60 / firerate;
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
                sightOffset: config.sightOffset,
                initialAimProgress: config.initialAimProgress,
                aimSpeed: config.aimSpeed
            });

            engine.setStance(config.stance ?? 'stand');
            engine.setDevice(config.device ?? 'mouse');

            engine.pushAimInput(isAiming, 0.0);
            if (settleTime > 0) {
                engine.advanceTo(settleTime);
            }

            for (let shotIdx = 0; shotIdx < burstSize; shotIdx++) {
                const fireT = settleTime + shotIdx * interval;
                const accepted = engine.pushFireInput(fireT);
                if (!accepted) {
                    throw new Error(
                        `[MonteCarloEngine] pushFireInput rejected at virtual time t=${fireT}s (shot ${shotIdx + 1}/${burstSize}). ` +
                        `SimulationEngine cooldown active. Ensure firing interval (${interval}s) matches weapon firerate.`
                    );
                }
                engine.advanceTo(fireT + interval);
            }

            const shots = engine.physicalShots;
            for (let shotIdx = 0; shotIdx < shots.length; shotIdx++) {
                const shot = shots[shotIdx];
                const proj = TargetPlaneProjector.project(shot.origin, shot.direction, targetDistance);

                if (!proj) {
                    continue; // Skip invalid projection (do not add to stats or impacts)
                }

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

        // Recoil Verification & Provenance tracking
        const isRecoilMissing = config.weaponData.recoil === null || config.weaponData.recoil === undefined;
        let simStatus: 'SUCCESS' | 'UNVERIFIED_RECOIL' | 'UNSUPPORTED_WEAPON_TYPE' = 'SUCCESS';
        let recoilStatus: 'VERIFIED' | 'UNVERIFIED_11_17' | 'INHERITED_FROM_11_16' | 'MISSING_RECOIL_DATA' = 'VERIFIED';
        let recoilReason: string | undefined = undefined;
        let isRecoilSimulated = true;

        if (isRecoilMissing) {
            simStatus = 'UNVERIFIED_RECOIL';
            recoilStatus = 'UNVERIFIED_11_17';
            recoilReason = 'RECOIL_DATA_MISSING';
            isRecoilSimulated = false;
        } else if (config.weaponData._provenance?.recoil_springs === 'INHERITED_FROM_11_16') {
            recoilStatus = 'INHERITED_FROM_11_16';
            recoilReason = 'INHERITED_FROM_11_16_OUTDATED_PHYSICS';
        }

        const isAimSpeedDefaulted = config.weaponData.aimspeed === undefined && config.aimSpeed === undefined;
        const isSprintSpeedDefaulted = config.weaponData.sprintspeed === undefined;

        return {
            weaponName: config.weaponData.name || config.weaponData.displayName,
            trialCount,
            shotsPerTrial: burstSize,
            totalShots: allPoints.length,
            masterSeed: config.masterSeed,
            targetDistance,
            conditions: {
                isAiming,
                aimProgress: isAiming ? 1.0 : 0.0,
                stance: config.stance ?? 'stand',
                device: config.device ?? 'mouse',
                firerate
            },
            impacts: storedImpacts,
            statistics: stats,
            executionTimeMs,
            simulationStatus: simStatus,
            verificationStatus: {
                recoil: recoilStatus,
                reason: recoilReason,
                isRecoilSimulated,
                isOutdatedPhysics: recoilStatus === 'INHERITED_FROM_11_16'
            },
            telemetry: {
                handlingFallback: {
                    aimSpeedDefaulted: isAimSpeedDefaulted,
                    sprintSpeedDefaulted: isSprintSpeedDefaulted
                }
            }
        };
    }
}
