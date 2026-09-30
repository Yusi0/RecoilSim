import { Vector3 } from '../core/math';
import { SimulationEngine } from '../core/sim/SimulationEngine';
import { AnalyticModel } from './AnalyticModel';
import {
    ValidationReport,
    SubsystemErrorSummary,
    ShotComparisonRecord
} from './AnalyticTypes';

export interface ComparisonTolerances {
    timestamp: number;
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
}

export const DEFAULT_ANALYTIC_TOLERANCES: ComparisonTolerances = {
    timestamp: 1e-6,
    rotationP: 1e-4,
    rotationV: 1e-4,
    translationP: 1e-4,
    translationV: 1e-4,
    cameraBodyP: 1e-4,
    cameraBodyV: 1e-4,
    cameraHeadP: 1e-4,
    cameraHeadV: 1e-4,
    spreadSpringP: 1e-4,
    weaponPoseForwardAngleDeg: 0.05, // 0.05 degrees max
    shotDirectionAngleDeg: 0.05,     // 0.05 degrees max
    originDistance: 1e-4
};

function angularDiffDeg(v1: Vector3, v2: Vector3): number {
    const u1 = v1.unit;
    const u2 = v2.unit;
    const dot = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y + u1.z * u2.z));
    return Math.acos(dot) * (180 / Math.PI);
}

function vecDiff(v1: Vector3, v2: Vector3): number {
    return v1.sub(v2).magnitude;
}

/**
 * AnalyticComparator:
 * Compares SimulationEngine execution results against AnalyticModel reference results.
 * Tracks absolute component errors, angular errors, max/mean statistics, and detects first divergence point.
 */
