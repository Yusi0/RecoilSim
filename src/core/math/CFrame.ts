import { Vector3 } from './Vector3';

export class CFrame {
    public readonly r: readonly number[]; // 3x3 rotation matrix elements
    public readonly p: Vector3;

    constructor(
        matrix: readonly number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1],
        pos: Vector3 = Vector3.ZERO
    ) {
        this.r = [...matrix];
        this.p = pos;
    }

    public static readonly IDENTITY = new CFrame();

    public static identity(): CFrame {
        return CFrame.IDENTITY;
    }

    public static newPos(pos: Vector3): CFrame {
        return new CFrame(undefined, pos);
    }

    public static fromAxisAngle(vec: Vector3): CFrame {
        const angle = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
        if (angle === 0) return CFrame.IDENTITY;

        const ux = vec.x / angle;
        const uy = vec.y / angle;
        const uz = vec.z / angle;

        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const C = 1 - c;

        // Rodrigues rotation matrix
        const r00 = c + ux * ux * C;
        const r01 = ux * uy * C - uz * s;
        const r02 = ux * uz * C + uy * s;

        const r10 = uy * ux * C + uz * s;
        const r11 = c + uy * uy * C;
        const r12 = uy * uz * C - ux * s;

        const r20 = uz * ux * C - uy * s;
        const r21 = uz * uy * C + ux * s;
        const r22 = c + uz * uz * C;

        return new CFrame([r00, r01, r02, r10, r11, r12, r20, r21, r22], Vector3.ZERO);
    }

    public mul(other: CFrame): CFrame {
        const a = this.r;
        const b = other.r;

        const r00 = a[0]*b[0] + a[1]*b[3] + a[2]*b[6];
        const r01 = a[0]*b[1] + a[1]*b[4] + a[2]*b[7];
        const r02 = a[0]*b[2] + a[1]*b[5] + a[2]*b[8];

        const r10 = a[3]*b[0] + a[4]*b[3] + a[5]*b[6];
        const r11 = a[3]*b[1] + a[4]*b[4] + a[5]*b[7];
        const r12 = a[3]*b[2] + a[4]*b[5] + a[5]*b[8];

        const r20 = a[6]*b[0] + a[7]*b[3] + a[8]*b[6];
        const r21 = a[6]*b[1] + a[7]*b[4] + a[8]*b[7];
        const r22 = a[6]*b[2] + a[7]*b[5] + a[8]*b[8];

        const px = this.p.x + a[0]*other.p.x + a[1]*other.p.y + a[2]*other.p.z;
        const py = this.p.y + a[3]*other.p.x + a[4]*other.p.y + a[5]*other.p.z;
        const pz = this.p.z + a[6]*other.p.x + a[7]*other.p.y + a[8]*other.p.z;

        return new CFrame([r00, r01, r02, r10, r11, r12, r20, r21, r22], new Vector3(px, py, pz));
    }

    public get zVector(): Vector3 {
        return new Vector3(this.r[2], this.r[5], this.r[8]);
    }

    public vectorToWorldSpace(vec: Vector3): Vector3 {
        const a = this.r;
        const vx = a[0] * vec.x + a[1] * vec.y + a[2] * vec.z;
        const vy = a[3] * vec.x + a[4] * vec.y + a[5] * vec.z;
        const vz = a[6] * vec.x + a[7] * vec.y + a[8] * vec.z;
        return new Vector3(vx, vy, vz);
    }

    public addPos(pos: Vector3): CFrame {
        return new CFrame(this.r, this.p.add(pos));
    }

    public equals(other: CFrame, epsilon: number = 1e-5): boolean {
        if (!this.p.equals(other.p, epsilon)) return false;
        for (let i = 0; i < 9; i++) {
            if (Math.abs(this.r[i] - other.r[i]) > epsilon) return false;
        }
        return true;
    }
}
