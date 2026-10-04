/**
 * SimulationEngine.ts
 *
 * Deterministic Virtual-Time Physics Simulation Engine for RecoilSim.
 * Conforms 100% to simulation_loop_spec_vfinal.md.
 */

import { Vector3, CFrame, Spring, Vector3Spring } from '../math';
import { FirearmObjectRecoil } from '../recoil/FirearmObjectRecoil';
import { MainCameraObjectRecoil } from '../recoil/MainCameraObjectRecoil';
import { SeededPRNG } from './SeededPRNG';
import {
    SimEvent,
    PhysicalShotSnapshot,
    PlayerViewSnapshot,
    WeaponPose,
    FirearmState,
    SimulationEngineConfig,
    StanceMode,
    DeviceType
} from './SimulationTypes';

export class SimulationEngine {
    private _currentTime: number = 0;
    private _eventQueue: SimEvent[] = [];
    private _prng: SeededPRNG;

    private _firearmRecoil: FirearmObjectRecoil;
    private _cameraRecoil: MainCameraObjectRecoil;

    private _aimSpring: Spring;
    private _spreadSpring: Vector3Spring;
    private _chokeSpring: Vector3Spring;
    private _spreadLastTime: number = 0;
    private _chokeLastTime: number = 0;

    private _firearmState: FirearmState;
    private _stance: StanceMode = 'stand';
    private _device: DeviceType = 'mouse';

    // CFrame Configs
    private _rootCFrame: CFrame;
    private _baseCameraOrientation: CFrame;
    private _positionOffset: Vector3;
    private _mainOffset: CFrame;
    private _hipOffset?: CFrame;
    private _aimOffset?: CFrame;
    private _barrelOffset: CFrame;
    private _sightOffset: CFrame;

    private _aimSpeed: number;
    private _firemodeDamping: number;

    private _physicalShots: PhysicalShotSnapshot[] = [];
    private _onPhysicalShot?: (snapshot: PhysicalShotSnapshot) => void;

    constructor(config: SimulationEngineConfig) {
        this._prng = new SeededPRNG(config.seed ?? 1337);

        // Virtual time clock & PRNG functions
        const clockFn = () => this._currentTime;
        const rngFn = (mean: number, variance: number) => this._prng.recoilRandom(mean, variance);

        this._firearmRecoil = new FirearmObjectRecoil(config.weaponData, clockFn, rngFn);
        this._cameraRecoil = new MainCameraObjectRecoil(
            config.weaponData.cameraRecoil || config.weaponData.recoil,
            clockFn,
            rngFn
        );

        this._aimSpeed = config.aimSpeed ?? (config.weaponData.aimspeed ?? 15);
        const initialAim = config.initialAimProgress ?? 0;
        this._aimSpring = new Spring(initialAim, 1, this._aimSpeed);
        if (initialAim > 0.5) {
            this._firearmRecoil.setAim(true, 0);
            this._cameraRecoil.setAim(true, 0);
        }

        const spreadRecover = this._firearmRecoil.getWeaponStat<number>('hipfirespreadrecover') ?? 1.0;
        const spreadStability = this._firearmRecoil.getWeaponStat<number>('hipfirestability') ?? 0.7;

        this._spreadSpring = new Vector3Spring(
            Vector3.ZERO,
            new Vector3(spreadStability, spreadStability, spreadStability),
            new Vector3(spreadRecover, spreadRecover, spreadRecover)
        );
        this._chokeSpring = new Vector3Spring();

        this._firearmState = {
            nextShotTime: 0,
            fireCount: 0,
            firemodeStability: 0,
            singleActionReady: true
        };

        this._rootCFrame = config.rootCFrame || CFrame.IDENTITY;
        this._baseCameraOrientation = config.baseCameraOrientation || CFrame.IDENTITY;
        this._positionOffset = config.positionOffset || Vector3.ZERO;
        this._mainOffset = config.mainOffset || CFrame.IDENTITY;
        this._hipOffset = config.hipOffset;
        this._aimOffset = config.aimOffset;
        this._barrelOffset = config.barrelOffset || CFrame.IDENTITY;
        this._sightOffset = config.sightOffset || CFrame.IDENTITY;

        this._firemodeDamping = config.firemodeDamping ?? (config.weaponData.firemodedamping ?? 0.9);
    }

