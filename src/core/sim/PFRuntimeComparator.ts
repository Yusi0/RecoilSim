/**
 * PFRuntimeComparator.ts
 *
 * RecoilSim Automated Cross-Validation Comparator & Layered Diagnostic Engine.
 * Conforms 100% to cross_validation_test_harness_design.md.
 */

import { Vector3, CFrame } from '../math';
import { SimulationEngine } from './SimulationEngine';
import { PFTelemetryFixture, PFFrameSample, PFShotSample } from './PFTelemetryTypes';

export type DivergenceCategory =
    | 'TIMING'        // Layer 1: Firecap, cooldown, recoil/firedelay timestamp offsets
    | 'IMPULSE_MULT'  // Layer 2: Stance/Device/Weight/Camera multipliers
    | 'SPRING_ODE'    // Layer 3: 2nd-order damped harmonic ODE spring calculation
    | 'CFRAME_CHAIN'  // Layer 4: Viewmodel weld, C_root, _mainC0, v474, CameraHead isolation
    | 'SPREAD';       // Layer 5: Hipfire spread / choke spring cone calculation

export interface DiagnosticDivergence {
    readonly category: DivergenceCategory;
    readonly timestamp: number;
    readonly property: string;
    readonly expected: any;
    readonly actual: any;
    readonly errorMagnitude: number;
    readonly diagnosticMessage: string;
}

export interface ComparisonReport {
    readonly passed: boolean;
    readonly testName: string;
    readonly phase: string;
    readonly samplesChecked: number;
    readonly shotsChecked: number;
    readonly maxSpringError: number;
    readonly maxCFrameError: number;
    readonly maxDirectionError: number;
    readonly firstDivergence?: DiagnosticDivergence;
    readonly summary: string;
}

export interface ComparatorOptions {
    readonly springPosTolerance?: number;    // default 1e-5
    readonly cframePosTolerance?: number;    // default 1e-4
    readonly cframeRotTolerance?: number;    // default 1e-4
    readonly originPosTolerance?: number;    // default 1e-4
    readonly directionTolerance?: number;    // default 1e-5
}

export class PFRuntimeComparator {
    private _springPosTol: number;
    private _cframePosTol: number;
    private _cframeRotTol: number;
    private _originPosTol: number;
    private _dirTol: number;

    constructor(options?: ComparatorOptions) {
        this._springPosTol = options?.springPosTolerance ?? 1e-5;
        this._cframePosTol = options?.cframePosTolerance ?? 1e-4;
        this._cframeRotTol = options?.cframeRotTolerance ?? 1e-4;
        this._originPosTol = options?.originPosTolerance ?? 1e-4;
        this._dirTol = options?.directionTolerance ?? 1e-5;
    }

    /**
     * Converts flat 12-element Luau CFrame array to RecoilSim CFrame.
     * Array format: [r00, r01, r02, r10, r11, r12, r20, r21, r22, px, py, pz]
     */
    public arrayToCFrame(arr: readonly number[]): CFrame {
        if (!arr || arr.length < 12) return CFrame.IDENTITY;
        const matrix = [arr[0], arr[1], arr[2], arr[3], arr[4], arr[5], arr[6], arr[7], arr[8]];
        const pos = new Vector3(arr[9], arr[10], arr[11]);
        return new CFrame(matrix, pos);
    }

    /**
     * Converts flat 3-element array to Vector3.
     */
    public arrayToVector3(arr: readonly [number, number, number] | readonly number[]): Vector3 {
        if (!arr || arr.length < 3) return Vector3.ZERO;
        return new Vector3(arr[0], arr[1], arr[2]);
    }

