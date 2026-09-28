/**
 * Independent Reference Generator for Camera Recoil System
 * 
 * Direct implementation of Lua algorithms from:
 * - MainCameraObject.Lua
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

// 2. CFrame Math Utilities (fromAxisAngle & multiplication)
class SimpleCFrame {
    constructor(matrix = [1,0,0, 0,1,0, 0,0,1], pos = { x: 0, y: 0, z: 0 }) {
        this.r = [...matrix];
        this.p = { ...pos };
    }

    static identity() {
        return new SimpleCFrame([1,0,0, 0,1,0, 0,0,1], { x: 0, y: 0, z: 0 });
    }

    static fromAxisAngle(vec) {
        const angle = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
        if (angle === 0) return SimpleCFrame.identity();

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

        return new SimpleCFrame([r00, r01, r02, r10, r11, r12, r20, r21, r22]);
    }

    mul(other) {
        if (other instanceof SimpleCFrame) {
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

            return new SimpleCFrame([r00, r01, r02, r10, r11, r12, r20, r21, r22], { x: px, y: py, z: pz });
        }
        return this;
    }

    addPos(vec) {
        return new SimpleCFrame([...this.r], {
            x: this.p.x + vec.x,
            y: this.p.y + vec.y,
            z: this.p.z + vec.z
        });
    }
}

// 3. Camera Recoil System Simulator
class CameraRecoilSystemRef {
    constructor(recoilData, rng) {
        const recoil = recoilData || {};
        this.cameraBodySprings = new RecoilSpringsRef(
            recoil.hipCameraBody,
            recoil.aimCameraBody,
            recoil.hipCameraBodyRecovery,
            recoil.aimCameraBodyRecovery,
            rng
        );

        this.cameraHeadSprings = new RecoilSpringsRef(
            recoil.hipCameraHead,
            recoil.aimCameraHead,
            recoil.hipCameraHeadRecovery,
            recoil.aimCameraHeadRecovery,
            rng
        );
    }

    setAim(aimState, currentTime = 0) {
        this.cameraBodySprings.setAim(aimState, currentTime);
        this.cameraHeadSprings.setAim(aimState, currentTime);
    }

    applyImpulse(multiplier = 1, currentTime = 0) {
        this.cameraHeadSprings.applyImpulse(multiplier, currentTime);
        this.cameraBodySprings.applyImpulse(multiplier, currentTime);
    }

    step(currentTime) {
        this.cameraBodySprings.step(currentTime);
        this.cameraHeadSprings.step(currentTime);
    }

    computeCFrames(baseOrientationCFrame, positionOffset, currentTime) {
        const bodyRecoilVec = this.cameraBodySprings.getP(currentTime);
        const headRecoilVec = this.cameraHeadSprings.getP(currentTime);

        const bodyRecoilCF = SimpleCFrame.fromAxisAngle(bodyRecoilVec);
        const headRecoilCF = SimpleCFrame.fromAxisAngle(headRecoilVec);

        // v186 = v185 * bodyRecoilCF
        const v186 = baseOrientationCFrame.mul(bodyRecoilCF);

        // _shakeCFrame = v186 + positionOffset (Viewmodel Base CFrame)
        const shakeCFrame = v186.addPos(positionOffset);

        // v187 = v186 * headRecoilCF + positionOffset (Final Camera CFrame)
        const v187 = v186.mul(headRecoilCF).addPos(positionOffset);

        return {
            bodyRecoilVec,
            headRecoilVec,
            v186,
            shakeCFrame,
            v187
        };
    }
}

// 4. Generate Reference Trace with C25 camera recoil parameters
const c25 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/C25.json'), 'utf8'));
const rng = new SeededRandom(200);

const camRecoil = new CameraRecoilSystemRef(c25.recoil, rng);
const baseOrientation = SimpleCFrame.identity();
const posOffset = { x: 0, y: 1.5, z: 0 };

const trace = [];

// Event 0: Init at t = 0
let state = camRecoil.computeCFrames(baseOrientation, posOffset, 0);
trace.push({
    time: 0,
    action: 'init',
    bodyRecoilVec: state.bodyRecoilVec,
    headRecoilVec: state.headRecoilVec,
    v186: state.v186.r,
    shakeCFrame: { r: state.shakeCFrame.r, p: state.shakeCFrame.p },
    v187: { r: state.v187.r, p: state.v187.p }
});

// Event 1: Impulse 1 at t = 0.0 (multiplier = 1.0)
camRecoil.applyImpulse(1.0, 0.0);
state = camRecoil.computeCFrames(baseOrientation, posOffset, 0.0);
trace.push({
    time: 0.0,
    action: 'impulse_1',
    bodyRecoilVec: state.bodyRecoilVec,
    headRecoilVec: state.headRecoilVec,
    v186: state.v186.r,
    shakeCFrame: { r: state.shakeCFrame.r, p: state.shakeCFrame.p },
    v187: { r: state.v187.r, p: state.v187.p }
});

// Event 2: Step at t = 0.05
camRecoil.step(0.05);
state = camRecoil.computeCFrames(baseOrientation, posOffset, 0.05);
trace.push({
    time: 0.05,
    action: 'step_0.05',
    bodyRecoilVec: state.bodyRecoilVec,
    headRecoilVec: state.headRecoilVec,
    v186: state.v186.r,
    shakeCFrame: { r: state.shakeCFrame.r, p: state.shakeCFrame.p },
    v187: { r: state.v187.r, p: state.v187.p }
});

// Event 3: Switch to AIM state at t = 0.10
camRecoil.setAim(true, 0.10);
state = camRecoil.computeCFrames(baseOrientation, posOffset, 0.10);
trace.push({
    time: 0.10,
    action: 'set_aim_true',
    bodyRecoilVec: state.bodyRecoilVec,
    headRecoilVec: state.headRecoilVec,
    v186: state.v186.r,
    shakeCFrame: { r: state.shakeCFrame.r, p: state.shakeCFrame.p },
    v187: { r: state.v187.r, p: state.v187.p }
});

// Event 4: Impulse 2 at t = 0.15 in AIM state (multiplier = 0.8)
camRecoil.applyImpulse(0.8, 0.15);
state = camRecoil.computeCFrames(baseOrientation, posOffset, 0.15);
trace.push({
    time: 0.15,
    action: 'impulse_2_aim',
    bodyRecoilVec: state.bodyRecoilVec,
    headRecoilVec: state.headRecoilVec,
    v186: state.v186.r,
    shakeCFrame: { r: state.shakeCFrame.r, p: state.shakeCFrame.p },
    v187: { r: state.v187.r, p: state.v187.p }
});

// Event 5: Step at t = 0.40 (recovery)
camRecoil.step(0.40);
state = camRecoil.computeCFrames(baseOrientation, posOffset, 0.40);
trace.push({
    time: 0.40,
    action: 'step_0.40_recovery',
    bodyRecoilVec: state.bodyRecoilVec,
    headRecoilVec: state.headRecoilVec,
    v186: state.v186.r,
    shakeCFrame: { r: state.shakeCFrame.r, p: state.shakeCFrame.p },
    v187: { r: state.v187.r, p: state.v187.p }
});

const outputPath = path.join(__dirname, '../data/reference/camera_recoil_independent_reference.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({ seed: 200, trace }, null, 2), 'utf8');

console.log('Generated camera recoil reference trace successfully at:', outputPath);