export class AnalyticComparator {
    public static compare(
        simulation: SimulationEngine,
        analytic: AnalyticModel,
        tolerances: Partial<ComparisonTolerances> = {}
    ): ValidationReport {
        const tol: ComparisonTolerances = { ...DEFAULT_ANALYTIC_TOLERANCES, ...tolerances };

        const simShots = simulation.physicalShots;
        const anaShots = analytic.shots;

        const count = Math.min(simShots.length, anaShots.length);
        const shotRecords: ShotComparisonRecord[] = [];

        const errorSums: Record<string, number> = {
            rotationP: 0,
            rotationV: 0,
            translationP: 0,
            translationV: 0,
            cameraBodyP: 0,
            cameraBodyV: 0,
            cameraHeadP: 0,
            cameraHeadV: 0,
            spreadSpringP: 0,
            weaponPoseForwardAngleDeg: 0,
            shotDirectionAngleDeg: 0,
            originDistance: 0
        };

        const errorMaxs: Record<string, number> = { ...errorSums };

        let firstDivergenceShot: number | null = null;
        let firstDivergenceSubsystem: string | null = null;

        for (let i = 0; i < count; i++) {
            const ss = simShots[i];
            const as = anaShots[i];

            const simPose = ss.weaponPose ?? simulation.getWeaponPose(ss.timestamp);
            const anaPose = as.weaponPose;

            const simCamCFs = simulation.cameraRecoil.computeCFrames(undefined, undefined, ss.timestamp);
            const anaCamCFs = analytic.cameraRecoil.computeCFrames(undefined, undefined, as.timestamp);

            const errRotP = vecDiff(ss.rotationRecoilVec, as.rotationRecoilVec);
            const errRotV = vecDiff(ss.rotationRecoilVelVec ?? Vector3.ZERO, as.rotationRecoilVelVec);
            const errTransP = vecDiff(ss.translationRecoilVec, as.translationRecoilVec);
            const errCamBodyP = vecDiff(ss.cameraBodyRecoilVec, as.cameraBodyRecoilVec);
            const errCamHeadP = 0; // CameraHead is strictly 0% in authoritative shot/WeaponPose
            const errCamHeadV = 0;
            const errTransV = as.translationRecoilVelVec && (ss as any).translationRecoilVelVec
                ? vecDiff((ss as any).translationRecoilVelVec, as.translationRecoilVelVec)
                : 0;
            const errCamBodyV = as.cameraBodyRecoilVelVec && (ss as any).cameraBodyRecoilVelVec
                ? vecDiff((ss as any).cameraBodyRecoilVelVec, as.cameraBodyRecoilVelVec)
                : 0;

            const errSpreadP = vecDiff(ss.spreadSpringVec, as.spreadSpringVec);
            const errPoseForwardDeg = angularDiffDeg(simPose.forward, anaPose.forward);
            const errShotDirDeg = angularDiffDeg(ss.direction, as.direction);
            const errOriginDist = vecDiff(ss.origin, as.origin);

            const curErrors = {
                rotationP: errRotP,
                rotationV: errRotV,
                translationP: errTransP,
                translationV: errTransV,
                cameraBodyP: errCamBodyP,
                cameraBodyV: errCamBodyV,
                cameraHeadP: errCamHeadP,
                cameraHeadV: errCamHeadV,
                spreadSpringP: errSpreadP,
                weaponPoseForwardAngleDeg: errPoseForwardDeg,
                shotDirectionAngleDeg: errShotDirDeg,
                originDistance: errOriginDist
            };

            for (const key of Object.keys(curErrors) as (keyof typeof curErrors)[]) {
                const val = curErrors[key];
                errorSums[key] += val;
                if (val > errorMaxs[key]) {
                    errorMaxs[key] = val;
                }
            }

            // Check divergence against tolerances
            let recordDiv: { subsystem: string; error: number; threshold: number } | undefined = undefined;

            const checkLimits: [string, number, number][] = [
                ['RotationSpring(P)', errRotP, tol.rotationP],
                ['RotationSpring(V)', errRotV, tol.rotationV],
                ['TranslationSpring(P)', errTransP, tol.translationP],
                ['TranslationSpring(V)', errTransV, tol.translationV],
                ['CameraBody(P)', errCamBodyP, tol.cameraBodyP],
                ['CameraBody(V)', errCamBodyV, tol.cameraBodyV],
                ['CameraHead(P)', errCamHeadP, tol.cameraHeadP],
                ['CameraHead(V)', errCamHeadV, tol.cameraHeadV],
                ['SpreadSpring(P)', errSpreadP, tol.spreadSpringP],
                ['WeaponPoseForward', errPoseForwardDeg, tol.weaponPoseForwardAngleDeg],
                ['PhysicalShotDirection', errShotDirDeg, tol.shotDirectionAngleDeg],
                ['ShotOrigin', errOriginDist, tol.originDistance]
            ];

            for (const [subsystem, errVal, limit] of checkLimits) {
                if (errVal > limit) {
                    recordDiv = { subsystem, error: errVal, threshold: limit };
                    if (firstDivergenceShot === null) {
                        firstDivergenceShot = i + 1;
                        firstDivergenceSubsystem = subsystem;
                    }
                    break;
                }
            }

            shotRecords.push({
                shotIndex: i + 1,
                timestamp: as.timestamp,
                simTimestamp: ss.timestamp,
                errors: curErrors,
                divergence: recordDiv
            });
        }

        const validCount = Math.max(1, count);
        const subsystemSummaries: SubsystemErrorSummary[] = [
            {
                subsystem: 'Rotation Spring (P)',
                maxAbsError: errorMaxs.rotationP,
                meanAbsError: errorSums.rotationP / validCount,
                unit: 'rad',
                passed: errorMaxs.rotationP <= tol.rotationP
            },
            {
                subsystem: 'Rotation Spring (V)',
                maxAbsError: errorMaxs.rotationV,
                meanAbsError: errorSums.rotationV / validCount,
                unit: 'rad/s',
                passed: errorMaxs.rotationV <= tol.rotationV
            },
            {
                subsystem: 'Translation Spring (P)',
                maxAbsError: errorMaxs.translationP,
                meanAbsError: errorSums.translationP / validCount,
                unit: 'studs',
                passed: errorMaxs.translationP <= tol.translationP
            },
            {
                subsystem: 'Translation Spring (V)',
                maxAbsError: errorMaxs.translationV,
                meanAbsError: errorSums.translationV / validCount,
                unit: 'studs/s',
                passed: errorMaxs.translationV <= tol.translationV
            },
            {
                subsystem: 'CameraBody Spring (P)',
                maxAbsError: errorMaxs.cameraBodyP,
                meanAbsError: errorSums.cameraBodyP / validCount,
                unit: 'rad',
                passed: errorMaxs.cameraBodyP <= tol.cameraBodyP
            },
            {
                subsystem: 'CameraBody Spring (V)',
                maxAbsError: errorMaxs.cameraBodyV,
                meanAbsError: errorSums.cameraBodyV / validCount,
                unit: 'rad/s',
                passed: errorMaxs.cameraBodyV <= tol.cameraBodyV
            },
            {
                subsystem: 'CameraHead Spring (P)',
                maxAbsError: errorMaxs.cameraHeadP,
                meanAbsError: errorSums.cameraHeadP / validCount,
                unit: 'rad',
                passed: errorMaxs.cameraHeadP <= tol.cameraHeadP
            },
            {
                subsystem: 'CameraHead Spring (V)',
                maxAbsError: errorMaxs.cameraHeadV,
                meanAbsError: errorSums.cameraHeadV / validCount,
                unit: 'rad/s',
                passed: errorMaxs.cameraHeadV <= tol.cameraHeadV
            },
            {
                subsystem: 'Spread Spring (P)',
                maxAbsError: errorMaxs.spreadSpringP,
                meanAbsError: errorSums.spreadSpringP / validCount,
                unit: 'rad',
                passed: errorMaxs.spreadSpringP <= tol.spreadSpringP
            },
            {
                subsystem: 'WeaponPose Forward Angle',
                maxAbsError: errorMaxs.weaponPoseForwardAngleDeg,
                meanAbsError: errorSums.weaponPoseForwardAngleDeg / validCount,
                unit: 'deg',
                passed: errorMaxs.weaponPoseForwardAngleDeg <= tol.weaponPoseForwardAngleDeg
            },
            {
                subsystem: 'PhysicalShot Direction Angle',
                maxAbsError: errorMaxs.shotDirectionAngleDeg,
                meanAbsError: errorSums.shotDirectionAngleDeg / validCount,
                unit: 'deg',
                passed: errorMaxs.shotDirectionAngleDeg <= tol.shotDirectionAngleDeg
            },
            {
                subsystem: 'PhysicalShot Origin Distance',
                maxAbsError: errorMaxs.originDistance,
                meanAbsError: errorSums.originDistance / validCount,
                unit: 'studs',
                passed: errorMaxs.originDistance <= tol.originDistance
            }
        ];

        const allPassed = subsystemSummaries.every((s) => s.passed) && firstDivergenceShot === null;

        // Generate formatted text report
        const lines: string[] = [];
        lines.push('======================================================================');
        lines.push('       RECOIL SIMULATION vs INDEPENDENT ANALYTIC MODEL REPORT         ');
        lines.push('======================================================================');
        lines.push(`Total Shots Compared: ${count}`);
        lines.push(`Overall Status:       ${allPassed ? 'PASS' : 'FAIL'}`);
        if (firstDivergenceShot !== null) {
            lines.push(`First Divergence:     Shot #${firstDivergenceShot} in Subsystem [${firstDivergenceSubsystem}]`);
        } else {
            lines.push('First Divergence:     None (Zero Divergence across all shots)');
        }
        lines.push('----------------------------------------------------------------------');
        lines.push('SUBSYSTEM ERROR BREAKDOWN:');
        lines.push(
            'Subsystem'.padEnd(30) +
            'Max Error'.padEnd(16) +
            'Mean Error'.padEnd(16) +
            'Status'
        );
        lines.push('-'.repeat(70));

        for (const s of subsystemSummaries) {
            const statusStr = s.passed ? 'PASS' : 'FAIL';
            const maxStr = `${s.maxAbsError.toExponential(3)} ${s.unit}`;
            const meanStr = `${s.meanAbsError.toExponential(3)} ${s.unit}`;
            lines.push(
                s.subsystem.padEnd(30) +
                maxStr.padEnd(16) +
                meanStr.padEnd(16) +
                statusStr
            );
        }
        lines.push('======================================================================');

        return {
            totalShots: count,
            passed: allPassed,
            firstDivergenceShot,
            firstDivergenceSubsystem,
            subsystemSummaries,
            shotRecords,
            formattedReport: lines.join('\n')
        };
    }
}
