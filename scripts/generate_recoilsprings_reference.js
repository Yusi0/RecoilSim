/**
 * Independent Reference Generator for RecoilSprings
 * 
 * Direct implementation of Lua algorithms from:
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

// 2. Simple Linear Congruential PRNG for deterministic testing
class SeededRandom {
    constructor(seed = 123456789) {
        this.seed = seed;
    }
    next() {
        this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
        return this.seed / 4294967296;
    }
}

// 3. Helper to normalize recovery parameter format
function extractRecoveryLayer(recoveryObj, axis, layerIdx) {
    if (!recoveryObj || !recoveryObj[axis]) return null;
    const axisData = recoveryObj[axis];
    let arr = axisData.a || axisData;
    if (Array.isArray(arr) && arr[layerIdx - 1]) {
        return arr[layerIdx - 1]; // [d, s]
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

// 4. RecoilSprings Simulator
class RecoilSpringsRef {
    constructor(hipParams, aimParams, hipRecParams, aimRecParams, rng) {
        this._hipParameters = hipParams;
        this._aimParameters = aimParams;
        this._hipRecoveryParameters = hipRecParams;
        this._aimRecoveryParameters = aimRecParams;
        this._lastImpulseTime = 0;
        this._lastAimState = false;
        this._vector3Springs = [];
        this._rng = rng;
        this._currentTime = 0;

        this.setVectorParameters(hipParams, 0);
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
                    const layer = params[axis][i]; // [d, s, mean, range]
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

// 5. Generate Reference File using C25 weapon data
const c25 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/C25.json'), 'utf8'));

const rng = new SeededRandom(42);
const springs = new RecoilSpringsRef(
    c25.recoil.hipRotation,
    c25.recoil.aimRotation,
    c25.recoil.hipRotationRecovery,
    c25.recoil.aimRotationRecovery,
    rng
);

const trace = [];

// Step 0: Initial state (t = 0)
trace.push({
    time: 0,
    action: 'init',
    p: springs.getP(0),
    layers: springs._vector3Springs.map(s => ({ d: { ...s.d }, s: { ...s.s }, p: { ...s.p }, v: { ...s.v } }))
});

// Step 1: Impulse 1 at t = 0.05 (multiplier 1.0)
springs.applyImpulse(1.0, 0.05);
trace.push({
    time: 0.05,
    action: 'impulse_1',
    p: springs.getP(0.05),
    layers: springs._vector3Springs.map(s => ({ d: { ...s.d }, s: { ...s.s }, p: { ...s.p }, v: { ...s.v } }))
});

// Step 2: Step at t = 0.10 (before delay 0.10 has passed: 0.05 + 0.10 = 0.15)
springs.step(0.10);
trace.push({
    time: 0.10,
    action: 'step_before_recovery',
    p: springs.getP(0.10),
    layers: springs._vector3Springs.map(s => ({ d: { ...s.d }, s: { ...s.s }, p: { ...s.p }, v: { ...s.v } }))
});

// Step 3: Step at t = 0.18 (after delay 0.15, recovery parameters should apply)
springs.step(0.18);
trace.push({
    time: 0.18,
    action: 'step_after_recovery',
    p: springs.getP(0.18),
    layers: springs._vector3Springs.map(s => ({ d: { ...s.d }, s: { ...s.s }, p: { ...s.p }, v: { ...s.v } }))
});

// Step 4: Switch to AIM state at t = 0.25
springs.setAim(true, 0.25);
trace.push({
    time: 0.25,
    action: 'set_aim_true',
    p: springs.getP(0.25),
    layers: springs._vector3Springs.map(s => ({ d: { ...s.d }, s: { ...s.s }, p: { ...s.p }, v: { ...s.v } }))
});

// Step 5: Impulse 2 at t = 0.30 in AIM state
springs.applyImpulse(1.0, 0.30);
trace.push({
    time: 0.30,
    action: 'impulse_2_aim',
    p: springs.getP(0.30),
    layers: springs._vector3Springs.map(s => ({ d: { ...s.d }, s: { ...s.s }, p: { ...s.p }, v: { ...s.v } }))
});

// Step 6: Step at t = 0.50 (well into recovery)
springs.step(0.50);
trace.push({
    time: 0.50,
    action: 'step_aim_recovery',
    p: springs.getP(0.50),
    layers: springs._vector3Springs.map(s => ({ d: { ...s.d }, s: { ...s.s }, p: { ...s.p }, v: { ...s.v } }))
});

const outputPath = path.join(__dirname, '../data/reference/recoilsprings_independent_reference.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({ seed: 42, trace }, null, 2), 'utf8');

console.log('Regenerated reference trace successfully at:', outputPath);
