import { StatisticsCalculator, calculatePercentile } from '../src/montecarlo/StatisticsCalculator';

describe('StatisticsCalculator Sanity & Precision Tests', () => {
    test('1. Empty points collection yields zeroed statistics without throwing', () => {
        const stats = StatisticsCalculator.compute([]);
        expect(stats.sampleCount).toBe(0);
        expect(stats.meanX).toBe(0);
        expect(stats.meanY).toBe(0);
        expect(stats.stdX).toBe(0);
        expect(stats.stdY).toBe(0);
        expect(stats.maxRadius).toBe(0);
        expect(stats.estimatedDispersionArea).toBe(0);
    });

    test('2. Percentile calculation with linear interpolation', () => {
        const values = [10, 20, 30, 40, 50];
        // 0% -> 10, 50% -> 30, 100% -> 50
        expect(calculatePercentile(values, 0.0)).toBe(10);
        expect(calculatePercentile(values, 0.5)).toBe(30);
        expect(calculatePercentile(values, 1.0)).toBe(50);
        // 25% -> between index 0 and 1 -> 10 + 0.25 * 4 * 10 = 20
        expect(calculatePercentile(values, 0.25)).toBe(20);
    });

    test('3. Symmetric 5-point cross: (0,0), (1,0), (0,1), (-1,0), (0,-1)', () => {
        const points = [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
            { x: 0, y: -1 }
        ];

        const stats = StatisticsCalculator.compute(points);

        expect(stats.sampleCount).toBe(5);

        // Center of mass / Drift must be exactly (0, 0)
        expect(stats.meanX).toBeCloseTo(0, 9);
        expect(stats.meanY).toBeCloseTo(0, 9);

        // Raw radii: 0, 1, 1, 1, 1 -> Mean radius = 4 / 5 = 0.8
        expect(stats.meanRadius).toBeCloseTo(0.8, 9);
        expect(stats.maxRadius).toBeCloseTo(1.0, 9);

        // Sample Variance on X: (0^2 + 1^2 + 0^2 + (-1)^2 + 0^2) / (5 - 1) = 2 / 4 = 0.5
        // stdX = sqrt(0.5) ~ 0.70710678
        expect(stats.stdX).toBeCloseTo(Math.sqrt(0.5), 7);
        expect(stats.stdY).toBeCloseTo(Math.sqrt(0.5), 7);
        expect(stats.radialStd).toBeCloseTo(1.0, 7);

        // Covariance of orthogonal symmetric cross is 0
        expect(stats.covarianceXY).toBeCloseTo(0, 9);

        // Centered mean radius from (0,0) is equal to raw mean radius
        expect(stats.centeredMeanRadius).toBeCloseTo(0.8, 9);
        expect(stats.centeredMaxRadius).toBeCloseTo(1.0, 9);
    });

    test('4. Drift vs Dispersion Separation: Pure translation shifts drift without altering dispersion', () => {
        const basePoints = [
            { x: 0, y: 0 },
            { x: 2, y: 1 },
            { x: -1, y: 3 },
            { x: 1, y: -2 },
            { x: -2, y: -2 }
        ];

        const baseStats = StatisticsCalculator.compute(basePoints);

        // Shift all points by (+15.0, -25.0)
        const SHIFT_X = 15.0;
        const SHIFT_Y = -25.0;
        const shiftedPoints = basePoints.map((p) => ({
            x: p.x + SHIFT_X,
            y: p.y + SHIFT_Y
        }));

        const shiftedStats = StatisticsCalculator.compute(shiftedPoints);

        // Drift changes by exactly SHIFT_X and SHIFT_Y
        expect(shiftedStats.meanX).toBeCloseTo(baseStats.meanX + SHIFT_X, 7);
        expect(shiftedStats.meanY).toBeCloseTo(baseStats.meanY + SHIFT_Y, 7);
        expect(shiftedStats.meanRadius).not.toBeCloseTo(baseStats.meanRadius, 2);

        // Centered dispersion MUST REMAIN 100% IDENTICAL
        expect(shiftedStats.stdX).toBeCloseTo(baseStats.stdX, 7);
        expect(shiftedStats.stdY).toBeCloseTo(baseStats.stdY, 7);
        expect(shiftedStats.radialStd).toBeCloseTo(baseStats.radialStd, 7);
        expect(shiftedStats.covarianceXY).toBeCloseTo(baseStats.covarianceXY, 7);
        expect(shiftedStats.centeredMeanRadius).toBeCloseTo(baseStats.centeredMeanRadius, 7);
        expect(shiftedStats.centeredMedianRadius).toBeCloseTo(baseStats.centeredMedianRadius, 7);
        expect(shiftedStats.centeredP90Radius).toBeCloseTo(baseStats.centeredP90Radius, 7);
        expect(shiftedStats.centeredP95Radius).toBeCloseTo(baseStats.centeredP95Radius, 7);
        expect(shiftedStats.centeredMaxRadius).toBeCloseTo(baseStats.centeredMaxRadius, 7);
        expect(shiftedStats.estimatedDispersionArea).toBeCloseTo(baseStats.estimatedDispersionArea, 7);
    });
});
