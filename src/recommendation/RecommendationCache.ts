import { SelectedAttachments } from '../core/compiler/WeaponCompiler';
import { RecommendationResultSet } from './RecommendationTypes';

export const COMPILER_VERSION = 'v1.0';
export const RECOMMENDATION_ALGO_VERSION = 'v2.0-crn32';

/**
 * Normalizes and sorts an attachment configuration into a canonical string: "SlotA:Att1|SlotB:Att2".
 */
export function canonicalizeAttachments(attachments: SelectedAttachments): string {
    return Object.entries(attachments)
        .filter(([_, name]) => name && name !== '' && name !== 'DEFAULT')
        .map(([slot, name]) => [slot.trim().toLowerCase(), name!.trim().toLowerCase()] as [string, string])
        .sort(([aSlot, aName], [bSlot, bName]) => {
            const slotComp = aSlot.localeCompare(bSlot);
            return slotComp !== 0 ? slotComp : aName.localeCompare(bName);
        })
        .map(([slot, name]) => `${slot}:${name}`)
        .join('|');
}

/**
 * Generates a strictly deterministic cache key uniquely identifying the raw input configuration.
 */
export function generateRecommendationCacheKey(
    weaponId: string,
    layer1Context: SelectedAttachments,
    layer2Candidates: SelectedAttachments[],
    compilerVersion: string = COMPILER_VERSION,
    algoVersion: string = RECOMMENDATION_ALGO_VERSION
): string {
    const normWeapon = weaponId.trim().toLowerCase();
    const canonicalL1 = canonicalizeAttachments(layer1Context);

    const canonicalL2List = layer2Candidates
        .map((cand) => canonicalizeAttachments(cand))
        .sort((a, b) => a.localeCompare(b))
        .join(';');

    return `rec:${algoVersion}:${compilerVersion}:${normWeapon}:L1[${canonicalL1}]:L2[${canonicalL2List}]`;
}

/**
 * In-memory Recommendation Cache.
 */
export class RecommendationCache {
    private _cache = new Map<string, RecommendationResultSet>();

    public get(key: string): RecommendationResultSet | undefined {
        return this._cache.get(key);
    }

    public set(key: string, result: RecommendationResultSet): void {
        this._cache.set(key, result);
    }

    public has(key: string): boolean {
        return this._cache.has(key);
    }

    public clear(): void {
        this._cache.clear();
    }

    public size(): number {
        return this._cache.size;
    }
}
