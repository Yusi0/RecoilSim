/**
 * dispersionGeometry.ts
 *
 * Mathematical and geometric helper functions for 2D dispersion map visualization.
 * Handles World (Studs) <-> Canvas (Pixels) transformations and covariance ellipse eigen-decomposition.
 */

export interface Point2D {
    x: number;
    y: number;
}

export interface CanvasPoint {
    cx: number;
    cy: number;
}

export interface CovarianceEllipse {
    /** 1-sigma semi-major axis radius (in studs) */
    semiMajor: number;
    /** 1-sigma semi-minor axis radius (in studs) */
    semiMinor: number;
    /** Principal axis rotation angle in radians (counter-clockwise from +X in Cartesian world space) */
    angleRad: number;
}

export interface WorldBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

/**
 * Transforms Cartesian world coordinates (studs) to HTML Canvas screen coordinates (pixels).
 *
 * Coordinate Convention:
 * - PF World: +X = Right, +Y = Up, (0, 0) = Aim Center
 * - Canvas:   +X = Right, +Y = Down, (originX, originY) = Canvas Pixel Center of (0, 0)
 *
 * cx = originX + x * scale
 * cy = originY - y * scale  (Y-inversion)
 */
export function worldToCanvas(
    worldX: number,
    worldY: number,
    originX: number,
    originY: number,
    scale: number
): CanvasPoint {
    return {
        cx: originX + worldX * scale,
        cy: originY - worldY * scale
    };
}

/**
 * Transforms Canvas screen coordinates (pixels) back to Cartesian world coordinates (studs).
 */
export function canvasToWorld(
    cx: number,
    cy: number,
    originX: number,
    originY: number,
    scale: number
): Point2D {
    if (scale === 0) return { x: 0, y: 0 };
    return {
        x: (cx - originX) / scale,
        y: (originY - cy) / scale
    };
}

/**
 * Computes the 1-sigma dispersion ellipse via eigen-decomposition of the 2x2 covariance matrix:
 * [ varX   covXY ]
 * [ covXY  varY  ]
 *
 * Returns semi-major radius, semi-minor radius, and rotation angle in radians.
 */
export function computeCovarianceEllipse(
    stdX: number,
    stdY: number,
    covarianceXY: number
): CovarianceEllipse {
    const varX = stdX * stdX;
    const varY = stdY * stdY;
    const cov = covarianceXY;

    // Handle degenerate zero or near-zero variance
    if (varX <= 1e-12 && varY <= 1e-12) {
        return { semiMajor: 0, semiMinor: 0, angleRad: 0 };
    }

    // Characteristic equation of 2x2 symmetric matrix:
    // lambda^2 - (varX + varY)*lambda + (varX*varY - cov^2) = 0
    const diff = (varX - varY) / 2;
    const delta = Math.sqrt(Math.max(0, diff * diff + cov * cov));
    const mid = (varX + varY) / 2;

    const lambda1 = Math.max(0, mid + delta); // larger eigenvalue
    const lambda2 = Math.max(0, mid - delta); // smaller eigenvalue

    const semiMajor = Math.sqrt(lambda1);
    const semiMinor = Math.sqrt(lambda2);

    // Principal orientation angle (relative to +X in Cartesian space)
    // theta = 0.5 * atan2(2 * cov, varX - varY)
    let angleRad = 0;
    if (Math.abs(cov) > 1e-12 || Math.abs(varX - varY) > 1e-12) {
        angleRad = 0.5 * Math.atan2(2 * cov, varX - varY);
    }

    return {
        semiMajor,
        semiMinor,
        angleRad
    };
}

/**
 * Calculates a balanced pixels-per-stud scale factor so that:
 * 1. The target rings (at least minimumRadiusStuds) fit comfortably.
 * 2. All impacts and the mean point fit inside canvas dimensions with padding.
 */
