/**
 * Independent Reference Generator for FirearmObject Recoil Integration
 * 
 * Direct implementation of Lua algorithms from:
 * - FirearmObject_Recoil.lua
 * - RecoilSprings.lua
 * - Vector3Spring.lua
 * - Spring.lua
 * 
 * DOES NOT import any TypeScript codebase modules.
 */

const fs = require('fs');
const path = require('path');

// 1. Math utilities matching Lua getPV (Spring.lua)
function getPV(d, s, p0, v0, p1, dt) {
    if (s === 0) {
        return { p: p0 + dt * v0, v: v0 };
    }
    const v14 = s * dt;
    const v15 = d * d;
    let v17, v19, v20;

    if (v15 < 1) {
        v17 = Math.sqrt(1 - v15);
        const v18 = Math.exp(-d * v14) / v17;
        v19 = v18 * Math.cos(v17 * v14);
        v20 = v18 * Math.sin(v17 * v14);
    } else if (v15 === 1) {
        v17 = 1;
        v19 = Math.exp(-d * v14) / v17;
        v20 = v19 * v14;
    } else {
        v17 = Math.sqrt(v15 - 1);
        const v21 = Math.exp((-d + v17) * v14) / (2 * v17);
        const v22 = Math.exp((-d - v17) * v14) / (2 * v17);
        v19 = v21 + v22;
        v20 = v21 - v22;
    }

    const v23 = v17 * v19 + d * v20;
    const v24 = v20 / s;
    const v25 = -s * v20;
    const v26 = v17 * v19 - d * v20;
    const v27 = p0 - p1;

    return {
        p: v23 * v27 + v24 * v0 + p1,
        v: v25 * v27 + v26 * v0
    };
}

class Vector3SpringRef {
    constructor(d = { x: 1, y: 1, z: 1 }, s = { x: 1, y: 1, z: 1 }, p0 = { x: 0, y: 0, z: 0 }) {
        this._d = { ...d };
        this._s = { ...s };
        this._p0 = { ...p0 };
        this._v0 = { x: 0, y: 0, z: 0 };
        this._p1 = { ...p0 };
        this._t0 = 0;
    }

    sync(currentTime) {
        if (currentTime !== this._t0) {
            const dt = currentTime - this._t0;
            const rx = getPV(this._d.x, this._s.x, this._p0.x, this._v0.x, this._p1.x, dt);
            const ry = getPV(this._d.y, this._s.y, this._p0.y, this._v0.y, this._p1.y, dt);
            const rz = getPV(this._d.z, this._s.z, this._p0.z, this._v0.z, this._p1.z, dt);

            this._p0 = { x: rx.p, y: ry.p, z: rz.p };
            this._v0 = { x: rx.v, y: ry.v, z: rz.v };
            this._t0 = currentTime;
        }
    }

    get p() { return this._p0; }
    set p(val) { this._p0 = { ...val }; }
    get v() { return this._v0; }
    set v(val) { this._v0 = { ...val }; }
    get d() { return this._d; }
    set d(val) { this._d = { ...val }; }
    get s() { return this._s; }
    set s(val) { this._s = { ...val }; }
}

class SeededRandom {
    constructor(seed = 123456789) {
        this.seed = seed;
    }
    next() {
        this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
        return this.seed / 4294967296;
    }
}

function extractRecoveryLayer(recoveryObj, axis, layerIdx) {
    if (!recoveryObj || !recoveryObj[axis]) return null;
    const axisData = recoveryObj[axis];
    let arr = axisData.a || axisData;
    if (Array.isArray(arr) && arr[layerIdx - 1]) {
        return arr[layerIdx - 1];
    }
    return null;
}

function extractRecoveryDelay(recoveryObj, axis) {
    if (!recoveryObj || !recoveryObj[axis]) return 0;
    const axisData = recoveryObj[axis];
    if (axisData.d && typeof axisData.d.delay === 'number') {
        return axisData.d.delay;
    }
    if (typeof axisData.delay === 'number') {
        return axisData.delay;
    }
    return 0;
}

class RecoilSpringsRef {
    constructor(hipParams, aimParams, hipRecParams, aimRecParams, rng) {
        this._hipParameters = hipParams || {};
        this._aimParameters = aimParams || {};
        this._hipRecoveryParameters = hipRecParams || {};
        this._aimRecoveryParameters = aimRecParams || {};
        this._lastImpulseTime = 0;
        this._lastAimState = false;
        this._vector3Springs = [];
        this._rng = rng;
        this._currentTime = 0;

        this.setVectorParameters(this._hipParameters, 0);
    }

