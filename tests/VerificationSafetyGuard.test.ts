import * as fs from 'fs';
import * as path from 'path';
import { SimulationEngine } from '../src/core/sim/SimulationEngine';
import { MonteCarloEngine } from '../src/montecarlo/MonteCarloEngine';
import { WeaponCompiler } from '../src/core/compiler/WeaponCompiler';
import { ModifierEngine } from '../src/core/modifier/ModifierEngine';
import { NormalizedWeapon, NormalizedAttachment } from '../src/core/data';

describe('PF 11.17 Simulation Verification & Safety Guard Tests', () => {
    const provDir = path.resolve(__dirname, '../data/canonical/11.17-provisional');
    const prov1116Dir = path.resolve(__dirname, '../data/canonical/11.16');

    let weaponsMap1117: Record<string, NormalizedWeapon> = {};
    let attachmentsMap1117: Record<string, NormalizedAttachment> = {};
    const attMap = new Map<string, NormalizedAttachment>();

    beforeAll(() => {
        if (fs.existsSync(path.join(provDir, 'weapons.json'))) {
            weaponsMap1117 = JSON.parse(fs.readFileSync(path.join(provDir, 'weapons.json'), 'utf8'));
        }
        if (fs.existsSync(path.join(provDir, 'attachments.json'))) {
            attachmentsMap1117 = JSON.parse(fs.readFileSync(path.join(provDir, 'attachments.json'), 'utf8'));
            for (const [id, att] of Object.entries(attachmentsMap1117)) {
                attMap.set(id, att);
            }
        }
    });

    // -------------------------------------------------------------
    // Test A: 신규 8종 무기 (recoil = null) Zero-Recoil Silent Failure 방지
    // -------------------------------------------------------------
    describe('Test A: New weapons with recoil=null must NOT produce normal verified results', () => {
        const newWeapons = ['mcx_rattler', 'mcx_virtus', 'spear_lt', 'regulator', 'hk416a5', 'origin_12', 'titanium_fal'];

        for (const wId of newWeapons) {
            it(`flags ${wId} as UNVERIFIED_11_17 instead of silent zero-recoil`, () => {
                const detailPath = path.join(provDir, 'weapon_details', `${wId}.json`);
                if (!fs.existsSync(detailPath)) return;

                const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
                const sim = new SimulationEngine({ weaponData: detail, seed: 1234 });

                // 1. SimulationEngine verificationStatus check
                expect(sim.isRecoilVerified).toBe(false);
                expect(sim.verificationStatus.status).toBe('UNVERIFIED_11_17');
                expect(sim.verificationStatus.reason).toBe('RECOIL_DATA_MISSING');
                expect(sim.verificationStatus.isRecoilValid).toBe(false);

                // 2. MonteCarloEngine check
                const mc = new MonteCarloEngine({
                    weaponData: detail,
                    masterSeed: 1234,
                    trialCount: 1,
                    burstSize: 3
                });
                const mcRes = mc.run();
                expect(mcRes.simulationStatus).toBe('UNVERIFIED_RECOIL');
                expect(mcRes.verificationStatus?.recoil).toBe('UNVERIFIED_11_17');
                expect(mcRes.verificationStatus?.isRecoilSimulated).toBe(false);
            });
        }
    });

    // -------------------------------------------------------------
    // Test B: 신규 무기에 부착물 모디파이어 장착 시 Silent Drop 차단
    // -------------------------------------------------------------
    describe('Test B: Attachment modifiers on weapons without recoil root are tracked in unappliedModifiers', () => {
        it('tracks missing recoil root when equipping recoil modifiers on MCX Rattler', () => {
            const w = weaponsMap1117['mcx_rattler'];
            const detailPath = path.join(provDir, 'weapon_details', 'mcx_rattler.json');
            if (!w || !fs.existsSync(detailPath)) return;

            const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
            const compiler = new WeaponCompiler();

            // Find a grip or barrel attachment (e.g., Stubby Grip, Compensator)
            const compileRes = compiler.compileWeapon(
                w,
                { Underbarrel: 'Stubby Grip', Barrel: 'Compensator' },
                attMap,
                detail
            );

            expect(compileRes.unappliedModifiers.length).toBeGreaterThan(0);
            const recoilMissingMods = compileRes.unappliedModifiers.filter(
                u => u.reason === 'MISSING_RECOIL_ROOT'
            );
            expect(recoilMissingMods.length).toBeGreaterThan(0);
            expect(recoilMissingMods[0].targetPath).toBe('recoil');
        });
    });

    // -------------------------------------------------------------
    // Test C: CUTLASS 및 근접 무기 Monte Carlo Crash / NaN 방지
    // -------------------------------------------------------------
    describe('Test C: Non-firearms and Melee weapons (e.g. CUTLASS) must not crash Monte Carlo', () => {
        it('safely handles CUTLASS without throwing NaN timestamp error', () => {
            const detailPath = path.join(provDir, 'weapon_details', 'cutlass.json');
            if (!fs.existsSync(detailPath)) return;

            const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
            const mc = new MonteCarloEngine({
                weaponData: detail,
                masterSeed: 1234,
                trialCount: 1,
                burstSize: 2
            });

            const res = mc.run();
            expect(res.simulationStatus).toBe('UNSUPPORTED_WEAPON_TYPE');
            expect(res.verificationStatus?.unsupportedWeapon).toBe(true);
            expect(res.verificationStatus?.reason).toBe('MELEE_WEAPON_UNSUPPORTED');
            expect(res.impacts.length).toBe(0);
            expect(res.statistics.sampleCount).toBe(0);
        });

        it('safely handles zero or undefined firerate weapon', () => {
            const mockWeapon = {
                name: 'Dummy Weapon',
                firerate: 0,
                rpm: 0
            };
            const mc = new MonteCarloEngine({
                weaponData: mockWeapon,
                masterSeed: 1234,
                trialCount: 1,
                burstSize: 2
            });

            const res = mc.run();
            expect(res.simulationStatus).toBe('UNSUPPORTED_WEAPON_TYPE');
            expect(res.verificationStatus?.reason).toBe('MISSING_FIRE_RATE');
        });
    });

    // -------------------------------------------------------------
    // Test D: 기존 11.16 Verified 시뮬레이션 결과 무변화 보장
    // -------------------------------------------------------------
    describe('Test D: 11.16 Verified weapons preserve valid simulation outputs', () => {
        const testWeapons = ['c25', 'ak105', 'm16a3', 'm231'];

        for (const wId of testWeapons) {
            it(`verifies 11.16 ${wId} produces non-zero verified recoil`, () => {
                const detailPath = path.join(prov1116Dir, 'weapon_details', `${wId}.json`);
                if (!fs.existsSync(detailPath)) return;

                const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
                const sim = new SimulationEngine({ weaponData: detail, seed: 1234 });

                expect(sim.verificationStatus.isRecoilValid).toBe(true);
                expect(sim.verificationStatus.springCount).toBeGreaterThan(0);

                // Fire 3 shots using pushFireInput & advanceTo
                const interval = 60 / (detail.firerate || 800);
                for (let s = 0; s < 3; s++) {
                    sim.pushFireInput(s * interval);
                    sim.advanceTo((s + 1) * interval);
                }
                const pose = sim.getWeaponPose();
                const p = pose.translationRecoilVec;
                const r = pose.rotationRecoilVec;
                const disp = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) + Math.sqrt(r.x * r.x + r.y * r.y + r.z * r.z);
                expect(disp).toBeGreaterThan(0);
            });
        }
    });

    // -------------------------------------------------------------
    // Test E: 23종 Outdated Recoil 무기의 Provisional/Inherited 상태 노출
    // -------------------------------------------------------------
    describe('Test E: 23 patch-note-affected weapons are flagged as INHERITED_FROM_11_16', () => {
        const sampleOutdated = ['c25', 'groza_1', 'tar_21', 'mcx_spear', 'sr_3m', 'l22', 'as_val'];

        for (const wId of sampleOutdated) {
            it(`flags provisional ${wId} as INHERITED_FROM_11_16 with isOutdatedPhysics=true`, () => {
                const detailPath = path.join(provDir, 'weapon_details', `${wId}.json`);
                if (!fs.existsSync(detailPath)) return;

                const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
                const sim = new SimulationEngine({ weaponData: detail, seed: 1234 });

                expect(sim.verificationStatus.status).toBe('INHERITED_FROM_11_16');
                expect(sim.verificationStatus.isOutdatedPhysics).toBe(true);

                const mc = new MonteCarloEngine({
                    weaponData: detail,
                    masterSeed: 1234,
                    trialCount: 1,
                    burstSize: 2
                });
                const mcRes = mc.run();
                expect(mcRes.verificationStatus?.recoil).toBe('INHERITED_FROM_11_16');
                expect(mcRes.verificationStatus?.isOutdatedPhysics).toBe(true);
            });
        }
    });

    // -------------------------------------------------------------
    // Test F: Handling Telemetry Fallback 가시화
    // -------------------------------------------------------------
    describe('Test F: Handling Telemetry identifies DEFAULTED vs WEAPON_DATA', () => {
        it('tracks DEFAULTED aimspeed and sprintspeed on new weapons without mobility stats', () => {
            const detailPath = path.join(provDir, 'weapon_details', 'mcx_rattler.json');
            if (!fs.existsSync(detailPath)) return;

            const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
            const sim = new SimulationEngine({ weaponData: detail, seed: 1234 });

            expect(sim.handlingTelemetry.aimSpeed.isDefaulted).toBe(true);
            expect(sim.handlingTelemetry.aimSpeed.source).toBe('DEFAULTED');
            expect(sim.handlingTelemetry.sprintSpeed.isDefaulted).toBe(true);
            expect(sim.handlingTelemetry.sprintSpeed.source).toBe('DEFAULTED');
        });

        it('tracks WEAPON_DATA source on verified weapons with explicit mobility stats', () => {
            const detailPath = path.join(prov1116Dir, 'weapon_details', 'c25.json');
            if (!fs.existsSync(detailPath)) return;

            const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
            const sim = new SimulationEngine({ weaponData: detail, seed: 1234 });

            expect(sim.handlingTelemetry.aimSpeed.isDefaulted).toBe(false);
            expect(sim.handlingTelemetry.aimSpeed.source).toBe('WEAPON_DATA');
            expect(sim.handlingTelemetry.sprintSpeed.isDefaulted).toBe(false);
            expect(sim.handlingTelemetry.sprintSpeed.source).toBe('WEAPON_DATA');
        });
    });
});
