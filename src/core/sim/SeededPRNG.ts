/**
 * SeededPRNG.ts
 *
 * Deterministic PRNG implementation (Mulberry32).
 * Guarantees identical random number streams across executions given the same initial seed.
 */

export class SeededPRNG {
    private _seed: number;
    private _state: number;

    constructor(seed: number = 1337) {
        this._seed = seed;
        this._state = seed >>> 0;
    }

    public get seed(): number {
        return this._seed;
    }

    public reset(seed?: number): void {
        if (seed !== undefined) {
            this._seed = seed;
        }
        this._state = this._seed >>> 0;
    }

    /**
     * Generates a deterministic pseudo-random float in [0, 1).
     */
    public nextFloat(): number {
        let t = (this._state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * Generates a random float in range [min, max).
     */
    public range(min: number, max: number): number {
        return min + (max - min) * this.nextFloat();
    }

    /**
     * Random function conforming to PF RecoilSprings random generator signature:
     * (mean, variance) => variance * 2 * random() - variance + mean
     */
    public recoilRandom(mean: number, variance: number): number {
        return variance * 2 * this.nextFloat() - variance + mean;
    }
}
