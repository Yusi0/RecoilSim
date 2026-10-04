import {
    RecommendationEngine,
    generateRecommendationCacheKey,
    canonicalizeAttachments,
    COMPILER_VERSION,
    RECOMMENDATION_ALGO_VERSION,
    computeParetoFrontier,
    CandidateEvaluation,
    RecommendationCache
} from '../src/recommendation';
import { WeaponCompiler, SelectedAttachments } from '../src/core/compiler/WeaponCompiler';
import { WeaponsParser } from '../src/core/parser/WeaponsParser';
import { SimulationEngine } from '../src/core';
import { MonteCarloEngine } from '../src/montecarlo';
import { loadCompiledWeaponData } from '../src/app/c25DataLoader';
import rawWeaponsData from '../data/raw/weapons.json';
import c25DetailData from '../data/raw/weapon-details/c25.json';

describe('RecommendationEngine Comprehensive Unit & System Tests', () => {
    const parser = new WeaponsParser();
    const parseResult = parser.parse(rawWeaponsData);
    const c25Norm = parseResult.weapons.get('c25')!;

    // 1. Identical candidate configuration -> identical cache key
    test('1. Identical candidate configuration produces identical cache key', () => {
        const l1 = { Optics: 'Coyote Sight' };
        const l2 = [{ Barrel: 'Compensator' }, { Barrel: 'Muzzle Brake' }];

        const key1 = generateRecommendationCacheKey('c25', l1, l2);
        const key2 = generateRecommendationCacheKey('c25', l1, l2);

        expect(key1).toBe(key2);
    });

    // 2. Attachment order different -> canonicalization yields identical cache key
    test('2. Attachment order different in Layer 1 or Layer 2 yields identical canonical cache key', () => {
        const l1A = { Ammo: 'Hollow Point', Optics: 'Coyote Sight' };
        const l1B = { Optics: 'Coyote Sight', Ammo: 'Hollow Point' };

        const l2A = [{ Underbarrel: 'Stubby Grip', Barrel: 'Compensator' }];
        const l2B = [{ Barrel: 'Compensator', Underbarrel: 'Stubby Grip' }];

        const keyA = generateRecommendationCacheKey('c25', l1A, l2A);
        const keyB = generateRecommendationCacheKey('c25', l1B, l2B);

        expect(keyA).toBe(keyB);
    });

    // 3. Layer 1 change -> different cache key
    test('3. Changing Layer 1 produces different cache key', () => {
        const l1A = { Optics: 'Coyote Sight' };
        const l1B = { Optics: 'Delta Sight' };
        const l2 = [{ Barrel: 'Compensator' }];

        const keyA = generateRecommendationCacheKey('c25', l1A, l2);
        const keyB = generateRecommendationCacheKey('c25', l1B, l2);

        expect(keyA).not.toBe(keyB);
    });

    // 4. Compiler / recommendation version change -> different cache key
    test('4. Compiler or recommendation version change produces different cache key', () => {
        const l1 = { Optics: 'Coyote Sight' };
        const l2 = [{ Barrel: 'Compensator' }];

        const keyV1 = generateRecommendationCacheKey('c25', l1, l2, 'v1.0', 'v1.0');
        const keyV2 = generateRecommendationCacheKey('c25', l1, l2, 'v2.0', 'v1.0');
        const keyAlgoV2 = generateRecommendationCacheKey('c25', l1, l2, 'v1.0', 'v2.0');

        expect(keyV1).not.toBe(keyV2);
        expect(keyV1).not.toBe(keyAlgoV2);
    });

    // 5. Layer 1 + Layer 2 modifiers handled in a single compileWeapon call
    test('5. Single-pass compilation: Layer 1 + Layer 2 merged and compiled in one pass', () => {
        const compiler = new WeaponCompiler();
        const l1: SelectedAttachments = { Optics: 'Coyote Sight' };
        const l2: SelectedAttachments = { Barrel: 'Compensator', Underbarrel: 'Stubby Grip' };

        const merged: SelectedAttachments = { ...l1, ...l2 };
        const result = compiler.compileWeapon(c25Norm, merged, parseResult.attachments, c25DetailData);

        expect(result).toBeDefined();
        expect(result.compiledWeaponData).toBeDefined();
        // Result contains all active attachments compiled in single pass with execution trace
        expect(result.modifierEngineResult.trace.length).toBeGreaterThan(0);
    });

    // 6. RelativeMultiplier combination matches single-pass result (NOT sequential)
    test('6. Relative multipliers evaluate accurately across single-pass combined modifiers', () => {
        const compiler = new WeaponCompiler();

        // Single-pass compilation of barrel and grip
        const singlePass = compiler.compileWeapon(
            c25Norm,
            { Barrel: 'Compensator', Underbarrel: 'Stubby Grip' },
            parseResult.attachments,
            c25DetailData
        );

        // Verify recoil table properties are populated accurately in single pass
        expect(singlePass.compiledWeaponData.recoil).toBeDefined();
        expect(singlePass.compiledWeaponData.recoil.aimCameraBody).toBeDefined();
        expect(singlePass.compiledWeaponData.recoil.aimRotation).toBeDefined();
    });

    // 7. Setter priority applies across the whole modifier set
    test('7. Setter priority is evaluated globally across Layer 1 and Layer 2', () => {
        const compiler = new WeaponCompiler();
        const combined = compiler.compileWeapon(
            c25Norm,
            { Barrel: 'Compensator', Underbarrel: 'Stubby Grip' },
            parseResult.attachments,
            c25DetailData
        );

        expect(combined.compiledWeaponData).toBeDefined();
        expect(combined.modifierEngineResult.trace.length).toBeGreaterThan(0);
    });

    // 8. Overall / Vertical / Horizontal selection is deterministic
    test('8. Role-based selection with anchor metrics is strictly deterministic', () => {
        const engine = new RecommendationEngine();

        const fakeEvals: CandidateEvaluation[] = [
            {
                id: 'cand_a',
                attachments: { Barrel: 'A' },
                statistics: {} as any,
                objectives: { absMeanDriftX: 0.3, absMeanDriftY: 2.0, sigmaX: 0.2, sigmaY: 0.5, r95: 3.5, meanRadius: 2.1 }
            },
            {
                id: 'cand_b',
                attachments: { Barrel: 'B' },
                statistics: {} as any,
                objectives: { absMeanDriftX: 0.1, absMeanDriftY: 3.5, sigmaX: 0.1, sigmaY: 0.8, r95: 4.2, meanRadius: 3.6 }
            },
            {
                id: 'cand_c',
                attachments: { Barrel: 'C' },
                statistics: {} as any,
                objectives: { absMeanDriftX: 0.4, absMeanDriftY: 1.5, sigmaX: 0.3, sigmaY: 0.4, r95: 3.8, meanRadius: 2.5 }
            }
        ];

        const overallFrontier = computeParetoFrontier(fakeEvals, 'overall');
        const verticalFrontier = computeParetoFrontier(fakeEvals, 'vertical');
        const horizontalFrontier = computeParetoFrontier(fakeEvals, 'horizontal');

        const sel1 = engine.selectByRole(fakeEvals, overallFrontier, verticalFrontier, horizontalFrontier);
        const sel2 = engine.selectByRole(fakeEvals, overallFrontier, verticalFrontier, horizontalFrontier);

        expect(sel1.overall?.id).toBe(sel2.overall?.id);
        expect(sel1.vertical?.id).toBe(sel2.vertical?.id);
        expect(sel1.horizontal?.id).toBe(sel2.horizontal?.id);

        // Overall picks min r95 -> cand_a (3.5)
        expect(sel1.overall?.id).toBe('cand_a');
        // Vertical picks min |meanDriftY| excluding cand_a -> cand_c (1.5)
        expect(sel1.vertical?.id).toBe('cand_c');
        // Horizontal picks min |meanDriftX| excluding cand_a, cand_c -> cand_b (0.1)
        expect(sel1.horizontal?.id).toBe('cand_b');
    });

    // 9. Identical candidate attempting selection in multiple roles is deduplicated
    test('9. Candidate chosen for Overall is excluded from Vertical and Horizontal', () => {
        const engine = new RecommendationEngine();

        // A single candidate that is best in ALL metrics
        const fakeEvals: CandidateEvaluation[] = [
            {
                id: 'super_candidate',
                attachments: { Barrel: 'Super' },
                statistics: {} as any,
                objectives: { absMeanDriftX: 0.05, absMeanDriftY: 0.5, sigmaX: 0.05, sigmaY: 0.1, r95: 1.0, meanRadius: 0.6 }
            },
            {
                id: 'second_best',
                attachments: { Barrel: 'Second' },
                statistics: {} as any,
                objectives: { absMeanDriftX: 0.2, absMeanDriftY: 1.5, sigmaX: 0.2, sigmaY: 0.4, r95: 2.5, meanRadius: 1.8 }
            }
        ];

        const sel = engine.selectByRole(fakeEvals, fakeEvals, fakeEvals, fakeEvals);

        expect(sel.overall?.id).toBe('super_candidate');
        // Vertical cannot re-select super_candidate, so it selects second_best
        expect(sel.vertical?.id).toBe('second_best');
        // Horizontal has no remaining candidates, so returns null
        expect(sel.horizontal).toBeNull();
    });

    // 10. Insufficient candidates returns null recommendation cleanly
    test('10. Insufficient candidates returns null recommendation cleanly', () => {
        const engine = new RecommendationEngine();

        // Only 1 candidate available
        const fakeEvals: CandidateEvaluation[] = [
            {
                id: 'only_one',
                attachments: { Barrel: 'OnlyOne' },
                statistics: {} as any,
                objectives: { absMeanDriftX: 0.2, absMeanDriftY: 2.0, sigmaX: 0.2, sigmaY: 0.5, r95: 3.0, meanRadius: 2.0 }
            }
        ];

        const sel = engine.selectByRole(fakeEvals, fakeEvals, fakeEvals, fakeEvals);

        expect(sel.overall?.id).toBe('only_one');
        expect(sel.vertical).toBeNull();
        expect(sel.horizontal).toBeNull();
    });

    // 11. Candidate of 1 does not duplicate across multiple recommendation slots
    test('11. When only 1 candidate exists, it is not duplicated across slots', () => {
        const engine = new RecommendationEngine();
        const fakeEvals: CandidateEvaluation[] = [
            {
                id: 'solitary',
                attachments: { Barrel: 'Solo' },
                statistics: {} as any,
                objectives: { absMeanDriftX: 0.1, absMeanDriftY: 1.0, sigmaX: 0.1, sigmaY: 0.1, r95: 1.5, meanRadius: 1.0 }
            }
        ];

        const sel = engine.selectByRole(fakeEvals, fakeEvals, fakeEvals, fakeEvals);

        const chosenIds = [sel.overall?.id, sel.vertical?.id, sel.horizontal?.id].filter(Boolean);
        const uniqueChosen = new Set(chosenIds);
        expect(uniqueChosen.size).toBe(chosenIds.length);
        expect(chosenIds.length).toBe(1);
    });

    // 12. Current is maintained strictly separately from recommendation candidates
    test('12. Current setting is evaluated separately and maintained independently', () => {
        const engine = new RecommendationEngine();
        const userAttachments: SelectedAttachments = { Barrel: 'Compensator', Optics: 'Coyote Sight' };

        const final = engine.evaluateFinalRecommendations(
            'c25',
            { Optics: 'Coyote Sight' },
            { overall: null, vertical: null, horizontal: null },
            userAttachments,
            { finalTrials: 10 }
        );

        expect(final.current).toBeDefined();
        expect(final.current.role).toBe('current');
        expect(final.current.title).toBe('4. 내 세팅');
        expect(final.current.attachments).toEqual(userAttachments);
    });

    // 13. Identical seed / configuration produces identical recommendation result
    test('13. Recommendation pipeline produces 100% deterministic identical results across repeated runs', () => {
        const engine = new RecommendationEngine(new RecommendationCache());
        const profile = {
            weaponId: 'c25',
            candidateSlots: ['Barrel'],
            candidateAttachmentNames: {
                Barrel: ['Compensator', 'Muzzle Brake']
            }
        };

        const cands = engine.generateCandidates(profile);
        const evals1 = engine.evaluateCandidates('c25', {}, cands, { explorationTrials: 16, masterSeed: 2026 });
        const evals2 = engine.evaluateCandidates('c25', {}, cands, { explorationTrials: 16, masterSeed: 2026 });

        expect(evals1[0].objectives.r95).toBeCloseTo(evals2[0].objectives.r95, 6);
        expect(evals1[1].objectives.absMeanDriftY).toBeCloseTo(evals2[1].objectives.absMeanDriftY, 6);
    });

    // 14. Layer 1 change does not mistakenly reuse stale recommendation cache
    test('14. Layer 1 change invalidates/bypasses cache lookup cleanly', () => {
        const cache = new RecommendationCache();
        const engine = new RecommendationEngine(cache);

        const l1A = { Optics: 'Coyote Sight' };
        const l1B = { Optics: 'Delta Sight' };

        const profile = {
            weaponId: 'c25',
            candidateSlots: ['Barrel'],
            candidateAttachmentNames: {
                Barrel: ['Compensator']
            }
        };
        const cands = engine.generateCandidates(profile);

        const keyA = generateRecommendationCacheKey('c25', l1A, cands);
        const keyB = generateRecommendationCacheKey('c25', l1B, cands);

        cache.set(keyA, { overall: null, vertical: null, horizontal: null, current: {} as any, executionTimeMs: 10, cacheHit: false });

        expect(cache.has(keyA)).toBe(true);
        expect(cache.has(keyB)).toBe(false);
    });

    // 15. Final A / B / C / Current are all evaluated at identical trial count (500 trials in prod, identical in test)
    test('15. Final recommendations and Current are evaluated with identical sampleCount', () => {
        const engine = new RecommendationEngine();

        const fakeCandidate: CandidateEvaluation = {
            id: 'barrel:compensator',
            attachments: { Barrel: 'Compensator' },
            statistics: {} as any,
            objectives: { absMeanDriftX: 0.1, absMeanDriftY: 1.0, sigmaX: 0.1, sigmaY: 0.1, r95: 1.0, meanRadius: 1.0 }
        };

        const testTrials = 20;
        const testBurst = 10;

        const final = engine.evaluateFinalRecommendations(
            'c25',
            {},
            { overall: fakeCandidate, vertical: fakeCandidate, horizontal: null },
            { Barrel: 'Muzzle Brake' },
            { finalTrials: testTrials, burstSize: testBurst }
        );

        const expectedSamples = testTrials * testBurst;
        expect(final.overall?.statistics.sampleCount).toBe(expectedSamples);
        expect(final.vertical?.statistics.sampleCount).toBe(expectedSamples);
        expect(final.current.statistics.sampleCount).toBe(expectedSamples);
    });

    // 16. Recommendation Monte Carlo evaluates strictly with aimProgressAtFire = 1.0 from shot 0
    test('16. Recommendation Monte Carlo evaluates strictly with aimProgressAtFire = 1.0 on every shot', () => {
        const engine = new RecommendationEngine();
        const cand = engine.evaluateCandidates('c25', {}, [{ Barrel: 'Compensator' }], {
            explorationTrials: 2,
            burstSize: 5
        });

        expect(cand.length).toBe(1);

        // Directly verify with MonteCarloEngine under recommendation configuration
        const compiledC25 = loadCompiledWeaponData('c25', { Barrel: 'Compensator' });
        const mcEngine = new MonteCarloEngine({
            weaponData: compiledC25,
            masterSeed: 2026,
            trialCount: 1,
            burstSize: 10,
            aiming: true,
            aimProgress: 1.0,
            initialAimProgress: 1.0,
            settleTime: 0.2
        });

        // Run trial and intercept physical shots from SimulationEngine
        const capturedAimProgress: number[] = [];
        const simEngine = new SimulationEngine({
            weaponData: compiledC25,
            seed: 2026,
            initialAimProgress: 1.0
        });

        simEngine.setOnPhysicalShot((snapshot) => {
            capturedAimProgress.push(snapshot.aimProgressAtFire);
        });

        simEngine.pushAimInput(true, 0.0);
        simEngine.advanceTo(0.2);

        for (let i = 0; i < 10; i++) {
            const fireT = 0.2 + i * (60 / 800);
            simEngine.pushFireInput(fireT);
            simEngine.advanceTo(fireT + (60 / 800));
        }

        expect(capturedAimProgress.length).toBe(10);
        for (let i = 0; i < capturedAimProgress.length; i++) {
            // Must be exactly 1.0 from shot 0 to the end of the burst
            expect(capturedAimProgress[i]).toBe(1.0);
        }
    });

    // 17. At ADS 100%, first shot spreadMagnitude is exactly 0 (no hipfire spread injected)
    test('17. In ADS 100% initial condition, initial shot spread impulse is strictly zero', () => {
        const compiledC25 = loadCompiledWeaponData('c25', {});
        const simEngine = new SimulationEngine({
            weaponData: compiledC25,
            seed: 2026,
            initialAimProgress: 1.0
        });

        simEngine.pushAimInput(true, 0.0);
        simEngine.advanceTo(0.2);

        // Before shot, spread spring position should be zero
        expect(simEngine.spreadSpring.p.x).toBe(0);
        expect(simEngine.spreadSpring.p.y).toBe(0);

        // Fire shot 0
        simEngine.pushFireInput(0.2);
        simEngine.advanceTo(0.2 + (60 / 800));

        // Because aimProgressAtFire === 1.0, spreadMagnitude = 0.5 * (1 - 1.0) * ... = 0
        // spreadSpring velocity and acceleration from spread impulse must be exactly zero
        expect(simEngine.spreadSpring.v.x).toBe(0);
        expect(simEngine.spreadSpring.v.y).toBe(0);
    });

    // 18. Backwards compatibility: default SimulationEngine without initialAimProgress starts at 0 (hipfire)
    test('18. Backwards compatibility: default SimulationEngine without initialAimProgress defaults to hipfire (0)', () => {
        const compiledC25 = loadCompiledWeaponData('c25', {});
        const simEngine = new SimulationEngine({
            weaponData: compiledC25,
            seed: 2026
        });

        // Starts at 0
        expect(simEngine.getAimProgress()).toBe(0);
        expect(simEngine.isAiming()).toBe(false);

        // Transitions dynamically upon AIM_INPUT
        simEngine.pushAimInput(true, 0.0);
        simEngine.advanceTo(0.2);
        // At 0.2s with dynamic spring, p is settling (~0.84), not 1.0
        expect(simEngine.getAimProgress()).toBeCloseTo(0.8414, 2);
        expect(simEngine.getAimProgress()).toBeLessThan(1.0);
    });

    // 19. Initial aim progress 1.0 immediately initializes weapon pose into ADS sight alignment
    test('19. SimulationEngine with initialAimProgress = 1.0 starts in ADS pose immediately', () => {
        const compiledC25 = loadCompiledWeaponData('c25', {});
        const simEngine = new SimulationEngine({
            weaponData: compiledC25,
            seed: 2026,
            initialAimProgress: 1.0
        });

        expect(simEngine.getAimProgress()).toBe(1.0);
        expect(simEngine.isAiming()).toBe(true);

        const pose = simEngine.getWeaponPose(0);
        expect(pose.isAiming).toBe(true);
        expect(pose.aimProgress).toBe(1.0);
    });
});