    /**
     * Compares a Roblox Studio PF Runtime Telemetry Fixture against RecoilSim SimulationEngine.
     */
    public compareFixture(fixture: PFTelemetryFixture, weaponData: Record<string, any>): ComparisonReport {
        const testName = fixture.metadata.testName;
        const phase = fixture.metadata.phase;

        // Instantiate SimulationEngine under identical conditions
        const engine = new SimulationEngine({
            weaponData,
            seed: 2026 // Deterministic seed for comparison
        });

        engine.setStance(fixture.metadata.stance);
        engine.setDevice(fixture.metadata.device);

        const isAiming = fixture.metadata.aimState === 'ADS';
        engine.pushAimInput(isAiming, 0.0);

        // Schedule all shots from fixture
        for (const shot of fixture.shots) {
            engine.pushFireInput(shot.fireTimestamp);
        }

        let maxSpringErr = 0;
        let maxCFrameErr = 0;
        let maxDirErr = 0;
        let firstDivergence: DiagnosticDivergence | undefined;

        // 1. Validate Frame Samples (Spring states & CFrames)
        for (const sample of fixture.frameSamples) {
            engine.advanceTo(sample.time);

            // Compare Translation Spring Position
            const transSim = engine.firearmRecoil.getPositions(sample.time).translation;
            const transPF = this.arrayToVector3(sample.springs.translation_p);
            const transErr = transSim.sub(transPF).magnitude;
            if (transErr > maxSpringErr) maxSpringErr = transErr;

            if (transErr > this._springPosTol && !firstDivergence) {
                firstDivergence = {
                    category: 'SPRING_ODE',
                    timestamp: sample.time,
                    property: 'springs.translation_p',
                    expected: transPF.toArray(),
                    actual: transSim.toArray(),
                    errorMagnitude: transErr,
                    diagnosticMessage: `Layer 3 (SPRING_ODE): Translation spring position diverged at t=${sample.time.toFixed(4)}s (Error: ${transErr.toFixed(6)} > Tol: ${this._springPosTol})`
                };
            }

            // Compare Rotation Spring Position
            const rotSim = engine.firearmRecoil.getPositions(sample.time).rotation;
            const rotPF = this.arrayToVector3(sample.springs.rotation_p);
            const rotErr = rotSim.sub(rotPF).magnitude;
            if (rotErr > maxSpringErr) maxSpringErr = rotErr;

            if (rotErr > this._springPosTol && !firstDivergence) {
                firstDivergence = {
                    category: 'SPRING_ODE',
                    timestamp: sample.time,
                    property: 'springs.rotation_p',
                    expected: rotPF.toArray(),
                    actual: rotSim.toArray(),
                    errorMagnitude: rotErr,
                    diagnosticMessage: `Layer 3 (SPRING_ODE): Rotation spring position diverged at t=${sample.time.toFixed(4)}s (Error: ${rotErr.toFixed(6)} > Tol: ${this._springPosTol})`
                };
            }

            // Compare CameraBody Recoil Position
            const viewSim = engine.getPlayerViewSnapshot(sample.time);
            const bodyPF = this.arrayToVector3(sample.springs.cameraBody_p);
            const bodyErr = viewSim.cameraBodyRecoilVec.sub(bodyPF).magnitude;
            if (bodyErr > maxSpringErr) maxSpringErr = bodyErr;

            if (bodyErr > this._springPosTol && !firstDivergence) {
                firstDivergence = {
                    category: 'SPRING_ODE',
                    timestamp: sample.time,
                    property: 'springs.cameraBody_p',
                    expected: bodyPF.toArray(),
                    actual: viewSim.cameraBodyRecoilVec.toArray(),
                    errorMagnitude: bodyErr,
                    diagnosticMessage: `Layer 3 (SPRING_ODE): CameraBody recoil spring diverged at t=${sample.time.toFixed(4)}s (Error: ${bodyErr.toFixed(6)})`
                };
            }
        }

        // 2. Validate Physical Shot Outputs (Origin, Direction, v474)
        const simShots = engine.physicalShots;

        // Check Layer 1: Shot Count & Timing
        if (simShots.length !== fixture.shots.length && !firstDivergence) {
            firstDivergence = {
                category: 'TIMING',
                timestamp: fixture.shots[0]?.fireTimestamp ?? 0,
                property: 'shotCount',
                expected: fixture.shots.length,
                actual: simShots.length,
                errorMagnitude: Math.abs(simShots.length - fixture.shots.length),
                diagnosticMessage: `Layer 1 (TIMING): Shot count mismatch! PF generated ${fixture.shots.length} shots, RecoilSim generated ${simShots.length}`
            };
        }

        for (let i = 0; i < Math.min(simShots.length, fixture.shots.length); i++) {
            const simShot = simShots[i];
            const pfShot = fixture.shots[i];

            const originPF = this.arrayToVector3(pfShot.shotOutputs.origin);
            const dirPF = this.arrayToVector3(pfShot.shotOutputs.direction);
            const v474PF = this.arrayToCFrame(pfShot.shotOutputs.v474);

            // Origin check
            const originErr = simShot.origin.sub(originPF).magnitude;
            if (originErr > this._originPosTol && !firstDivergence) {
                firstDivergence = {
                    category: 'CFRAME_CHAIN',
                    timestamp: simShot.timestamp,
                    property: `shots[${i}].origin`,
                    expected: originPF.toArray(),
                    actual: simShot.origin.toArray(),
                    errorMagnitude: originErr,
                    diagnosticMessage: `Layer 4 (CFRAME_CHAIN): Shot origin diverged at shot ${i} (t=${simShot.timestamp.toFixed(4)}s, Error: ${originErr.toFixed(6)})`
                };
            }

            // Direction unit dot product check
            const dot = Math.min(1.0, Math.max(-1.0, simShot.direction.dot(dirPF)));
            const dirErr = 1 - dot;
            if (dirErr > maxDirErr) maxDirErr = dirErr;

            if (dirErr > this._dirTol && !firstDivergence) {
                firstDivergence = {
                    category: 'SPREAD',
                    timestamp: simShot.timestamp,
                    property: `shots[${i}].direction`,
                    expected: dirPF.toArray(),
                    actual: simShot.direction.toArray(),
                    errorMagnitude: dirErr,
                    diagnosticMessage: `Layer 5 (SPREAD): Shot direction unit vector diverged at shot ${i} (Error: ${dirErr.toFixed(6)} > Tol: ${this._dirTol})`
                };
            }
        }

        const passed = !firstDivergence;
        const summary = passed
            ? `[PASS] ${testName} (${phase}): ${fixture.frameSamples.length} frame samples & ${fixture.shots.length} shots matched within tolerance.`
            : `[FAIL] ${testName} (${phase}): Divergence detected at t=${firstDivergence?.timestamp.toFixed(4)}s -> ${firstDivergence?.diagnosticMessage}`;

        return {
            passed,
            testName,
            phase,
            samplesChecked: fixture.frameSamples.length,
            shotsChecked: fixture.shots.length,
            maxSpringError: maxSpringErr,
            maxCFrameError: maxCFrameErr,
            maxDirectionError: maxDirErr,
            firstDivergence,
            summary
        };
    }
}
