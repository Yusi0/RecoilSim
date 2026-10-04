import { SelectedAttachments } from '../core/compiler/WeaponCompiler';
import { loadCompiledWeaponData, getAvailableAttachmentsForWeapon } from '../app/c25DataLoader';
import { MonteCarloEngine } from '../montecarlo/MonteCarloEngine';
import {
    RecommendationRole,
    WeaponRecommendationProfile,
    CandidateEvaluation,
    FinalRecommendation,
    RecommendationResultSet
} from './RecommendationTypes';
import { computeParetoFrontier } from './ParetoFrontier';
import {
    canonicalizeAttachments,
    generateRecommendationCacheKey,
    RecommendationCache
} from './RecommendationCache';
import { getWeaponRecommendationProfile } from './WeaponRecommendationProfiles';

export interface RecommendationEngineOptions {
    targetDistance?: number;
    burstSize?: number;
    explorationTrials?: number; // Default 32 trials (Common Random Numbers / CRN)
    finalTrials?: number;       // Default 500 trials (unchanged)
    masterSeed?: number;        // Default 2026
}

export class RecommendationEngine {
    private _cache: RecommendationCache;

    constructor(cache?: RecommendationCache) {
        this._cache = cache || new RecommendationCache();
    }

    public get cache(): RecommendationCache {
        return this._cache;
    }

    /**
     * Splits user attachments into Layer 1 (Context) and Layer 2 (Candidate slots).
     * Any attachment in a candidate slot is NOT treated as fixed context.
     */
    public extractContextAttachments(
        profile: WeaponRecommendationProfile,
        userAttachments: SelectedAttachments
    ): SelectedAttachments {
        const candidateSet = new Set(profile.candidateSlots.map((s) => s.toLowerCase()));
        const context: SelectedAttachments = {};

        for (const [slot, name] of Object.entries(userAttachments)) {
            if (!name || name === '' || name === 'DEFAULT') continue;
            if (!candidateSet.has(slot.toLowerCase())) {
                context[slot] = name;
            }
        }

        return context;
    }

    /**
     * Generates all valid candidate attachment combinations for Layer 2.
     * Respects profile candidate whitelist and includes None (undefined) per slot.
     */
    public generateCandidates(
        profile: WeaponRecommendationProfile,
        availableAttachments?: Record<string, string[]>
    ): SelectedAttachments[] {
        const avail = availableAttachments || getAvailableAttachmentsForWeapon(profile.weaponId);
        const slots = profile.candidateSlots;
        if (slots.length === 0) return [{}];

        // Slot options: [undefined, ...attachmentNames]
        const slotOptionsList: { slot: string; options: (string | undefined)[] }[] = [];

        for (const slot of slots) {
            const availableInSlot = avail[slot] || [];
            let options: (string | undefined)[] = [];

            if (profile.candidateAttachmentNames && profile.candidateAttachmentNames[slot]) {
                const whitelist = profile.candidateAttachmentNames[slot];
                options = availableInSlot.filter((name) => whitelist.includes(name));
            } else {
                options = [...availableInSlot];
            }

            // Always include undefined (None/Default) as a valid option
            slotOptionsList.push({
                slot,
                options: [undefined, ...options]
            });
        }

        // Cartesian product
        let combinations: SelectedAttachments[] = [{}];
        for (const { slot, options } of slotOptionsList) {
            const nextCombinations: SelectedAttachments[] = [];
            for (const existing of combinations) {
                for (const opt of options) {
                    nextCombinations.push({
                        ...existing,
                        [slot]: opt
                    });
                }
            }
            combinations = nextCombinations;
        }

        return combinations;
    }

    /**
     * Evaluates candidate combinations using 32-trial Monte Carlo with Common Random Numbers (CRN).
     * Guarantees strict single-pass compilation: base + Layer 1 + candidate in ONE pass.
     * All candidates in the exploration loop share the identical masterSeed (and thus identical trial-by-trial
     * random variate sequence u_t), ensuring maximum variance reduction while applying candidate-specific Mean/Variance.
     */
    public evaluateCandidates(
        weaponId: string,
        contextAttachments: SelectedAttachments,
        candidates: SelectedAttachments[],
        options?: RecommendationEngineOptions
    ): CandidateEvaluation[] {
        const targetDistance = options?.targetDistance ?? 50;
        const burstSize = options?.burstSize ?? 30;
        const trials = options?.explorationTrials ?? 32;
        const masterSeed = options?.masterSeed ?? 2026;

        const results: CandidateEvaluation[] = [];

        for (const cand of candidates) {
            // Strict single-pass compile: merged input passed to compiler
            const combined: SelectedAttachments = {
                ...contextAttachments,
                ...cand
            };

            const compiledData = loadCompiledWeaponData(weaponId, combined);

            const engine = new MonteCarloEngine({
                weaponData: compiledData,
                masterSeed,
                trialCount: trials,
                burstSize,
                targetDistance,
                stance: 'stand',
                device: 'mouse',
                aiming: true,
                aimProgress: 1.0,
                initialAimProgress: 1.0,
                settleTime: 0.2
            });

            const mcResult = engine.run();
            const stats = mcResult.statistics;

            results.push({
                id: canonicalizeAttachments(cand) || 'none',
                attachments: cand,
                statistics: stats,
                objectives: {
                    absMeanDriftX: Math.abs(stats.meanX),
                    absMeanDriftY: Math.abs(stats.meanY),
                    sigmaX: stats.stdX,
                    sigmaY: stats.stdY,
                    r95: stats.p95Radius,
                    meanRadius: stats.meanRadius
                }
            });
        }

        return results;
    }

