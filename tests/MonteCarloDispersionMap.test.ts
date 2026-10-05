import fs from 'fs';
import path from 'path';
import {
    worldToCanvas,
    canvasToWorld,
    computeCovarianceEllipse,
    calculateAutoFitScale,
    getShotProgressionRgb,
    getShotProgressionColor,
    calculateClusterFraming
} from '../src/app/components/dispersionGeometry';
import { MonteCarloEngine } from '../src/montecarlo';
import { WeaponsParser, WeaponCompiler } from '../src/core';

describe('Monte Carlo 2D Dispersion Map & Geometry Test Suite', () => {
    let compiledC25Base: any;

    beforeAll(() => {
        const rawFilePath = path.join(__dirname, '../data/raw/weapons.json');
        const rawDetailPath = path.join(__dirname, '../data/raw/weapon-details/c25.json');

        const rawWeaponsData = JSON.parse(fs.readFileSync(rawFilePath, 'utf-8'));
        const parser = new WeaponsParser();
        const parseResult = parser.parse(rawWeaponsData);

        const c25Norm = parseResult.weapons.get('c25')!;
        const c25Detail = JSON.parse(fs.readFileSync(rawDetailPath, 'utf-8'));

        const compiler = new WeaponCompiler();
        const compileResult = compiler.compileWeapon(c25Norm, {}, parseResult.attachments, c25Detail);
        compiledC25Base = compileResult.compiledWeaponData;
    });

    // -------------------------------------------------------------
    // Test 1: World <-> Canvas Coordinate Transformations & Y-Inversion
    // -------------------------------------------------------------
    test('1. Coordinate Transformation: worldToCanvas applies scale and Y-inversion, canvasToWorld inverts', () => {
        const originX = 250;
        const originY = 250;
        const scale = 20; // 20 pixels per stud

        // Test Point A: (0, 0) Aim Center -> should map to (originX, originY)
        const ptA = worldToCanvas(0, 0, originX, originY, scale);
        expect(ptA.cx).toBe(250);
        expect(ptA.cy).toBe(250);

        // Test Point B: (+2, +3) Right-Up
        // In PF: +X = Right, +Y = Up (vertical recoil kick)
        // On Canvas: +X = Right (250 + 2*20 = 290), +Y = Down (250 - 3*20 = 190)
        const ptB = worldToCanvas(2, 3, originX, originY, scale);
        expect(ptB.cx).toBe(290);
        expect(ptB.cy).toBe(190); // Y inverted (smaller pixel coordinate = higher on screen)

        // Inversion check: canvasToWorld must recover (2, 3)
        const recoveredB = canvasToWorld(ptB.cx, ptB.cy, originX, originY, scale);
        expect(recoveredB.x).toBeCloseTo(2, 6);
        expect(recoveredB.y).toBeCloseTo(3, 6);

        // Test Point C: (-1.5, -4) Left-Down
        const ptC = worldToCanvas(-1.5, -4, originX, originY, scale);
        expect(ptC.cx).toBe(220); // 250 - 30
        expect(ptC.cy).toBe(330); // 250 - (-80)

        const recoveredC = canvasToWorld(ptC.cx, ptC.cy, originX, originY, scale);
        expect(recoveredC.x).toBeCloseTo(-1.5, 6);
        expect(recoveredC.y).toBeCloseTo(-4, 6);
    });

    // -------------------------------------------------------------
    // Test 2: Covariance Ellipse Eigen-Decomposition
    // -------------------------------------------------------------
    test('2. Covariance Ellipse: Correctly decomposes covariance matrix into principal semi-axes and rotation', () => {
        // Case A: Circular distribution (equal variance, zero covariance)
        // varX = 4 (stdX = 2), varY = 4 (stdY = 2), covXY = 0
        const circ = computeCovarianceEllipse(2, 2, 0);
        expect(circ.semiMajor).toBeCloseTo(2, 5);
        expect(circ.semiMinor).toBeCloseTo(2, 5);
        expect(circ.angleRad).toBe(0);

        // Case B: Horizontally elongated distribution (varX = 9, varY = 4, covXY = 0)
        const horiz = computeCovarianceEllipse(3, 2, 0);
        expect(horiz.semiMajor).toBeCloseTo(3, 5);
        expect(horiz.semiMinor).toBeCloseTo(2, 5);
        expect(horiz.angleRad).toBe(0); // major axis along X

        // Case C: Vertically elongated distribution (varX = 4, varY = 9, covXY = 0)
        const vert = computeCovarianceEllipse(2, 3, 0);
        expect(vert.semiMajor).toBeCloseTo(3, 5);
        expect(vert.semiMinor).toBeCloseTo(2, 5);
        expect(vert.angleRad).toBeCloseTo(Math.PI / 2, 5); // major axis along Y (90 degrees)

        // Case D: 45-degree rotated ellipse (varX = 2, varY = 2, covXY = 1)
        // Eigenvalues: lambda1 = 3, lambda2 = 1 => semiMajor = sqrt(3), semiMinor = 1
        // theta = 0.5 * atan2(2 * 1, 0) = 0.5 * (pi/2) = pi/4 (45 degrees)
        const rotated = computeCovarianceEllipse(Math.sqrt(2), Math.sqrt(2), 1.0);
        expect(rotated.semiMajor).toBeCloseTo(Math.sqrt(3), 5);
        expect(rotated.semiMinor).toBeCloseTo(1.0, 5);
        expect(rotated.angleRad).toBeCloseTo(Math.PI / 4, 5);

        // Case E: Degenerate zero variance case
        const zero = computeCovarianceEllipse(0, 0, 0);
        expect(zero.semiMajor).toBe(0);
        expect(zero.semiMinor).toBe(0);
        expect(zero.angleRad).toBe(0);
    });

    // -------------------------------------------------------------
    // Test 3: Auto-Fit Scale Calculation
    // -------------------------------------------------------------
    test('3. Auto-Fit Scale: Returns positive scale ensuring target area and bounds fit with padding', () => {
        const bounds = { minX: -2, maxX: 3, minY: -1, maxY: 5 };
        const scale = calculateAutoFitScale(bounds, 500, 500, 40, 3.0);

        expect(scale).toBeGreaterThan(0);
        expect(Number.isFinite(scale)).toBe(true);

        // Verify that bounding box scaled by this factor fits within available dimension
        const availableWidth = 500 - 80;
        const availableHeight = 500 - 80;
        const widthStuds = bounds.maxX - Math.min(bounds.minX, 0);
        const heightStuds = bounds.maxY - Math.min(bounds.minY, 0);

        expect(widthStuds * scale).toBeLessThanOrEqual(availableWidth);
        expect(heightStuds * scale).toBeLessThanOrEqual(availableHeight);
    });

    // -------------------------------------------------------------
    // Test 4: R50 / R90 / R95 & Decoupled Drift Binding with Monte Carlo
    // -------------------------------------------------------------
    test('4. Metrics Binding: R50/R90/R95 percentiles and decoupled Drift are correctly preserved from simulation', () => {
        const engine = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 3,
            burstSize: 10,
            masterSeed: 4321
        });
        const res = engine.run();

        const stats = res.statistics;

        // 1. Recoil Drift is non-zero (C25 climbs upwards)
        expect(stats.drift.meanY).toBeGreaterThan(0); // Upward vertical recoil
        expect(stats.drift.meanRadius).toBeGreaterThan(0);
        // By Jensen's inequality: mean(radius) >= norm(mean)
        const meanCenterDist = Math.sqrt(stats.drift.meanX * stats.drift.meanX + stats.drift.meanY * stats.drift.meanY);
        expect(stats.drift.meanRadius).toBeGreaterThanOrEqual(meanCenterDist - 1e-6);

        // 2. Centered Dispersion percentiles are monotonic: R50 <= R90 <= R95 <= maxRadius
        expect(stats.dispersion.centeredMedianRadius).toBeGreaterThan(0);
        expect(stats.dispersion.centeredP90Radius).toBeGreaterThanOrEqual(stats.dispersion.centeredMedianRadius);
        expect(stats.dispersion.centeredP95Radius).toBeGreaterThanOrEqual(stats.dispersion.centeredP90Radius);
        expect(stats.dispersion.centeredMaxRadius).toBeGreaterThanOrEqual(stats.dispersion.centeredP95Radius);

        // 3. Covariance decomposition on actual simulation result
        const ellipse = computeCovarianceEllipse(stats.stdX, stats.stdY, stats.covarianceXY);
        expect(ellipse.semiMajor).toBeGreaterThan(0);
        expect(ellipse.semiMinor).toBeGreaterThan(0);
        expect(ellipse.semiMajor).toBeGreaterThanOrEqual(ellipse.semiMinor);
    });

    // -------------------------------------------------------------
    // Test 5: maxStoredImpacts Limitation (Visualization Sample vs Total Shots)
    // -------------------------------------------------------------
    test('5. Sample Capping: maxStoredImpacts limits stored impacts while full statistics remain exact', () => {
        // 5 trials * 20 shots = 100 shots total, but we cap stored impacts to 30
        const engine = new MonteCarloEngine({
            weaponData: compiledC25Base,
            trialCount: 5,
            burstSize: 20,
            masterSeed: 9876,
            maxStoredImpacts: 30
        });
        const res = engine.run();

        // Impacts array for visual dots must be capped at 30
        expect(res.impacts.length).toBe(30);

        // But totalShots and statistics sampleCount must reflect the full 100 shots!
        expect(res.totalShots).toBe(100);
        expect(res.statistics.sampleCount).toBe(100);
    });

    // -------------------------------------------------------------
    // Test 6: Empty Impacts Graceful Handling
    // -------------------------------------------------------------
    test('6. Empty Impacts: Geometry and bounds handle zero-length impacts safely', () => {
        const bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
        const scale = calculateAutoFitScale(bounds, 500, 500, 40, 3.0);
        expect(scale).toBeGreaterThan(0);

        const canvasPt = worldToCanvas(0, 0, 250, 250, scale);
        expect(canvasPt.cx).toBe(250);
        expect(canvasPt.cy).toBe(250);

        const ellipse = computeCovarianceEllipse(0, 0, 0);
        expect(ellipse.semiMajor).toBe(0);
        expect(ellipse.semiMinor).toBe(0);
        expect(ellipse.angleRad).toBe(0);
    });

    // -------------------------------------------------------------
    // Test 7: Shot Progression Color Gradient (Green -> Yellow -> Orange -> Red)
    // -------------------------------------------------------------
    test('7. Shot Progression Color: Start shot is Green, Mid is Yellow/Orange, End shot is Red', () => {
        const totalShots = 30; // 30-round burst

        // 1. First shot (index 0) must be pure Green (#22c55e: 34, 197, 94)
        const firstShotRgb = getShotProgressionRgb(0, totalShots);
        expect(firstShotRgb.r).toBe(34);
        expect(firstShotRgb.g).toBe(197);
        expect(firstShotRgb.b).toBe(94);
        expect(getShotProgressionColor(0, totalShots)).toBe('rgb(34, 197, 94)');

        // 2. Last shot (index 29) must be pure Red (#ef4444: 239, 68, 68)
        const lastShotRgb = getShotProgressionRgb(29, totalShots);
        expect(lastShotRgb.r).toBe(239);
        expect(lastShotRgb.g).toBe(68);
        expect(lastShotRgb.b).toBe(68);
        expect(getShotProgressionColor(29, totalShots)).toBe('rgb(239, 68, 68)');

        // 3. Middle shot (index 15, ~0.52 t) must have high red & high green (Yellow-Orange region)
        const midShotRgb = getShotProgressionRgb(15, totalShots);
        expect(midShotRgb.r).toBeGreaterThan(200);
        expect(midShotRgb.g).toBeGreaterThan(100);
        expect(midShotRgb.b).toBeLessThan(50);

        // 4. Invariance across trials: shotIndex 5 in trial 0 and shotIndex 5 in trial 50 must have identical color
        const colorTrial0 = getShotProgressionColor(5, 30);
        const colorTrial50 = getShotProgressionColor(5, 30);
        expect(colorTrial0).toBe(colorTrial50);

        // 5. Monotonic progression: red increases from start to end
        expect(lastShotRgb.r).toBeGreaterThan(firstShotRgb.r);
        expect(firstShotRgb.g).toBeGreaterThan(lastShotRgb.g);
    });

    // -------------------------------------------------------------
    // Test 8: Cluster Framing & Origin Viewport Detection
    // -------------------------------------------------------------
    test('8. Cluster Framing: Centers on impact bounds and detects origin viewport status', () => {
        const canvasW = 600;
        const canvasH = 600;

        // Case A: High-recoil gun (all impacts shifted high in +Y: e.g. Y between 10 and 15 studs, X between -1 and 1)
        const highRecoilBounds = { minX: -1, maxX: 1, minY: 10, maxY: 15 };
        const framingHigh = calculateClusterFraming(highRecoilBounds, canvasW, canvasH, 50);

        // Cluster center should be at (0, 12.5)
        expect(framingHigh.clusterCenterX).toBeCloseTo(0, 5);
        expect(framingHigh.clusterCenterY).toBeCloseTo(12.5, 5);
        expect(framingHigh.scale).toBeGreaterThan(0);

        // Check where cluster center maps on canvas:
        const clusterCenterCanvas = worldToCanvas(
            framingHigh.clusterCenterX,
            framingHigh.clusterCenterY,
            framingHigh.originX,
            framingHigh.originY,
            framingHigh.scale
        );
        expect(clusterCenterCanvas.cx).toBeCloseTo(canvasW / 2, 1);
        expect(clusterCenterCanvas.cy).toBeCloseTo(canvasH / 2, 1);

        // Origin (0, 0) should be far below the canvas viewport
        expect(framingHigh.isOriginInViewport).toBe(false);
        expect(framingHigh.originY).toBeGreaterThan(canvasH); // below canvas bottom

        // Case B: Low-recoil / tight ADS cluster surrounding (0, 0) (e.g. X between -0.2 and 0.2, Y between -0.1 and 0.5)
        const tightBounds = { minX: -0.2, maxX: 0.2, minY: -0.1, maxY: 0.5 };
        const framingTight = calculateClusterFraming(tightBounds, canvasW, canvasH, 50);
        expect(framingTight.isOriginInViewport).toBe(true);
    });
});
