import {
    DispersionStatistics,
    DriftMetrics,
    DispersionMetrics
} from './MonteCarloTypes';

export interface Point2D {
    x: number;
    y: number;
}

/**
 * Calculates percentile from a pre-sorted array of numbers using linear interpolation.
 */
export function calculatePercentile(sortedValues: number[], percentile: number): number {
    const n = sortedValues.length;
    if (n === 0) return 0;
    if (n === 1) return sortedValues[0];

    const p = Math.max(0, Math.min(1, percentile));
    const index = p * (n - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * StatisticsCalculator:
 * Pure mathematical analysis of 2D shot impact coordinate distributions.
 * Decouples Recoil Drift (from target center (0, 0)) and Dispersion (from mean impact center (mx, my)).
 */
export class StatisticsCalculator {
    /**
     * Computes complete dispersion and drift statistics from a collection of 2D points.
     */
    public static compute(points: readonly Point2D[]): DispersionStatistics {
        const n = points.length;
        if (n === 0) {
            const emptyDrift: DriftMetrics = { meanX: 0, meanY: 0, meanRadius: 0 };
            const emptyDispersion: DispersionMetrics = {
                stdX: 0,
                stdY: 0,
                radialStd: 0,
                centeredMeanRadius: 0,
                centeredMedianRadius: 0,
                centeredP90Radius: 0,
                centeredP95Radius: 0,
                centeredMaxRadius: 0
            };
            return {
                sampleCount: 0,
                meanX: 0,
                meanY: 0,
                meanRadius: 0,
                stdX: 0,
                stdY: 0,
                radialStd: 0,
                medianRadius: 0,
                p90Radius: 0,
                p95Radius: 0,
                maxRadius: 0,
                centeredMeanRadius: 0,
                centeredMedianRadius: 0,
                centeredP90Radius: 0,
                centeredP95Radius: 0,
                centeredMaxRadius: 0,
                covarianceXY: 0,
                estimatedDispersionArea: 0,
                drift: emptyDrift,
                dispersion: emptyDispersion
            };
        }

        // Pass 1: Compute Means (Drift)
        let sumX = 0;
        let sumY = 0;
        let sumRawRadius = 0;
        const rawRadii: number[] = new Array(n);

        for (let i = 0; i < n; i++) {
            const pt = points[i];
            sumX += pt.x;
            sumY += pt.y;
            const r = Math.hypot(pt.x, pt.y);
            rawRadii[i] = r;
            sumRawRadius += r;
        }

        const meanX = sumX / n;
        const meanY = sumY / n;
        const meanRadius = sumRawRadius / n;

        // Pass 2: Variances, Covariance & Centered Radii
        let sumSqDiffX = 0;
        let sumSqDiffY = 0;
        let sumCrossDiff = 0;
        let sumCenteredRadius = 0;
        const centeredRadii: number[] = new Array(n);

        for (let i = 0; i < n; i++) {
            const pt = points[i];
            const dx = pt.x - meanX;
            const dy = pt.y - meanY;

            sumSqDiffX += dx * dx;
            sumSqDiffY += dy * dy;
            sumCrossDiff += dx * dy;

            const cr = Math.hypot(dx, dy);
            centeredRadii[i] = cr;
            sumCenteredRadius += cr;
        }

        const denom = n > 1 ? n - 1 : 1;
        const varX = sumSqDiffX / denom;
        const varY = sumSqDiffY / denom;
        const stdX = Math.sqrt(varX);
        const stdY = Math.sqrt(varY);
        const radialStd = Math.sqrt(varX + varY);
        const covarianceXY = sumCrossDiff / denom;

        const centeredMeanRadius = sumCenteredRadius / n;

        // Pass 3: Percentiles
        rawRadii.sort((a, b) => a - b);
        centeredRadii.sort((a, b) => a - b);

        const medianRadius = calculatePercentile(rawRadii, 0.50);
        const p90Radius = calculatePercentile(rawRadii, 0.90);
        const p95Radius = calculatePercentile(rawRadii, 0.95);
        const maxRadius = rawRadii[n - 1];

        const centeredMedianRadius = calculatePercentile(centeredRadii, 0.50);
        const centeredP90Radius = calculatePercentile(centeredRadii, 0.90);
        const centeredP95Radius = calculatePercentile(centeredRadii, 0.95);
        const centeredMaxRadius = centeredRadii[n - 1];

        const estimatedDispersionArea = Math.PI * stdX * stdY;

        const drift: DriftMetrics = {
            meanX,
            meanY,
            meanRadius
        };

        const dispersion: DispersionMetrics = {
            stdX,
            stdY,
            radialStd,
            centeredMeanRadius,
            centeredMedianRadius,
            centeredP90Radius,
            centeredP95Radius,
            centeredMaxRadius
        };

        return {
            sampleCount: n,
            meanX,
            meanY,
            meanRadius,
            stdX,
            stdY,
            radialStd,
            medianRadius,
            p90Radius,
            p95Radius,
            maxRadius,
            centeredMeanRadius,
            centeredMedianRadius,
            centeredP90Radius,
            centeredP95Radius,
            centeredMaxRadius,
            covarianceXY,
            estimatedDispersionArea,
            drift,
            dispersion
        };
    }
}
