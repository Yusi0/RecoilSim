import React, { useMemo } from 'react';
import { SelectedAttachments } from '../../core/compiler/WeaponCompiler';
import { loadCompiledWeaponData } from '../c25DataLoader';
import { RecoilPatternCanvas } from './RecoilPatternCanvas';
import { RecommendationEngine } from '../../recommendation/RecommendationEngine';
import { getWeaponRecommendationProfile } from '../../recommendation/WeaponRecommendationProfiles';
import precomputedData from '../../recommendation/precomputedRecommendations.json';

interface AttachmentRecommendationPanelProps {
    weaponId: string;
    currentUserWeaponData: Record<string, any>;
    currentUserAttachments: SelectedAttachments;
    onApplyPreset: (attachments: SelectedAttachments) => void;
    targetDistance?: number;
}

export const AttachmentRecommendationPanel: React.FC<AttachmentRecommendationPanelProps> = ({
    weaponId,
    currentUserWeaponData,
    currentUserAttachments,
    onApplyPreset,
    targetDistance = 50
}) => {
    const engine = useMemo(() => new RecommendationEngine(), []);
    const profile = useMemo(() => getWeaponRecommendationProfile(weaponId), [weaponId]);

    // Extract Layer 1 context from current user attachments
    const contextAttachments = useMemo(() => {
        return engine.extractContextAttachments(profile, currentUserAttachments);
    }, [engine, profile, currentUserAttachments]);

    const isContextEmpty = useMemo(() => {
        return Object.keys(contextAttachments).length === 0;
    }, [contextAttachments]);

    // Calculate or retrieve recommendation result set
    const recommendations = useMemo(() => {
        // Fast path: use build-time precomputed recommendations if Layer 1 context is empty
        const precomputed = (precomputedData as Record<string, any>)[weaponId.toLowerCase()];
        if (isContextEmpty && precomputed) {
            return {
                overall: precomputed.overall,
                vertical: precomputed.vertical,
                horizontal: precomputed.horizontal,
                current: null // Evaluated live below
            };
        }

        // Runtime path: execute full RecommendationEngine pipeline with caching
        try {
            return engine.recommend(weaponId, currentUserAttachments, {
                targetDistance,
                burstSize: 30,
                explorationTrials: 32,
                finalTrials: 500,
                masterSeed: 2026
            });
        } catch (err) {
            console.error('Failed to compute recommendations:', err);
            return {
                overall: null,
                vertical: null,
                horizontal: null,
                current: null
            };
        }
    }, [engine, weaponId, currentUserAttachments, isContextEmpty, targetDistance]);

    // Format current user attachments list for Cell 4 header
    const userAttachmentsList = useMemo(() => {
        return Object.entries(currentUserAttachments)
            .filter(([_, name]) => name && name !== 'DEFAULT' && name !== '')
            .map(([_, name]) => `${name}`);
    }, [currentUserAttachments]);

    // Compile weapon data for each recommendation slot with single-pass compilation
    const compiledDataBySlot = useMemo(() => {
        const compile = (recAttachments?: SelectedAttachments) => {
            if (!recAttachments) return null;
            try {
                const combined: SelectedAttachments = {
                    ...contextAttachments,
                    ...recAttachments
                };
                return loadCompiledWeaponData(weaponId, combined);
            } catch (err) {
                console.error('Failed to compile recommendation:', err);
                return currentUserWeaponData;
            }
        };

        return {
            overall: compile(recommendations.overall?.attachments),
            vertical: compile(recommendations.vertical?.attachments),
            horizontal: compile(recommendations.horizontal?.attachments)
        };
    }, [weaponId, contextAttachments, recommendations, currentUserWeaponData]);

    const renderSlot = (
        rec: any,
        compiledData: any,
        defaultTitle: string,
        slotNumber: number
    ) => {
        if (!rec || !compiledData) {
            return (
                <div className="flex flex-col h-full rounded-xl bg-[#141417] p-4 items-center justify-center text-center select-none">
                    <span className="text-xs font-bold font-mono text-[#8e8e93] mb-1">
                        {defaultTitle}
                    </span>
                    <span className="text-[11px] text-[#636366] font-mono">
                        선택 가능한 추천 후보 없음
                    </span>
                </div>
            );
        }

        const summary = Object.values(rec.attachments || {}).filter((v): v is string => Boolean(v));

        return (
            <RecoilPatternCanvas
                weaponData={compiledData}
                title={rec.title || defaultTitle}
                attachmentsSummary={summary}
                onApply={() => onApplyPreset(rec.attachments || {})}
                targetDistance={targetDistance}
            />
        );
    };

    return (
        <div className="w-full h-full p-3 bg-[#0a0a0c] flex flex-col select-none">
            {/* 2x2 Grid: 1. Overall | 2. Vertical | 3. Horizontal | 4. Current */}
            <div className="grid grid-cols-2 grid-rows-2 gap-3 flex-1 h-full min-h-0">
                {/* 1. Overall Control */}
                {renderSlot(
                    recommendations.overall,
                    compiledDataBySlot.overall,
                    '1. Overall 제어',
                    1
                )}

                {/* 2. Vertical Recoil Control */}
                {renderSlot(
                    recommendations.vertical,
                    compiledDataBySlot.vertical,
                    '2. 수직 반동 억제',
                    2
                )}

                {/* 3. Horizontal Recoil Control */}
                {renderSlot(
                    recommendations.horizontal,
                    compiledDataBySlot.horizontal,
                    '3. 수평 분산 제어',
                    3
                )}

                {/* 4. Current User Setting */}
                <RecoilPatternCanvas
                    weaponData={currentUserWeaponData}
                    title="4. 내 세팅"
                    attachmentsSummary={userAttachmentsList}
                    isUser={true}
                    targetDistance={targetDistance}
                />
            </div>
        </div>
    );
};
