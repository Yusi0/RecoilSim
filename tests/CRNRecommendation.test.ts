import { RecommendationEngine } from '../src/recommendation/RecommendationEngine';
import { loadCompiledWeaponData } from '../src/app/c25DataLoader';
import { SimulationEngine } from '../src/core/sim/SimulationEngine';
import { deriveTrialSeed, MonteCarloEngine } from '../src/montecarlo';
import { SelectedAttachments } from '../src/core/compiler/WeaponCompiler';
import { RECOMMENDATION_ALGO_VERSION } from '../src/recommendation/RecommendationCache';

describe('Common Random Numbers (CRN) 32-Trial Exploration Verification', () => {
    jest.setTimeout(120000);

    // 1. Same master seed ensures identical random variate sequence u across candidates
    test('1. Candidates share the exact same random draw sequence u under identical trial seeds', () => {
        const compiledStock = loadCompiledWeaponData('c25', {});
        const compiledComp = loadCompiledWeaponData('c25', { Barrel: 'Compensator' });

        const testSeed = deriveTrialSeed(2026, 0);

        const engineStock = new SimulationEngine({ weaponData: compiledStock, seed: testSeed, initialAimProgress: 1.0 });
        const engineComp = new SimulationEngine({ weaponData: compiledComp, seed: testSeed, initialAimProgress: 1.0 });

        engineStock.pushAimInput(true, 0);
        engineStock.advanceTo(0.2);
        engineComp.pushAimInput(true, 0);
        engineComp.advanceTo(0.2);

        const stockU: number[] = [];
        const compU: number[] = [];

        const prngStock = (engineStock as any)._prng;
        const origStock = prngStock.nextFloat.bind(prngStock);
        prngStock.nextFloat = () => {
            const u = origStock();
            stockU.push(u);
            return u;
        };

        const prngComp = (engineComp as any)._prng;
        const origComp = prngComp.nextFloat.bind(prngComp);
        prngComp.nextFloat = () => {
            const u = origComp();
            compU.push(u);
            return u;
        };

        // Fire 1 shot in each engine
        engineStock.pushFireInput(0.2);
        engineStock.advanceTo(0.3);
        engineComp.pushFireInput(0.2);
        engineComp.advanceTo(0.3);

        expect(stockU.length).toBe(15);
        expect(compU.length).toBe(15);
        expect(stockU).toEqual(compU);
    });

    // 2. Candidate recoil Mean/Variance differences are normally applied
    test('2. Candidate recoil Mean/Variance differences are faithfully applied to shared random variates', () => {
        const engine = new RecommendationEngine();
        const candidates: SelectedAttachments[] = [
            {},
            { Barrel: 'Compensator' },
            { Barrel: 'Muzzle Brake' }
        ];

        const evals = engine.evaluateCandidates('c25', {}, candidates, {
            masterSeed: 2026,
            explorationTrials: 32
        });

        const stockEval = evals.find((e) => e.id === 'none')!;
        const compEval = evals.find((e) => e.id === 'barrel:compensator')!;
        const mbEval = evals.find((e) => e.id === 'barrel:muzzle brake')!;

        // Compensator reduces horizontal dispersion (sigmaX)
        expect(compEval.statistics.stdX).toBeLessThan(stockEval.statistics.stdX);
        // Muzzle Brake reduces vertical drift (meanY)
        expect(mbEval.statistics.meanY).toBeLessThan(stockEval.statistics.meanY);
    });

    // 3. Candidate evaluation order does NOT alter CRN results (Order Invariance)
    test('3. Shuffling candidate evaluation order produces 100% identical CRN metrics', () => {
        const engine = new RecommendationEngine();
        const candidates: SelectedAttachments[] = [
            {},
            { Barrel: 'Compensator' },
            { Barrel: 'Muzzle Brake' },
            { Underbarrel: 'Angled Grip' },
            { Barrel: 'Muzzle Brake', Underbarrel: 'Angled Grip' }
        ];

        const shuffled: SelectedAttachments[] = [
            { Barrel: 'Muzzle Brake', Underbarrel: 'Angled Grip' },
            {},
            { Underbarrel: 'Angled Grip' },
            { Barrel: 'Muzzle Brake' },
            { Barrel: 'Compensator' }
        ];

        const evalsOriginal = engine.evaluateCandidates('c25', {}, candidates, {
            masterSeed: 2026,
            explorationTrials: 32
        });

        const evalsShuffled = engine.evaluateCandidates('c25', {}, shuffled, {
            masterSeed: 2026,
            explorationTrials: 32
        });

        for (const orig of evalsOriginal) {
            const match = evalsShuffled.find((s) => s.id === orig.id)!;
            expect(match).toBeDefined();
            expect(match.statistics.meanY).toBe(orig.statistics.meanY);
            expect(match.statistics.stdX).toBe(orig.statistics.stdX);
            expect(match.statistics.stdY).toBe(orig.statistics.stdY);
            expect(match.statistics.p95Radius).toBe(orig.statistics.p95Radius);
        }
    });

    // 4. Same config + seed recommendation is strictly deterministic
    test('4. Full recommendation pipeline with 32-trial CRN is strictly deterministic across engine instances', () => {
        const engine1 = new RecommendationEngine();
        const engine2 = new RecommendationEngine();

        const res1 = engine1.recommend('c25', {}, { masterSeed: 2026, explorationTrials: 32 });
        const res2 = engine2.recommend('c25', {}, { masterSeed: 2026, explorationTrials: 32 });

        expect(res1.overall?.title).toBe(res2.overall?.title);
        expect(res1.overall?.attachments).toEqual(res2.overall?.attachments);
        expect(res1.vertical?.title).toBe(res2.vertical?.title);
        expect(res1.vertical?.attachments).toEqual(res2.vertical?.attachments);
        expect(res1.horizontal?.title).toBe(res2.horizontal?.title);
        expect(res1.horizontal?.attachments).toEqual(res2.horizontal?.attachments);
    });

    // 5. Final 500-trial evaluation result remains unchanged
    test('5. Final evaluation phase strictly executes 500 trials (15,000 shots)', () => {
        const engine = new RecommendationEngine();
        const result = engine.recommend('c25', {}, { masterSeed: 2026, explorationTrials: 32, finalTrials: 500 });

        expect(result.overall?.statistics.sampleCount).toBe(15000);
        expect(result.overall?.impacts?.length).toBe(15000);
        expect(result.current.statistics.sampleCount).toBe(15000);
        expect(result.current.impacts?.length).toBe(15000);
    });

    // 6. Recommendation algorithm cache version reflects v2.0-crn32
    test('6. Algorithm version reflects v2.0-crn32', () => {
        expect(RECOMMENDATION_ALGO_VERSION).toBe('v2.0-crn32');
    });

    // 7. Smoke test on C25, AK-105, M16A3, M231 with default 32-trial CRN exploration
    test('7. Smoke test: C25, AK-105, M16A3, M231 recommend correctly with 32-trial CRN', () => {
        const engine = new RecommendationEngine();

        // C25
        const c25Rec = engine.recommend('c25', {}, { masterSeed: 2026 });
        expect(c25Rec.overall?.attachments).toEqual({ Barrel: 'Muzzle Brake' });
        expect(c25Rec.vertical?.attachments).toEqual({ Barrel: 'Muzzle Brake', Underbarrel: 'Angled Grip' });
        expect(c25Rec.horizontal?.attachments).toEqual({ Barrel: 'Muffler' });

        // AK-105
        const akRec = engine.recommend('ak105', {}, { masterSeed: 2026 });
        expect(akRec.overall?.attachments).toEqual({ Barrel: 'Muzzle Brake' });
        expect(akRec.vertical?.attachments).toEqual({ Barrel: 'Muzzle Brake', Underbarrel: 'Angled Grip' });
        expect(akRec.horizontal?.attachments).toEqual({ Barrel: 'Compensator' });

        // M16A3
        const m16Rec = engine.recommend('m16a3', {}, { masterSeed: 2026 });
        expect(m16Rec.overall?.attachments).toEqual({ Barrel: 'Muzzle Brake' });
        expect(m16Rec.vertical?.attachments).toEqual({ Barrel: 'Muzzle Brake', Underbarrel: 'Angled Grip' });
        expect(m16Rec.horizontal?.attachments).toEqual({ Barrel: 'T-Brake' });

        // M231
        const m231Rec = engine.recommend('m231', {}, { masterSeed: 2026 });
        expect(m231Rec.overall?.attachments).toEqual({ Barrel: 'Muzzle Brake', Underbarrel: 'Romanian Grip' });
        expect(m231Rec.vertical).toBeNull(); // Absolute Pareto dominance leaves 0 non-dominated vertical candidates
        expect(m231Rec.horizontal?.attachments).toEqual({ Barrel: 'Oil Filter', Underbarrel: 'Romanian Grip' });
    });
});