    public get currentTime(): number {
        return this._currentTime;
    }

    public get firearmState(): Readonly<FirearmState> {
        return this._firearmState;
    }

    public get stance(): StanceMode {
        return this._stance;
    }

    public setStance(stance: StanceMode): void {
        this._stance = stance;
        this._firearmRecoil.setStance(stance);
    }

    public get device(): DeviceType {
        return this._device;
    }

    public setDevice(device: DeviceType): void {
        this._device = device;
        this._firearmRecoil.setDevice(device);
    }

    public get prng(): SeededPRNG {
        return this._prng;
    }

    public get firearmRecoil(): FirearmObjectRecoil {
        return this._firearmRecoil;
    }

    public get cameraRecoil(): MainCameraObjectRecoil {
        return this._cameraRecoil;
    }

    public get spreadSpring(): Vector3Spring {
        return this._spreadSpring;
    }

    public get physicalShots(): readonly PhysicalShotSnapshot[] {
        return this._physicalShots;
    }

    public setOnPhysicalShot(listener?: (snapshot: PhysicalShotSnapshot) => void): void {
        this._onPhysicalShot = listener;
    }

    public getAimProgress(time?: number): number {
        return this._aimSpring.p;
    }

    public isAiming(): boolean {
        return this._aimSpring.p > 0.5;
    }

    /**
     * Checks if the firearm is physically ready to fire at the specified virtual timestamp.
     * Corresponds to PF canFire() check against _nextShot.
     */
    public canFire(time?: number): boolean {
        const t = time ?? this._currentTime;
        return t >= (this._firearmState.nextShotTime - 1e-9);
    }

    /**
     * Pushes a SimEvent into the virtual-time queue preserving ascending timestamp order.
     */
    public pushEvent(event: SimEvent): void {
        let insertIdx = this._eventQueue.length;
        for (let i = 0; i < this._eventQueue.length; i++) {
            if (this._eventQueue[i].timestamp > event.timestamp) {
                insertIdx = i;
                break;
            }
        }
        this._eventQueue.splice(insertIdx, 0, event);
    }

    /**
     * Queues an AIM_INPUT event.
     */
    public pushAimInput(aiming: boolean, timestamp?: number): void {
        const t = timestamp ?? this._currentTime;
        this.pushEvent({
            type: 'AIM_INPUT',
            timestamp: t,
            aiming
        });
    }

    /**
     * Queues a FIRE_INPUT event.
     */
    public pushFireInput(timestamp?: number): boolean {
        const t = timestamp ?? this._currentTime;
        if (!this.canFire(t)) {
            return false;
        }

        this.pushEvent({
            type: 'FIRE_INPUT',
            timestamp: t
        });
        return true;
    }

    /**
     * Advances simulation state to targetTime strictly in virtual time.
     */
    public advanceTo(targetTime: number): void {
        if (targetTime < this._currentTime) {
            return;
        }

        while (this._eventQueue.length > 0 && this._eventQueue[0].timestamp <= targetTime) {
            const event = this._eventQueue.shift()!;
            this.updatePhysicsTo(event.timestamp);
            this._currentTime = event.timestamp;
            this.executeEvent(event);
        }

        this.updatePhysicsTo(targetTime);
        this._currentTime = targetTime;
    }

    /**
     * Advances analytical spring physics states to targetTime.
     */
    private updatePhysicsTo(targetTime: number): void {
        const dt = targetTime - this._currentTime;
        if (dt <= 0) return;

        // Advance Aim spring
        this._aimSpring.update(dt);

        // Advance Recoil springs (Firearm & Camera use virtual time clock internally)
        this._firearmRecoil.step(targetTime);
        this._cameraRecoil.step(targetTime);

        // Advance Spread & Choke springs
        if (targetTime > this._spreadLastTime) {
            this._spreadSpring.update(targetTime - this._spreadLastTime);
            this._spreadLastTime = targetTime;
        }
        if (targetTime > this._chokeLastTime) {
            this._chokeSpring.update(targetTime - this._chokeLastTime);
            this._chokeLastTime = targetTime;
        }
    }

