/**
 * PFTelemetryTypes.ts
 *
 * TypeScript interface definitions for Roblox Studio PF Runtime Telemetry Fixtures.
 * Conforms 100% to cross_validation_test_harness_design.md.
 */

export interface PFFrameSample {
    readonly time: number;
    readonly aimProgress: number;
    readonly springs: {
        readonly translation_p: readonly [number, number, number];
        readonly rotation_p: readonly [number, number, number];
        readonly cameraBody_p: readonly [number, number, number];
        readonly cameraHead_p: readonly [number, number, number];
        readonly spread_p: readonly [number, number, number];
    };
    readonly cframes: {
        readonly v185: readonly number[];        // 12-element flat array [r00..r22, px, py, pz]
        readonly v186: readonly number[];
        readonly shakeCFrame: readonly number[];
        readonly mainC0: readonly number[];
        readonly v187: readonly number[];
    };
    readonly state: {
        readonly nextShotTime: number;
        readonly firemodeStability: number;
    };
}

export interface PFShotSample {
    readonly fireCount: number;
    readonly fireTimestamp: number;
    readonly recoilImpulseTimestamp: number;
    readonly shotGenerateTimestamp: number;
    readonly capturedAimProgress: number;
    readonly shotOutputs: {
        readonly v474: readonly number[];        // 12-element flat array [r00..r22, px, py, pz]
        readonly origin: readonly [number, number, number];
        readonly direction: readonly [number, number, number];
    };
}

export interface PFTelemetryFixture {
    readonly metadata: {
        readonly weaponName: string;
        readonly testName: string;
        readonly phase: string;
        readonly timestamp: number;
        readonly aimState: 'hip' | 'ADS';
        readonly stance: 'stand' | 'crouch' | 'prone';
        readonly device: 'mouse' | 'touch' | 'controller';
    };
    readonly shots: readonly PFShotSample[];
    readonly frameSamples: readonly PFFrameSample[];
}
