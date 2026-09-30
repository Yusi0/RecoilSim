import {
    SimulationEngine,
    StanceMode,
    DeviceType,
    PhysicalShotSnapshot,
    PlayerViewSnapshot,
    WeaponPose,
    Vector3,
    CFrame
} from '../core';
import { loadCompiledC25Data, loadCompiledWeaponData, CompiledWeaponData } from './c25DataLoader';

export interface ControllerState {
    currentTime: number;
    isPlaying: boolean;
    timeSpeed: number;
    aiming: boolean;
    stance: StanceMode;
    device: DeviceType;
    isContinuousFiring: boolean;
    seed: number;
    targetDistance: number; // 50, 100, 200 meters/studs
    dotSize: number; // Impact point screen size multiplier (default 1.0)
}

export class SimulatorController {
    private _engine!: SimulationEngine;
    private _compiledWeaponData: CompiledWeaponData;
    private _state: ControllerState;
    private _listeners: Set<() => void> = new Set();
    private _burstShotsRemaining: number = 0;

    constructor() {
        this._compiledWeaponData = loadCompiledC25Data();
        this._state = {
            currentTime: 0,
            isPlaying: true,
            timeSpeed: 1.0,
            aiming: false,
            stance: 'stand',
            device: 'mouse',
            isContinuousFiring: false,
            seed: 2026,
            targetDistance: 50,
            dotSize: 1.0
        };

        this.initEngine();
    }

    public selectWeapon(weaponId: string): void {
        this._compiledWeaponData = loadCompiledWeaponData(weaponId);
        this.initEngine(this._state.seed);
    }

    public setDotSize(size: number): void {
        this._state.dotSize = Math.max(0.2, Math.min(3.0, size));
        this.notify();
    }

    public setTargetDistance(distance: number): void {
        this._state.targetDistance = Math.max(10, Math.min(500, distance));
        this.notify();
    }

    public initEngine(seed: number = 2026): void {
        this._state.seed = seed;
        this._state.currentTime = 0;
        this._state.isContinuousFiring = false;
        this._burstShotsRemaining = 0;

        this._engine = new SimulationEngine({
            weaponData: this._compiledWeaponData,
            seed: this._state.seed,
            baseCameraOrientation: CFrame.IDENTITY,
            positionOffset: new Vector3(0, 1.5, 0),
            hipOffset: CFrame.newPos(new Vector3(0.18, -0.15, -0.42)),
            aimOffset: CFrame.newPos(new Vector3(0, -0.08, -0.32))
        });

        this._engine.setStance(this._state.stance);
        this._engine.setDevice(this._state.device);

        if (this._state.aiming) {
            this._engine.pushAimInput(true, 0);
        }

        this.notify();
    }

    public subscribe(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    private notify(): void {
        for (const listener of this._listeners) {
            listener();
        }
    }

    public get state(): Readonly<ControllerState> {
        return this._state;
    }

    public get compiledWeaponData(): Readonly<CompiledWeaponData> {
        return this._compiledWeaponData;
    }

    public get engine(): SimulationEngine {
        return this._engine;
    }

    public setAim(aiming: boolean): void {
        this._state.aiming = aiming;
        this._engine.pushAimInput(aiming, this._state.currentTime);
        this.notify();
    }

    public setStance(stance: StanceMode): void {
        this._state.stance = stance;
        this._engine.setStance(stance);
        this.notify();
    }

    public setDevice(device: DeviceType): void {
        this._state.device = device;
        this._engine.setDevice(device);
        this.notify();
    }

    public setTimeSpeed(speed: number): void {
        this._state.timeSpeed = Math.max(0.05, Math.min(2.0, speed));
        this.notify();
    }

    public togglePlayPause(): void {
        this._state.isPlaying = !this._state.isPlaying;
        this.notify();
    }

    public setPlaying(playing: boolean): void {
        this._state.isPlaying = playing;
        this.notify();
    }

    public fireSingleShot(): boolean {
        const fired = this._engine.pushFireInput(this._state.currentTime);
        if (fired) {
            this.notify();
        }
        return fired;
    }

    public setContinuousFiring(firing: boolean): void {
        if (firing) {
            // Trigger pulled: begin burst matching weapon magazine size
            const magsize = Math.round(this._compiledWeaponData.magsize || 30);
            this._burstShotsRemaining = magsize;
            this._state.isContinuousFiring = true;
            if (this.fireSingleShot()) {
                this._burstShotsRemaining--;
            }
        } else {
            // Trigger released: stop firing and reset burst count
            this._state.isContinuousFiring = false;
            this._burstShotsRemaining = 0;
        }
        this.notify();
    }

    public resetSimulation(newSeed?: number): void {
        this.initEngine(newSeed ?? this._state.seed);
    }

    public updateFrame(realDeltaTimeSec: number): void {
        if (!this._state.isPlaying) {
            return;
        }

        const simDt = realDeltaTimeSec * this._state.timeSpeed;
        const targetTime = this._state.currentTime + simDt;

        // Auto-burst handling: fire up to 30 shots, then stop even if trigger is held
        while (this._state.isContinuousFiring && this._burstShotsRemaining > 0) {
            const nextShotTime = this._engine.firearmState.nextShotTime;
            const fireT = Math.max(this._state.currentTime, nextShotTime);
            if (fireT <= targetTime && this._engine.canFire(fireT)) {
                if (this._engine.pushFireInput(fireT)) {
                    this._burstShotsRemaining--;
                    this._engine.advanceTo(fireT);
                    this._state.currentTime = this._engine.currentTime;
                    if (this._burstShotsRemaining <= 0) {
                        // 30th shot reached: auto-stop continuous firing
                        this._state.isContinuousFiring = false;
                        this.notify();
                        break;
                    }
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        this._engine.advanceTo(targetTime);
        this._state.currentTime = this._engine.currentTime;
    }

    public getPlayerViewSnapshot(): PlayerViewSnapshot {
        return this._engine.getPlayerViewSnapshot(this._state.currentTime);
    }

    public getWeaponPose(): WeaponPose {
        return this._engine.getWeaponPose(this._state.currentTime);
    }

    public getPhysicalShots(): readonly PhysicalShotSnapshot[] {
        return this._engine.physicalShots;
    }

    public getFirearmPositions() {
        return this._firearmPositionsAtTime(this._state.currentTime);
    }

    private _firearmPositionsAtTime(t: number) {
        return this._engine.firearmRecoil.getPositions(t);
    }
}
