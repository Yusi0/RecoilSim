import fs from 'fs';
import path from 'path';
import { FirearmObjectRecoil } from '../src/core/recoil/FirearmObjectRecoil';
import { WeaponCompiler, SelectedAttachments } from '../src/core/compiler/WeaponCompiler';
import { WeaponsParser } from '../src/core/parser/WeaponsParser';

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

describe('FirearmObject Recoil Integration Test Suite', () => {
    const referencePath = path.join(__dirname, '../data/reference/firearm_recoil_independent_reference.json');
    const referenceData = JSON.parse(fs.readFileSync(referencePath, 'utf8'));

    it('should match the independent reference trace exactly across all firing and recoil steps', () => {
        const c25 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/C25.json'), 'utf8'));
        const rng = new SeededRandom(100);

        let currentTime = 0;
        const firearm = new FirearmObjectRecoil(
            c25,
            () => currentTime,
            (mean, variance) => variance * 2 * rng.next() - variance + mean
        );

        const trace = referenceData.trace;

        // Step 0: Init at t = 0
        currentTime = 0;
        let pos = firearm.getPositions(0);
        expect(pos.translation.x).toBeCloseTo(trace[0].pos.translation.x, 6);
        expect(pos.rotation.x).toBeCloseTo(trace[0].pos.rotation.x, 6);
        expect(firearm.computeCameraRecoilMultiplier()).toBeCloseTo(trace[0].cameraRecoilMult, 6);

        // Step 1: Fire Shot 1 at t = 0.0
        firearm.fire(0.0);
        pos = firearm.getPositions(0.0);
        expect(pos.translation.x).toBeCloseTo(trace[1].pos.translation.x, 6);
        expect(pos.rotation.x).toBeCloseTo(trace[1].pos.rotation.x, 6);

        // Step 2: Step at t = 0.05
        currentTime = 0.05;
        firearm.step(0.05);
        pos = firearm.getPositions(0.05);
        expect(pos.translation.x).toBeCloseTo(trace[2].pos.translation.x, 6);
        expect(pos.rotation.x).toBeCloseTo(trace[2].pos.rotation.x, 6);

        // Step 3: Fire Shot 2 at t = 0.10
        currentTime = 0.10;
        firearm.fire(0.10);
        pos = firearm.getPositions(0.10);
        expect(pos.translation.x).toBeCloseTo(trace[3].pos.translation.x, 6);
        expect(pos.rotation.x).toBeCloseTo(trace[3].pos.rotation.x, 6);

        // Step 4: Step at t = 0.15
        currentTime = 0.15;
        firearm.step(0.15);
        pos = firearm.getPositions(0.15);
        expect(pos.translation.x).toBeCloseTo(trace[4].pos.translation.x, 6);
        expect(pos.rotation.x).toBeCloseTo(trace[4].pos.rotation.x, 6);

        // Step 5: Aim & Crouch at t = 0.20
        currentTime = 0.20;
        firearm.setAim(true, 0.20);
        firearm.setStance('crouch');
        pos = firearm.getPositions(0.20);
        expect(pos.translation.x).toBeCloseTo(trace[5].pos.translation.x, 6);
        expect(pos.rotation.x).toBeCloseTo(trace[5].pos.rotation.x, 6);
        expect(firearm.computeCameraRecoilMultiplier()).toBeCloseTo(trace[5].cameraRecoilMult, 6);

        // Step 6: Fire Shot 3 in Aim state at t = 0.25
        currentTime = 0.25;
        firearm.fire(0.25);
        pos = firearm.getPositions(0.25);
        expect(pos.translation.x).toBeCloseTo(trace[6].pos.translation.x, 6);
        expect(pos.rotation.x).toBeCloseTo(trace[6].pos.rotation.x, 6);

        // Step 7: Recovery step at t = 0.50
        currentTime = 0.50;
        firearm.step(0.50);
        pos = firearm.getPositions(0.50);
        expect(pos.translation.x).toBeCloseTo(trace[7].pos.translation.x, 6);
        expect(pos.rotation.x).toBeCloseTo(trace[7].pos.rotation.x, 6);
    });

    it('1. Character stance stability: stand (0.0), crouch (0.25), prone (0.50)', () => {
        const c25 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/C25.json'), 'utf8'));
        const firearm = new FirearmObjectRecoil(c25);

        firearm.setStance('stand');
        expect(firearm.computeStanceStability()).toBe(0.0);

        firearm.setStance('crouch');
        expect(firearm.computeStanceStability()).toBe(0.25);

        firearm.setStance('prone');
        expect(firearm.computeStanceStability()).toBe(0.50);
    });

    it('2. Device multiplier: mouse (1.0), touch (0.6), controller (0.8)', () => {
        const c25 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/C25.json'), 'utf8'));
        const firearm = new FirearmObjectRecoil(c25);

        firearm.setDevice('mouse');
        expect(firearm.computeDeviceMultiplier()).toBe(1.0);

        firearm.setDevice('touch');
        expect(firearm.computeDeviceMultiplier()).toBe(0.6);

        firearm.setDevice('controller');
        expect(firearm.computeDeviceMultiplier()).toBe(0.8);
    });

    it('3. Firemode stability: reduces camera recoil multiplier without altering weapon recoil weight', () => {
        const c25 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/C25.json'), 'utf8'));
        const firearm = new FirearmObjectRecoil(c25);

        firearm.setFiremodeStability(0.2); // 20% stability
        firearm.setStance('stand');
        firearm.setDevice('mouse');

        // cameraRecoilMult = (1 - 0.2) * (1 - 0.0) * 1.0 * camerarecoilmult
        const expectedCamMult = 0.8 * (c25.camerarecoilmult || 1.0);
        expect(firearm.computeCameraRecoilMultiplier()).toBeCloseTo(expectedCamMult);

        // Weapon recoil weight remains 1.0 (or weightrecoilmult)
        expect(firearm.computeWeightRecoilMult()).toBe(1.0);
    });

    it('4. Translation and Rotation springs receive impulses independently on fire()', () => {
        const c25 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/C25.json'), 'utf8'));
        const firearm = new FirearmObjectRecoil(
            c25,
            () => 0,
            (mean) => mean
        );

        firearm.fire(0);

        // Verify translation springs velocity changed
        const tVel = firearm.translationSprings.vector3Springs[0].v;
        expect(tVel.x).not.toBe(0);

        // Verify rotation springs velocity changed
        const rVel = firearm.rotationSprings.vector3Springs[0].v;
        expect(rVel.x).not.toBe(0);
    });

    it('5. Consecutive rapid fire: accumulates velocity across shots', () => {
        const c25 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/C25.json'), 'utf8'));
        const firearm = new FirearmObjectRecoil(
            c25,
            () => 0,
            (mean) => mean
        );

        firearm.fire(0);
        const v1 = firearm.rotationSprings.vector3Springs[0].v.x;

        firearm.fire(0);
        const v2 = firearm.rotationSprings.vector3Springs[0].v.x;

        expect(v2).toBeCloseTo(v1 * 2);
    });

    it('6. recoildelay: accurately retrieved from weapon data', () => {
        const customWeaponData = {
            recoil: {},
            recoildelay: 0.03
        };
        const firearm = new FirearmObjectRecoil(customWeaponData as any);
        expect(firearm.getRecoilDelay()).toBe(0.03);
    });

    it('7. Full Pipeline Integration: WeaponCompiler -> FirearmObjectRecoil -> Trajectory', () => {
        const rawFilePath = path.join(__dirname, '../data/raw/weapons.json');
        const rawDetailPath = path.join(__dirname, '../data/raw/weapon-details/c25.json');
        const rawWeaponsData = JSON.parse(fs.readFileSync(rawFilePath, 'utf-8'));
        const c25BaseData = JSON.parse(fs.readFileSync(rawDetailPath, 'utf-8'));

        const parser = new WeaponsParser();
        const parseResult = parser.parse(rawWeaponsData);
        const c25Normalized = parseResult.weapons.get('c25')!;

        const compiler = new WeaponCompiler();
        const selectedAttachments: SelectedAttachments = {
            Barrel: 'R2 Suppressor'
        };

        const result = compiler.compileWeapon(c25Normalized, selectedAttachments, parseResult.attachments, c25BaseData);

        let time = 0;
        const firearm = new FirearmObjectRecoil(result.compiledWeaponData, () => time);
        firearm.fire(0);

        time = 0.05;
        firearm.step(0.05);
        const pos = firearm.getPositions(0.05);

        expect(typeof pos.translation.x).toBe('number');
        expect(typeof pos.rotation.x).toBe('number');
    });
});