    setVectorParameters(params, currentTime = this._currentTime) {
        this._currentTime = currentTime;
        const axes = ['x', 'y', 'z'];
        let maxLayers = 0;
        for (const axis of axes) {
            if (params[axis] && Array.isArray(params[axis])) {
                maxLayers = Math.max(maxLayers, params[axis].length);
            }
        }

        while (this._vector3Springs.length < maxLayers) {
            const spring = new Vector3SpringRef();
            spring._t0 = this._currentTime;
            this._vector3Springs.push(spring);
        }

        for (let i = 0; i < this._vector3Springs.length; i++) {
            const spring = this._vector3Springs[i];
            spring.sync(this._currentTime);

            let d = { ...spring.d };
            let s = { ...spring.s };

            for (const axis of axes) {
                if (params[axis] && params[axis][i]) {
                    const layer = params[axis][i];
                    d[axis] = layer[0];
                    s[axis] = layer[1];
                }
            }

            spring.d = d;
            spring.s = s;
        }
    }

    setSingleAxisParameters(params, axis, currentTime = this._currentTime) {
        this._currentTime = currentTime;
        for (let i = 0; i < this._vector3Springs.length; i++) {
            const spring = this._vector3Springs[i];
            spring.sync(this._currentTime);

            const layer = extractRecoveryLayer(params, axis, i + 1);
            if (layer) {
                const d = { ...spring.d };
                const s = { ...spring.s };
                d[axis] = layer[0];
                s[axis] = layer[1];
                spring.d = d;
                spring.s = s;
            }
        }
    }

    setAim(aimState, currentTime = this._currentTime) {
        this._currentTime = currentTime;
        const params = aimState ? this._aimParameters : this._hipParameters;
        this._lastAimState = aimState;
        this.setVectorParameters(params, currentTime);
        return params;
    }

    getUniformDist(mean, variance) {
        return variance * 2 * this._rng.next() - variance + mean;
    }

    applyImpulse(multiplier = 1, currentTime = 0) {
        this._currentTime = currentTime;
        const currentParams = this.setAim(this._lastAimState, currentTime);
        const axes = ['x', 'y', 'z'];

        for (let i = 0; i < this._vector3Springs.length; i++) {
            const spring = this._vector3Springs[i];
            spring.sync(this._currentTime);

            let impulse = { x: 0, y: 0, z: 0 };
            for (const axis of axes) {
                if (currentParams[axis] && currentParams[axis][i]) {
                    const layer = currentParams[axis][i];
                    impulse[axis] += this.getUniformDist(layer[2], layer[3]);
                }
            }

            spring.v = {
                x: spring.v.x + impulse.x * multiplier,
                y: spring.v.y + impulse.y * multiplier,
                z: spring.v.z + impulse.z * multiplier
            };
        }

        this._lastImpulseTime = currentTime;
    }

    step(currentTime) {
        this._currentTime = currentTime;
        for (let i = 0; i < this._vector3Springs.length; i++) {
            this._vector3Springs[i].sync(currentTime);
        }

        const recoveryParams = this._lastAimState ? this._aimRecoveryParameters : this._hipRecoveryParameters;
        if (!recoveryParams) return;

        const axes = ['x', 'y', 'z'];
        for (const axis of axes) {
            const delay = extractRecoveryDelay(recoveryParams, axis);
            if (this._lastImpulseTime + delay < currentTime) {
                this.setSingleAxisParameters(recoveryParams, axis, currentTime);
            }
        }
    }

    getP(currentTime) {
        this._currentTime = currentTime;
        let pos = { x: 0, y: 0, z: 0 };
        for (let i = 0; i < this._vector3Springs.length; i++) {
            const spring = this._vector3Springs[i];
            spring.sync(currentTime);
            pos.x += spring.p.x;
            pos.y += spring.p.y;
            pos.z += spring.p.z;
        }
        return pos;
    }
}

// Stance & Device Multiplier Helpers according to PF Lua
function computeStanceStability(stance) {
    switch (stance) {
        case 'crouch': return 0.25;
        case 'prone': return 0.50;
        case 'stand':
        default: return 0.0;
    }
}

function computeDeviceMultiplier(device) {
    switch (device) {
        case 'touch': return 0.6;
        case 'controller': return 0.8;
        case 'mouse':
        default: return 1.0;
    }
}

function computeCameraRecoilMultiplier(firemodeStability, stance, device, weaponCameraRecoilMult = 1) {
    const stanceStab = computeStanceStability(stance);
    const deviceMult = computeDeviceMultiplier(device);
    const totalStab = (1 - firemodeStability) * (1 - stanceStab) * deviceMult;
    return totalStab * weaponCameraRecoilMult;
}