export function calculateAutoFitScale(
    bounds: WorldBounds,
    canvasWidth: number,
    canvasHeight: number,
    padding: number = 40,
    minimumRadiusStuds: number = 3.0
): number {
    const availableW = Math.max(50, canvasWidth - padding * 2);
    const availableH = Math.max(50, canvasHeight - padding * 2);

    // Ensure origin (0, 0) is always included
    const spanX = Math.max(
        minimumRadiusStuds * 2,
        (Math.max(bounds.maxX, 0) - Math.min(bounds.minX, 0)) * 1.2
    );
    const spanY = Math.max(
        minimumRadiusStuds * 2,
        (Math.max(bounds.maxY, 0) - Math.min(bounds.minY, 0)) * 1.2
    );

    const scaleX = availableW / spanX;
    const scaleY = availableH / spanY;

    return Math.max(5, Math.min(scaleX, scaleY));
}

export interface RgbColor {
    r: number;
    g: number;
    b: number;
}

/**
 * Returns an interpolated color along the recoil progression sequence:
 * Green (start, shot 0) -> Yellow -> Orange -> Red (end, last shot).
 */
export function getShotProgressionRgb(shotIndex: number, totalShots: number): RgbColor {
    const maxIdx = Math.max(1, totalShots - 1);
    const t = Math.max(0, Math.min(1, shotIndex / maxIdx));

    // Multi-stop color ramp:
    // 0.00: Green  [34, 197, 94]  (#22c55e)
    // 0.33: Yellow [234, 179, 8]  (#eab308)
    // 0.66: Orange [249, 115, 22] (#f97316)
    // 1.00: Red    [239, 68, 68]  (#ef4444)

    if (t <= 0.33) {
        const localT = t / 0.33;
        return {
            r: Math.round(34 + (234 - 34) * localT),
            g: Math.round(197 + (179 - 197) * localT),
            b: Math.round(94 + (8 - 94) * localT)
        };
    } else if (t <= 0.66) {
        const localT = (t - 0.33) / (0.66 - 0.33);
        return {
            r: Math.round(234 + (249 - 234) * localT),
            g: Math.round(179 + (115 - 179) * localT),
            b: Math.round(8 + (22 - 8) * localT)
        };
    } else {
        const localT = (t - 0.66) / (1.00 - 0.66);
        return {
            r: Math.round(249 + (239 - 249) * localT),
            g: Math.round(115 + (68 - 115) * localT),
            b: Math.round(22 + (68 - 22) * localT)
        };
    }
}

export function getShotProgressionColor(shotIndex: number, totalShots: number): string {
    const { r, g, b } = getShotProgressionRgb(shotIndex, totalShots);
    return `rgb(${r}, ${g}, ${b})`;
}

export interface ClusterFraming {
    scale: number;
    originX: number;
    originY: number;
    clusterCenterX: number;
    clusterCenterY: number;
    isOriginInViewport: boolean;
}

/**
 * Calculates framing optimized for the actual impact distribution.
 * Centers on the impact cluster so the pattern occupies the canvas effectively.
 * Allows origin (0, 0) to be outside the viewport if the gun kicked high.
 */
export function calculateClusterFraming(
    bounds: WorldBounds,
    canvasWidth: number,
    canvasHeight: number,
    padding: number = 50
): ClusterFraming {
    const clusterCenterX = (bounds.minX + bounds.maxX) / 2;
    const clusterCenterY = (bounds.minY + bounds.maxY) / 2;

    const spanX = Math.max(0.6, (bounds.maxX - bounds.minX) * 1.35);
    const spanY = Math.max(0.6, (bounds.maxY - bounds.minY) * 1.35);

    const availableW = Math.max(50, canvasWidth - padding * 2);
    const availableH = Math.max(50, canvasHeight - padding * 2);

    const scale = Math.max(8, Math.min(availableW / spanX, availableH / spanY));

    // Screen center maps to (clusterCenterX, clusterCenterY)
    const originX = canvasWidth / 2 - clusterCenterX * scale;
    const originY = canvasHeight / 2 + clusterCenterY * scale;

    const isOriginInViewport = (
        originX >= 15 && originX <= canvasWidth - 15 &&
        originY >= 15 && originY <= canvasHeight - 15
    );

    return {
        scale,
        originX,
        originY,
        clusterCenterX,
        clusterCenterY,
        isOriginInViewport
    };
}

