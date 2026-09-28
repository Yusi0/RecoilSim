import fs from 'fs';
import path from 'path';
import { MainCameraObjectRecoil } from '../src/core/recoil/MainCameraObjectRecoil';
import { Vector3, CFrame } from '../src/core/math';

class SeededRandom {
    private seed: number;
    constructor(seed = 123456789) {
        this.seed = seed;
    }
    public next(): number {
        this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
        return this.seed / 4294967296;
    }
}

describe('MainCameraObject Recoil System Test Suite', () => {
    const referencePath = path.join(__dirname, '../data/reference/camera_recoil_independent_reference.json');
    const referenceData = JSON.parse(fs.readFileSync(referencePath, 'utf8'));

    it('10. should match the independent reference trace exactly across all trajectory steps', () => {
        const c25 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/C25.json'), 'utf8'));
        const rng = new SeededRandom(200);

        let currentTime = 0;
        const camRecoil = new MainCameraObjectRecoil(
            c25.recoil,
            () => currentTime,
            (mean, variance) => variance * 2 * rng.next() - variance + mean
        );

        const posOffset = new Vector3(0, 1.5, 0);
        const trace = referenceData.trace;

        // Step 0: init
        currentTime = 0;
        let res = camRecoil.computeCFrames(CFrame.IDENTITY, posOffset, 0);
        expect(res.bodyRecoilVec.x).toBeCloseTo(trace[0].bodyRecoilVec.x, 6);
        expect(res.headRecoilVec.x).toBeCloseTo(trace[0].headRecoilVec.x, 6);
        expect(res.shakeCFrame.p.y).toBeCloseTo(trace[0].shakeCFrame.p.y, 6);

        // Step 1: Impulse 1 at t = 0.0
        camRecoil.applyImpulse(1.0, 0.0);
        res = camRecoil.computeCFrames(CFrame.IDENTITY, posOffset, 0.0);
        expect(res.bodyRecoilVec.x).toBeCloseTo(trace[1].bodyRecoilVec.x, 6);
        expect(res.headRecoilVec.x).toBeCloseTo(trace[1].headRecoilVec.x, 6);

        // Step 2: Step at t = 0.05
        currentTime = 0.05;
        camRecoil.step(0.05);
        res = camRecoil.computeCFrames(CFrame.IDENTITY, posOffset, 0.05);
        expect(res.bodyRecoilVec.x).toBeCloseTo(trace[2].bodyRecoilVec.x, 6);
        expect(res.headRecoilVec.x).toBeCloseTo(trace[2].headRecoilVec.x, 6);

        // Step 3: Aim state at t = 0.10
        currentTime = 0.10;
        camRecoil.setAim(true, 0.10);
        res = camRecoil.computeCFrames(CFrame.IDENTITY, posOffset, 0.10);
        expect(res.bodyRecoilVec.x).toBeCloseTo(trace[3].bodyRecoilVec.x, 6);
        expect(res.headRecoilVec.x).toBeCloseTo(trace[3].headRecoilVec.x, 6);

        // Step 4: Impulse 2 at t = 0.15 in AIM state
        currentTime = 0.15;
        camRecoil.applyImpulse(0.8, 0.15);
        res = camRecoil.computeCFrames(CFrame.IDENTITY, posOffset, 0.15);
        expect(res.bodyRecoilVec.x).toBeCloseTo(trace[4].bodyRecoilVec.x, 6);
        expect(res.headRecoilVec.x).toBeCloseTo(trace[4].headRecoilVec.x, 6);

        // Step 5: Step at t = 0.40
        currentTime = 0.40;
        camRecoil.step(0.40);
        res = camRecoil.computeCFrames(CFrame.IDENTITY, posOffset, 0.40);
        expect(res.bodyRecoilVec.x).toBeCloseTo(trace[5].bodyRecoilVec.x, 6);
        expect(res.headRecoilVec.x).toBeCloseTo(trace[5].headRecoilVec.x, 6);
    });

    it('1. CameraBody Spring creation & initialization', () => {
        const hipBody = { x: [[0.5, 20, 0, 0] as [number, number, number, number]] };
        const cam = new MainCameraObjectRecoil({ hipCameraBody: hipBody });
        expect(cam.cameraBodySprings.vector3Springs.length).toBe(1);
        expect(cam.cameraBodySprings.vector3Springs[0].d.x).toBe(0.5);
    });

    it('2. CameraHead Spring creation & initialization', () => {
        const hipHead = { x: [[0.3, 35, 0, 0] as [number, number, number, number]] };
        const cam = new MainCameraObjectRecoil({ hipCameraHead: hipHead });
        expect(cam.cameraHeadSprings.vector3Springs.length).toBe(1);
        expect(cam.cameraHeadSprings.vector3Springs[0].d.x).toBe(0.3);
    });

    it('3. Same impulse multiplier passed to both springs in applyImpulse', () => {
        const recoilData = {
            hipCameraBody: { x: [[0.5, 20, 1.0, 0] as [number, number, number, number]] },
            hipCameraHead: { x: [[0.5, 20, 2.0, 0] as [number, number, number, number]] }
        };
        const cam = new MainCameraObjectRecoil(
            recoilData,
            () => 0,
            (mean) => mean
        );

        cam.applyImpulse(1.5, 0);

        // Body velocity = 1.0 * 1.5 = 1.5
        expect(cam.cameraBodySprings.vector3Springs[0].v.x).toBeCloseTo(1.5);
        // Head velocity = 2.0 * 1.5 = 3.0
        expect(cam.cameraHeadSprings.vector3Springs[0].v.x).toBeCloseTo(3.0);
    });

    it('4. Body and Head generate independent trajectories due to different recoil profiles', () => {
        const recoilData = {
            hipCameraBody: { x: [[0.3, 10, 1.0, 0] as [number, number, number, number]] },
            hipCameraHead: { x: [[0.8, 50, -2.0, 0] as [number, number, number, number]] }
        };
        const cam = new MainCameraObjectRecoil(
            recoilData,
            () => 0,
            (mean) => mean
        );

        cam.applyImpulse(1.0, 0);
        cam.step(0.05);

        const res = cam.computeCFrames(CFrame.IDENTITY, Vector3.ZERO, 0.05);
        expect(res.bodyRecoilVec.x).not.toEqual(res.headRecoilVec.x);
    });

    it('5. v186 includes CameraBody recoil', () => {
        const recoilData = {
            hipCameraBody: { x: [[0.5, 20, 1.0, 0] as [number, number, number, number]] }
        };
        const cam = new MainCameraObjectRecoil(recoilData, () => 0, (mean) => mean);
        cam.applyImpulse(1.0, 0);

        const res = cam.computeCFrames(CFrame.IDENTITY, Vector3.ZERO, 0.05);
        // v186 should not equal identity CFrame at t = 0.05
        expect(res.v186.equals(CFrame.IDENTITY)).toBe(false);
    });

    it('6. _shakeCFrame is formed from v186 + positionOffset', () => {
        const recoilData = {
            hipCameraBody: { x: [[0.5, 20, 1.0, 0] as [number, number, number, number]] }
        };
        const cam = new MainCameraObjectRecoil(recoilData, () => 0, (mean) => mean);
        cam.applyImpulse(1.0, 0);

        const posOffset = new Vector3(0, 1.5, 0);
        const res = cam.computeCFrames(CFrame.IDENTITY, posOffset, 0.05);

        expect(res.shakeCFrame.p.y).toBe(1.5);
        expect(res.shakeCFrame.r).toEqual(res.v186.r);
    });

    it('7. CameraHead applies after v186 into v187', () => {
        const recoilData = {
            hipCameraBody: { x: [[0.5, 20, 1.0, 0] as [number, number, number, number]] },
            hipCameraHead: { y: [[0.5, 20, 1.0, 0] as [number, number, number, number]] }
        };
        const cam = new MainCameraObjectRecoil(recoilData, () => 0, (mean) => mean);
        cam.applyImpulse(1.0, 0);

        const res = cam.computeCFrames(CFrame.IDENTITY, Vector3.ZERO, 0.05);
        expect(res.v187.r).not.toEqual(res.v186.r);
    });

    it('8. Final Camera CFrame equals v187', () => {
        const recoilData = {
            hipCameraBody: { x: [[0.5, 20, 1.0, 0] as [number, number, number, number]] }
        };
        const cam = new MainCameraObjectRecoil(recoilData, () => 0, (mean) => mean);

        const posOffset = new Vector3(0, 1.5, 0);
        const res = cam.computeCFrames(CFrame.IDENTITY, posOffset, 0.05);
        expect(res.v187.equals(res.shakeCFrame)).toBe(true);
    });

    it('9. Viewmodel reference frame (_shakeCFrame) does NOT include CameraHead recoil', () => {
        const recoilData = {
            hipCameraHead: { x: [[0.5, 20, 5.0, 0] as [number, number, number, number]] }
        };
        const cam = new MainCameraObjectRecoil(recoilData, () => 0, (mean) => mean);
        cam.applyImpulse(1.0, 0);

        const posOffset = new Vector3(0, 1.5, 0);
        const res = cam.computeCFrames(CFrame.IDENTITY, posOffset, 0.05);

        // shakeCFrame must remain identity CFrame because head recoil is not in shakeCFrame
        expect(res.shakeCFrame.equals(new CFrame(CFrame.IDENTITY.r, posOffset))).toBe(true);
        // v187 must be modified by head recoil at t = 0.05
        expect(res.v187.equals(res.shakeCFrame)).toBe(false);
    });
});