    /**
     * Executes a single virtual-time simulation event.
     */
    private executeEvent(event: SimEvent): void {
        switch (event.type) {
            case 'AIM_INPUT': {
                this._aimSpring.t = event.aiming ? 1 : 0;
                this._firearmRecoil.setAim(event.aiming, event.timestamp);
                this._cameraRecoil.setAim(event.aiming, event.timestamp);
                break;
            }

            case 'FIRE_INPUT': {
                if (!this.canFire(event.timestamp)) {
                    return; // Cooldown active, fire rejected
                }

                // 1. Capture aimProgressAtFire at t_fire
                const aimProgressAtFire = this._aimSpring.p;

                // 2. Read firearm stats
                const firerate = (this.isAiming() ? this._firearmRecoil.getWeaponStat<number>('aimedfirerate') : undefined)
                    ?? (this._firearmRecoil.getWeaponStat<number>('firerate') ?? 600);
                const recoildelay = this._firearmRecoil.getRecoilDelay();
                const firedelay = this._firearmRecoil.getWeaponStat<number>('firedelay') ?? 0;

                // 3. Update Firearm Cooldown State (nextShotTime = _nextShot)
                const fireInterval = 60 / firerate;
                this._firearmState.nextShotTime = event.timestamp + fireInterval;
                this._firearmState.firemodeStability *= this._firemodeDamping;

                // 4. Schedule RECOIL_IMPULSE event with captured aimProgressAtFire
                this.pushEvent({
                    type: 'RECOIL_IMPULSE',
                    timestamp: event.timestamp + recoildelay,
                    aimProgressAtFire
                });

                // 5. Schedule SHOT_GENERATE event with captured aimProgressAtFire
                this.pushEvent({
                    type: 'SHOT_GENERATE',
                    timestamp: event.timestamp + firedelay,
                    fireCount: this._firearmState.fireCount,
                    aimProgressAtFire
                });
                break;
            }

            case 'RECOIL_IMPULSE': {
                // 1. Dynamic state evaluation at t_impulse
                this._firearmRecoil.setStance(this._stance);
                this._firearmRecoil.setDevice(this._device);
                this._firearmRecoil.setFiremodeStability(this._firearmState.firemodeStability);

                const weightMult = this._firearmRecoil.computeWeightRecoilMult();
                const cameraRecoilMult = this._firearmRecoil.computeCameraRecoilMultiplier();

                // 2. Apply impulses to firearm recoil & camera recoil
                this._firearmRecoil.fire(event.timestamp);
                this._cameraRecoil.applyImpulse(cameraRecoilMult, event.timestamp);

                // 3. Apply impulse to spread spring
                const stanceStab = this._firearmRecoil.computeStanceStability();
                const hipfirespread = this._firearmRecoil.getWeaponStat<number>('hipfirespread') ?? 1.0;
                const hipfirespreadrecover = this._firearmRecoil.getWeaponStat<number>('hipfirespreadrecover') ?? 1.0;

                const spreadMagnitude = 0.5 * (1 - event.aimProgressAtFire) * (1 - stanceStab) * hipfirespread * hipfirespreadrecover;
                const randX = this._prng.range(-1, 1);
                const randY = this._prng.range(-1, 1);
                this._spreadSpring.accelerate(new Vector3(spreadMagnitude * randX, spreadMagnitude * randY, 0));
                break;
            }

            case 'SHOT_GENERATE': {
                // Compute authoritative WeaponPose at t_shot
                // IMPORTANT: CameraHead is strictly 0% in Physical Shot CFrame chain!
                const pose = this.getWeaponPose(event.timestamp);
                const v474 = pose.v474;
                const origin = v474.p;

                // Compute shot direction (with spread)
                const spreadStat = this._firearmRecoil.getWeaponStat<number>('spread') ?? 0;
                let dir = pose.barrelForward; // default lookVector (-Z of v474)

                if (spreadStat > 0) {
                    const r1 = this._prng.nextFloat();
                    const r2 = this._prng.nextFloat();
                    const r = Math.sqrt(r1) * spreadStat;
                    const theta = r2 * 2 * Math.PI;
                    const dx = r * Math.cos(theta);
                    const dy = r * Math.sin(theta);
                    dir = v474.vectorToWorldSpace(new Vector3(dx, dy, -1)).unit;
                }

                const snapshot: PhysicalShotSnapshot = {
                    timestamp: event.timestamp,
                    fireCount: event.fireCount,
                    aimProgressAtFire: event.aimProgressAtFire,
                    origin,
                    direction: dir,
                    v474,
                    cameraBodyRecoilVec: pose.cameraBodyRecoilVec,
                    translationRecoilVec: pose.translationRecoilVec,
                    rotationRecoilVec: pose.rotationRecoilVec,
                    rotationRecoilVelVec: pose.rotationRecoilVelVec,
                    spreadSpringVec: pose.spreadSpringVec,
                    weaponPose: pose
                };

                this._physicalShots.push(snapshot);
                if (this._onPhysicalShot) {
                    this._onPhysicalShot(snapshot);
                }
                this._firearmState.fireCount++;
                break;
            }

            case 'STEP':
                break;
        }
    }

