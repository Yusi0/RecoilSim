export class Vector3 {
    public readonly x: number;
    public readonly y: number;
    public readonly z: number;

    constructor(x: number = 0, y: number = 0, z: number = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    public static readonly ZERO = new Vector3(0, 0, 0);
    public static readonly ONE = new Vector3(1, 1, 1);

    public add(v: Vector3 | number): Vector3 {
        if (typeof v === 'number') {
            return new Vector3(this.x + v, this.y + v, this.z + v);
        }
        return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
    }

    public sub(v: Vector3 | number): Vector3 {
        if (typeof v === 'number') {
            return new Vector3(this.x - v, this.y - v, this.z - v);
        }
        return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
    }

    public mul(v: Vector3 | number): Vector3 {
        if (typeof v === 'number') {
            return new Vector3(this.x * v, this.y * v, this.z * v);
        }
        return new Vector3(this.x * v.x, this.y * v.y, this.z * v.z);
    }

    public div(v: Vector3 | number): Vector3 {
        if (typeof v === 'number') {
            return new Vector3(this.x / v, this.y / v, this.z / v);
        }
        return new Vector3(this.x / v.x, this.y / v.y, this.z / v.z);
    }

    public equals(v: Vector3, epsilon: number = 1e-6): boolean {
        return (
            Math.abs(this.x - v.x) <= epsilon &&
            Math.abs(this.y - v.y) <= epsilon &&
            Math.abs(this.z - v.z) <= epsilon
        );
    }

    public get magnitude(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    public get unit(): Vector3 {
        const mag = this.magnitude;
        if (mag === 0) return Vector3.ZERO;
        return new Vector3(this.x / mag, this.y / mag, this.z / mag);
    }

    public neg(): Vector3 {
        return new Vector3(-this.x, -this.y, -this.z);
    }

    public dot(v: Vector3): number {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    public clone(): Vector3 {
        return new Vector3(this.x, this.y, this.z);
    }

    public toArray(): [number, number, number] {
        return [this.x, this.y, this.z];
    }
}
