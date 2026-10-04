import { CandidateEvaluation, RecommendationRole } from './RecommendationTypes';

/**
 * Checks if candidate A dominates candidate B across a vector of minimization objectives.
 * Returns true if A is <= B in all objectives AND < B in at least one objective (epsilon tolerance 1e-7).
 */
function dominates(objectivesA: number[], objectivesB: number[]): boolean {
    let strictlyBetter = false;
    const eps = 1e-7;

    for (let i = 0; i < objectivesA.length; i++) {
        if (objectivesA[i] > objectivesB[i] + eps) {
            return false; // A is worse than B in this objective
        }
        if (objectivesA[i] < objectivesB[i] - eps) {
            strictlyBetter = true;
        }
    }

    return strictlyBetter;
}

/**
 * Extracts the objective vector for a candidate evaluation based on the recommendation role.
 */
export function getObjectivesForRole(candidate: CandidateEvaluation, role: RecommendationRole): number[] {
    const obj = candidate.objectives;
    switch (role) {
        case 'vertical':
            // Minimize vertical drift (|meanY|) and vertical spread (sigmaY)
            return [obj.absMeanDriftY, obj.sigmaY];
        case 'overall':
            // Minimize R95 cluster radius, horizontal drift, and vertical drift
            return [obj.r95, obj.absMeanDriftX, obj.absMeanDriftY];
        case 'horizontal':
            // Minimize horizontal drift (|meanX|) and horizontal spread (sigmaX)
            return [obj.absMeanDriftX, obj.sigmaX];
    }
}

/**
 * Computes the Pareto frontier of non-dominated candidates for a specific role.
 * A candidate is in the frontier if no other candidate in the pool strictly dominates it.
 */
export function computeParetoFrontier(
    candidates: CandidateEvaluation[],
    role: RecommendationRole
): CandidateEvaluation[] {
    if (candidates.length <= 1) {
        return [...candidates];
    }

    const objectiveVectors = candidates.map((c) => getObjectivesForRole(c, role));
    const frontier: CandidateEvaluation[] = [];

    for (let i = 0; i < candidates.length; i++) {
        let isDominated = false;
        const vecI = objectiveVectors[i];

        for (let j = 0; j < candidates.length; j++) {
            if (i === j) continue;
            const vecJ = objectiveVectors[j];

            if (dominates(vecJ, vecI)) {
                isDominated = true;
                break;
            }
        }

        if (!isDominated) {
            frontier.push(candidates[i]);
        }
    }

    return frontier;
}