    /**
     * Selects representative recommendations using fixed priority: Overall -> Vertical -> Horizontal.
     * Uses anchor metrics with deterministic tie-breaking, and excludes duplicate combinations.
     */
    public selectByRole(
        allEvaluations: CandidateEvaluation[],
        overallFrontier: CandidateEvaluation[],
        verticalFrontier: CandidateEvaluation[],
        horizontalFrontier: CandidateEvaluation[]
    ): {
        overall: CandidateEvaluation | null;
        vertical: CandidateEvaluation | null;
        horizontal: CandidateEvaluation | null;
    } {
        const selectedCanonicalKeys = new Set<string>();

        // 1. Overall: Min R95 -> Min meanRadius -> Canonical ID
        let overallChoice: CandidateEvaluation | null = null;
        if (overallFrontier.length > 0) {
            const sortedOverall = [...overallFrontier].sort((a, b) => {
                if (Math.abs(a.objectives.r95 - b.objectives.r95) > 1e-6) {
                    return a.objectives.r95 - b.objectives.r95;
                }
                if (Math.abs(a.objectives.meanRadius - b.objectives.meanRadius) > 1e-6) {
                    return a.objectives.meanRadius - b.objectives.meanRadius;
                }
                return a.id.localeCompare(b.id);
            });
            overallChoice = sortedOverall[0];
            selectedCanonicalKeys.add(overallChoice.id);
        }

        // 2. Vertical: Min |meanDriftY| -> Min sigmaY -> Canonical ID (excluding Overall)
        let verticalChoice: CandidateEvaluation | null = null;
        const availableVertical = verticalFrontier.filter((c) => !selectedCanonicalKeys.has(c.id));
        if (availableVertical.length > 0) {
            const sortedVertical = availableVertical.sort((a, b) => {
                if (Math.abs(a.objectives.absMeanDriftY - b.objectives.absMeanDriftY) > 1e-6) {
                    return a.objectives.absMeanDriftY - b.objectives.absMeanDriftY;
                }
                if (Math.abs(a.objectives.sigmaY - b.objectives.sigmaY) > 1e-6) {
                    return a.objectives.sigmaY - b.objectives.sigmaY;
                }
                return a.id.localeCompare(b.id);
            });
            verticalChoice = sortedVertical[0];
            selectedCanonicalKeys.add(verticalChoice.id);
        }

        // 3. Horizontal: Min |meanDriftX| -> Min sigmaX -> Canonical ID (excluding Overall & Vertical)
        let horizontalChoice: CandidateEvaluation | null = null;
        const availableHorizontal = horizontalFrontier.filter((c) => !selectedCanonicalKeys.has(c.id));
        if (availableHorizontal.length > 0) {
            const sortedHorizontal = availableHorizontal.sort((a, b) => {
                if (Math.abs(a.objectives.absMeanDriftX - b.objectives.absMeanDriftX) > 1e-6) {
                    return a.objectives.absMeanDriftX - b.objectives.absMeanDriftX;
                }
                if (Math.abs(a.objectives.sigmaX - b.objectives.sigmaX) > 1e-6) {
                    return a.objectives.sigmaX - b.objectives.sigmaX;
                }
                return a.id.localeCompare(b.id);
            });
            horizontalChoice = sortedHorizontal[0];
            selectedCanonicalKeys.add(horizontalChoice.id);
        }

        return {
            overall: overallChoice,
            vertical: verticalChoice,
            horizontal: horizontalChoice
        };
    }

