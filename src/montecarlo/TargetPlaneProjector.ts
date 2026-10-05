import { Vector3 } from '../core/math';

export interface PlaneIntersectionResult {
    x: number;
    y: number;
    z: number;
    distToTarget: number;
}

/**
 * Computes ray-plane intersection of a PhysicalShot against a vertical target plane at Z = -targetDistance.
 * Pure projection utility: does NOT alter shot origin or direction.
 */
export class TargetPlaneProjector {
    public static readonly EPSILON = 1e-6;

    public static project(
        origin: Vector3,
        direction: Vector3,
        targetDistance: number = 50
    ): PlaneIntersectionResult | null {
        const targetZ = -Math.abs(targetDistance);
        const dz = direction.z;

        // Parallel or near-parallel check: ray does not reach target plane within stable precision
        if (Math.abs(dz) < TargetPlaneProjector.EPSILON) {
            return null;
        }

        const t = (targetZ - origin.z) / dz;

        // t <= 0: target plane is behind or at ray origin in ray forward direction
        if (t <= 0) {
            return null;
        }

        const x = origin.x + direction.x * t;
        const y = origin.y + direction.y * t;

        return {
            x,
            y,
            z: targetZ,
            distToTarget: t
        };
    }
}
