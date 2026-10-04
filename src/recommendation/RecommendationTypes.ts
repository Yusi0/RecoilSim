import { SelectedAttachments } from '../core/compiler/WeaponCompiler';
import { DispersionStatistics, ImpactPoint } from '../montecarlo/MonteCarloTypes';

export type RecommendationRole = 'overall' | 'vertical' | 'horizontal';

/**
 * Recommendation configuration profile for a specific weapon.
 * Layer 1 = Context slots (e.g. user selected Optics/Ammo)
 * Layer 2 = Candidate slots to explore (e.g. Barrel/Underbarrel)
 */
export interface WeaponRecommendationProfile {
    weaponId: string;
    /** Slot names to explore as candidates (Layer 2) */
    candidateSlots: string[];
    /** Optional explicit whitelist of candidate attachment names per candidate slot */
    candidateAttachmentNames?: Record<string, string[]>;
    /** Optional explicit context slots (Layer 1). If omitted, any slot not in candidateSlots is treated as context */
    contextSlots?: string[];
}

/**
 * Result of evaluating a single candidate combination during exploration phase.
 */
export interface CandidateEvaluation {
    id: string;
    attachments: SelectedAttachments;
    statistics: DispersionStatistics;
    // Specific objectives used in Pareto frontier calculations
    objectives: {
        absMeanDriftX: number; // abs(meanX)
        absMeanDriftY: number; // abs(meanY)
        sigmaX: number;        // stdX
        sigmaY: number;        // stdY
        r95: number;           // p95Radius
        meanRadius: number;    // meanRadius
    };
}

/**
 * Final recommended configuration with high-resolution (500 trials) evaluation data.
 */
export interface FinalRecommendation {
    role: RecommendationRole;
    title: string;
    description: string;
    attachments: SelectedAttachments;
    statistics: DispersionStatistics;
    impacts?: ImpactPoint[];
}

/**
 * Full recommendation result set containing Overall, Vertical, Horizontal, and Current.
 */
export interface RecommendationResultSet {
    overall: FinalRecommendation | null;
    vertical: FinalRecommendation | null;
    horizontal: FinalRecommendation | null;
    current: FinalRecommendation;
    executionTimeMs: number;
    cacheHit: boolean;
}