    /**
     * High-resolution final evaluation (500 trials) for selected recommendations + Current user setting.
     */
    public evaluateFinalRecommendations(
        weaponId: string,
        contextAttachments: SelectedAttachments,
        selected: {
            overall: CandidateEvaluation | null;
            vertical: CandidateEvaluation | null;
            horizontal: CandidateEvaluation | null;
        },
        currentUserAttachments: SelectedAttachments,
        options?: RecommendationEngineOptions
    ): {
        overall: FinalRecommendation | null;
        vertical: FinalRecommendation | null;
        horizontal: FinalRecommendation | null;
        current: FinalRecommendation;
    } {
        const targetDistance = options?.targetDistance ?? 50;
        const burstSize = options?.burstSize ?? 30;
        const finalTrials = options?.finalTrials ?? 500;
        const masterSeed = options?.masterSeed ?? 2026;

        const runHighRes = (
            role: RecommendationRole | 'current',
            title: string,
            description: string,
            candidateAttachments: SelectedAttachments
        ): FinalRecommendation => {
            const combined: SelectedAttachments = {
                ...contextAttachments,
                ...candidateAttachments
            };

            const compiledData = loadCompiledWeaponData(weaponId, combined);

            const engine = new MonteCarloEngine({
                weaponData: compiledData,
                masterSeed,
                trialCount: finalTrials,
                burstSize,
                targetDistance,
                stance: 'stand',
                device: 'mouse',
                aiming: true,
                aimProgress: 1.0,
                initialAimProgress: 1.0,
                settleTime: 0.2,
                maxStoredImpacts: finalTrials * burstSize
            });

            const mcResult = engine.run();

            return {
                role: role as RecommendationRole,
                title,
                description,
                attachments: candidateAttachments,
                statistics: mcResult.statistics,
                impacts: mcResult.impacts
            };
        };

        // Final evaluation for Overall
        const overall = selected.overall
            ? runHighRes('overall', '1. Overall 제어', '탄착군 반경(R95) 및 전방위 분산 최소화 세팅', selected.overall.attachments)
            : null;

        // Final evaluation for Vertical
        const vertical = selected.vertical
            ? runHighRes('vertical', '2. 수직 반동 억제', '상탄 치솟음 및 수직 분산 극대 제어 세팅', selected.vertical.attachments)
            : null;

        // Final evaluation for Horizontal
        const horizontal = selected.horizontal
            ? runHighRes('horizontal', '3. 수평 분산 제어', '좌우 지그재그 편류 및 수평 분산 최소화 세팅', selected.horizontal.attachments)
            : null;

        // Final evaluation for Current user setting
        const current = runHighRes('current', '4. 내 세팅', '현재 장착된 부착물 설정', currentUserAttachments);

        return { overall, vertical, horizontal, current };
    }

    /**
     * Executes the full recommendation pipeline:
     * Extract context -> Check Cache -> Generate Candidates -> 32-trial CRN Evaluation ->
     * Pareto Frontiers -> Anchor Selection -> 500-trial Final Evaluation -> Cache & Return.
     */
    public recommend(
        weaponId: string,
        currentUserAttachments: SelectedAttachments,
        options?: RecommendationEngineOptions
    ): RecommendationResultSet {
        const startTime = performance.now();
        const profile = getWeaponRecommendationProfile(weaponId);

        // 1. Extract Layer 1 context
        const contextAttachments = this.extractContextAttachments(profile, currentUserAttachments);

        // 2. Generate Layer 2 candidate combinations
        const candidates = this.generateCandidates(profile);

        // 3. Cache check
        const cacheKey = generateRecommendationCacheKey(weaponId, contextAttachments, candidates);
        const cached = this._cache.get(cacheKey);
        if (cached) {
            // Re-evaluate current user setting dynamically if user altered candidate slots
            return {
                ...cached,
                executionTimeMs: performance.now() - startTime,
                cacheHit: true
            };
        }

        // 4. Explore candidates with 32 trials (CRN)
        const evaluations = this.evaluateCandidates(weaponId, contextAttachments, candidates, options);

        // 5. Pareto frontiers
        const overallFrontier = computeParetoFrontier(evaluations, 'overall');
        const verticalFrontier = computeParetoFrontier(evaluations, 'vertical');
        const horizontalFrontier = computeParetoFrontier(evaluations, 'horizontal');

        // 6. Selection by role
        const selected = this.selectByRole(evaluations, overallFrontier, verticalFrontier, horizontalFrontier);

        // 7. 500-trial High-res final evaluation
        const finalResults = this.evaluateFinalRecommendations(
            weaponId,
            contextAttachments,
            selected,
            currentUserAttachments,
            options
        );

        const resultSet: RecommendationResultSet = {
            overall: finalResults.overall,
            vertical: finalResults.vertical,
            horizontal: finalResults.horizontal,
            current: finalResults.current,
            executionTimeMs: performance.now() - startTime,
            cacheHit: false
        };

        this._cache.set(cacheKey, resultSet);
        return resultSet;
    }
}
