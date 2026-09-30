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
    public static project(
        origin: Vector3,
        direction: Vector3,
        targetDistance: number = 50
    ): PlaneIntersectionResult {
        const targetZ = -Math.abs(targetDistance);
        const dz = direction.z === 0 ? -1e-9 : direction.z;
        const dist = Math.abs((targetZ - origin.z) / dz);

        const x = origin.x + direction.x * dist;
        const y = origin.y + direction.y * dist;

        return {
            x,
            y,
            z: targetZ,
            distToTarget: dist
        };
    }
}