    /**
     * Gets the authoritative WeaponPose snapshot at virtual timestamp t.
     * Conforms 100% to PF _mainC0 / _mainWeld.C0 semantics.
     * Note: CameraHead has strictly 0% presence in WeaponPose.
     */
    public getWeaponPose(currentTime?: number): WeaponPose {
        const t = currentTime ?? this._currentTime;
        const cameraCFs = this._cameraRecoil.computeCFrames(this._baseCameraOrientation, this._positionOffset, t);
        const bodyRecoilVec = cameraCFs.bodyRecoilVec;
        const shakeCFrame = cameraCFs.shakeCFrame; // v186 + positionOffset (ZERO CameraHead influence)

        const firearmPV = this._firearmRecoil.getPositionsAndVelocities(t);
        const translationRecoilVec = firearmPV.translation;
        const rotationRecoilVec = firearmPV.rotation;
        const rotationRecoilVelVec = firearmPV.rotationVel;
        const spreadSpringVec = this._spreadSpring.p;

        const aimProgress = this._aimSpring.p;
        const isAim = aimProgress > 0.5;

        const mainOffset = this._computeMainOffset(aimProgress);

        const mainC0 = shakeCFrame
            .mul(mainOffset)
            .mul(CFrame.fromAxisAngle(spreadSpringVec))
            .mul(CFrame.newPos(translationRecoilVec))
            .mul(CFrame.fromAxisAngle(rotationRecoilVec));

        const activeOffset = isAim ? this._sightOffset : this._barrelOffset;
        const weaponCFrame = this._rootCFrame.mul(mainC0);
        const v474 = weaponCFrame.mul(activeOffset);
        const forward = weaponCFrame.zVector.neg();
        const barrelForward = v474.zVector.neg();

        return {
            timestamp: t,
            mainC0,
            weaponCFrame,
            activeOffset,
            v474,
            forward,
            barrelForward,
            isAiming: isAim,
            aimProgress,
            cameraBodyRecoilVec: bodyRecoilVec,
            translationRecoilVec,
            rotationRecoilVec,
            rotationRecoilVelVec,
            spreadSpringVec
        };
    }

    private _computeMainOffset(aimProgress: number): CFrame {
        if (this._hipOffset && this._aimOffset) {
            const hp = this._hipOffset.p;
            const ap = this._aimOffset.p;
            const x = hp.x + (ap.x - hp.x) * aimProgress;
            const y = hp.y + (ap.y - hp.y) * aimProgress;
            const z = hp.z + (ap.z - hp.z) * aimProgress;
            return new CFrame(this._mainOffset.r, new Vector3(x, y, z));
        }
        return this._mainOffset;
    }

    /**
     * Gets the current Player View Snapshot at virtual time t.
     * Includes CameraHead (v187) for visual camera rendering.
     */
    public getPlayerViewSnapshot(currentTime?: number): PlayerViewSnapshot {
        const t = currentTime ?? this._currentTime;
        const cameraCFs = this._cameraRecoil.computeCFrames(this._baseCameraOrientation, this._positionOffset, t);

        return {
            timestamp: t,
            baseCameraOrientation: this._baseCameraOrientation,
            v186: cameraCFs.v186,
            shakeCFrame: cameraCFs.shakeCFrame,
            v187: cameraCFs.v187,
            cameraBodyRecoilVec: cameraCFs.bodyRecoilVec,
            cameraHeadRecoilVec: cameraCFs.headRecoilVec
        };
    }
}