// 5. Build Firearm Object Recoil Reference simulation
class FirearmObjectRecoilRef {
    constructor(weaponData, rng) {
        this.weaponData = weaponData;
        this.rng = rng;
        this.aiming = false;
        this.stance = 'stand';
        this.device = 'mouse';
        this.firemodeStability = 0;

        const recoil = weaponData.recoil || {};
        this.translationSprings = new RecoilSpringsRef(
            recoil.hipTranslation,
            recoil.aimTranslation,
            recoil.hipTranslationRecovery,
            recoil.aimTranslationRecovery,
            rng
        );

        this.rotationSprings = new RecoilSpringsRef(
            recoil.hipRotation,
            recoil.aimRotation,
            recoil.hipRotationRecovery,
            recoil.aimRotationRecovery,
            rng
        );
    }

    setAim(aimState, currentTime = 0) {
        this.aiming = aimState;
        this.translationSprings.setAim(aimState, currentTime);
        this.rotationSprings.setAim(aimState, currentTime);
    }

    getRecoilDelay() {
        if (this.weaponData.recoildelay !== undefined) {
            return this.weaponData.recoildelay;
        }
        return 0;
    }

    computeWeightRecoilMult() {
        return this.weaponData.weightrecoilmult !== undefined ? this.weaponData.weightrecoilmult : 1.0;
    }

    fire(currentTime = 0) {
        const recoilDelay = this.getRecoilDelay();
        const impulseTime = currentTime + recoilDelay;
        const weightMult = this.computeWeightRecoilMult();

        this.translationSprings.applyImpulse(weightMult, impulseTime);
        this.rotationSprings.applyImpulse(weightMult, impulseTime);

        return { impulseTime, weightMult };
    }

    step(currentTime) {
        this.translationSprings.step(currentTime);
        this.rotationSprings.step(currentTime);
    }

    getPositions(currentTime) {
        return {
            translation: this.translationSprings.getP(currentTime),
            rotation: this.rotationSprings.getP(currentTime)
        };
    }
}

// Generate test reference trajectory using C25 data
const c25 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/C25.json'), 'utf8'));
const rng = new SeededRandom(100);
const firearm = new FirearmObjectRecoilRef(c25, rng);

const trace = [];

// Event 0: Init at t = 0
trace.push({
    time: 0,
    action: 'init',
    pos: firearm.getPositions(0),
    cameraRecoilMult: computeCameraRecoilMultiplier(0, 'stand', 'mouse', c25.camerarecoilmult || 1)
});

// Event 1: Fire Shot 1 at t = 0.0 (stand, mouse)
firearm.fire(0.0);
trace.push({
    time: 0.0,
    action: 'fire_1',
    pos: firearm.getPositions(0.0)
});

// Event 2: Step at t = 0.05
firearm.step(0.05);
trace.push({
    time: 0.05,
    action: 'step_0.05',
    pos: firearm.getPositions(0.05)
});

// Event 3: Fire Shot 2 at t = 0.10 (rapid consecutive shot)
firearm.fire(0.10);
trace.push({
    time: 0.10,
    action: 'fire_2',
    pos: firearm.getPositions(0.10)
});

// Event 4: Step at t = 0.15
firearm.step(0.15);
trace.push({
    time: 0.15,
    action: 'step_0.15',
    pos: firearm.getPositions(0.15)
});

// Event 5: Switch to Aim State and Crouch Stance at t = 0.20
firearm.setAim(true, 0.20);
firearm.stance = 'crouch';
trace.push({
    time: 0.20,
    action: 'set_aim_crouch',
    pos: firearm.getPositions(0.20),
    cameraRecoilMult: computeCameraRecoilMultiplier(0, 'crouch', 'mouse', c25.camerarecoilmult || 1)
});

// Event 6: Fire Shot 3 in AIM state at t = 0.25
firearm.fire(0.25);
trace.push({
    time: 0.25,
    action: 'fire_3_aim',
    pos: firearm.getPositions(0.25)
});

// Event 7: Step at t = 0.50 (into recovery)
firearm.step(0.50);
trace.push({
    time: 0.50,
    action: 'step_0.50_recovery',
    pos: firearm.getPositions(0.50)
});

const outputPath = path.join(__dirname, '../data/reference/firearm_recoil_independent_reference.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({ seed: 100, trace }, null, 2), 'utf8');

console.log('Generated firearm recoil reference trace successfully at:', outputPath);
