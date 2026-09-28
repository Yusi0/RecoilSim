import React, { useMemo } from 'react';
import { PhysicalShotSnapshot } from '../../core';
import { ListFilter, Sparkles, Target, Activity } from 'lucide-react';

interface ShotHistoryPanelProps {
    shots: readonly PhysicalShotSnapshot[];
    selectedShotIndex: number | null;
    onSelectShot: (index: number | null) => void;
    targetDistance?: number;
    onClose?: () => void;
}

export const ShotHistoryPanel: React.FC<ShotHistoryPanelProps> = ({
    shots,
    selectedShotIndex,
    onSelectShot,
    targetDistance = 50,
    onClose
}) => {
    // Calculate Shot Grouping Statistics (탄착군 분석 통계)
    const groupingStats = useMemo(() => {
        if (shots.length === 0) return null;

        const targetZ = -targetDistance;
        let sumX = 0;
        let sumY = 0;
        const hitPoints: { x: number; y: number }[] = [];

        shots.forEach((shot) => {
            const origin = shot.origin;
            const dir = shot.direction;
            const dist = Math.abs((targetZ - origin.z) / (dir.z === 0 ? -1 : dir.z));
            const x = origin.x + dir.x * dist;
            const y = origin.y + dir.y * dist;

            sumX += x;
            sumY += y;
            hitPoints.push({ x, y });
        });

        const count = hitPoints.length;
        const meanX = sumX / count;
        const meanY = sumY / count;

        let totalDistFromMean = 0;
        let maxDistFromMean = 0;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        hitPoints.forEach((pt) => {
            const dist = Math.hypot(pt.x - meanX, pt.y - meanY);
            totalDistFromMean += dist;
            if (dist > maxDistFromMean) maxDistFromMean = dist;

            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        });

        const meanRadius = totalDistFromMean / count;
        const spanX = maxX - minX;
        const spanY = maxY - minY;

        return {
            count,
            meanX,
            meanY,
            meanRadius,
            maxDistFromMean,
            spanX,
            spanY
        };
    }, [shots, targetDistance]);

    return (
        <div className="w-80 bg-slate-950/85 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 max-h-[500px] text-slate-100 font-mono z-40 select-none animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                    <h3 className="text-xs uppercase tracking-wider text-slate-300 font-bold flex items-center gap-1.5">
                        <ListFilter className="w-3.5 h-3.5 text-cyan-400" />
                        Shot History ({shots.length})
                    </h3>
                    <p className="text-[9px] text-slate-500 font-mono">Roblox Frame (X=Right, Y=Up, Z=Forward)</p>
                </div>
                <div className="flex items-center gap-2">
                    {selectedShotIndex !== null && (
                        <button
                            onClick={() => onSelectShot(null)}
                            className="text-[10px] text-cyan-400 hover:underline"
                        >
                            Clear
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Grouping Analysis Card (탄착군 수치 분석 로그) */}
            {groupingStats && (
                <div className="bg-slate-900/90 border border-cyan-500/30 rounded-xl p-3 flex flex-col gap-2 shadow-inner">
                    <div className="flex items-center justify-between text-[11px] font-bold text-cyan-300 border-b border-slate-800/80 pb-1">
                        <span className="flex items-center gap-1">
                            <Target className="w-3 h-3 text-cyan-400" />
                            Group Stats ({targetDistance}m Target)
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">N = {groupingStats.count}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="flex flex-col bg-slate-950/60 p-1.5 rounded border border-slate-800">
                            <span className="text-slate-500">Mean Center (X, Y)</span>
                            <span className="font-semibold text-slate-200 truncate">
                                ({groupingStats.meanX.toFixed(3)}, {groupingStats.meanY.toFixed(3)})
                            </span>
                        </div>

                        <div className="flex flex-col bg-slate-950/60 p-1.5 rounded border border-slate-800">
                            <span className="text-slate-500">Mean Radius</span>
                            <span className="font-semibold text-cyan-300">
                                {groupingStats.meanRadius.toFixed(4)}m
                            </span>
                        </div>

                        <div className="flex flex-col bg-slate-950/60 p-1.5 rounded border border-slate-800">
                            <span className="text-slate-500">Max Radius</span>
                            <span className="font-semibold text-rose-300">
                                {groupingStats.maxDistFromMean.toFixed(4)}m
                            </span>
                        </div>

                        <div className="flex flex-col bg-slate-950/60 p-1.5 rounded border border-slate-800">
                            <span className="text-slate-500">Extreme Spread (ΔX, ΔY)</span>
                            <span className="font-semibold text-amber-300">
                                {groupingStats.spanX.toFixed(3)} × {groupingStats.spanY.toFixed(3)}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Shots List */}
            {shots.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                    <Sparkles className="w-6 h-6 text-slate-600 animate-pulse" />
                    <span>No shots fired yet.</span>
                    <span className="text-[10px] text-slate-600">Left Click or Hold to Fire</span>
                </div>
            ) : (
                <div className="overflow-y-auto pr-1 flex flex-col gap-1.5 custom-scrollbar">
                    {shots.map((shot, idx) => {
                        const isSelected = selectedShotIndex === idx;
                        const mag = shot.rotationRecoilVec.magnitude;
                        return (
                            <button
                                key={idx}
                                onClick={() => onSelectShot(isSelected ? null : idx)}
                                className={`w-full p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between ${
                                    isSelected
                                        ? 'bg-amber-500/20 border-amber-400/80 text-amber-200 shadow-md'
                                        : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/60 text-slate-300'
                                }`}
                            >
                                <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-100">#{idx + 1}</span>
                                        <span className="text-[11px] text-slate-400">t = {shot.timestamp.toFixed(3)}s</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 truncate">
                                        Dir: ({shot.direction.x.toFixed(3)}, {shot.direction.y.toFixed(3)}, {shot.direction.z.toFixed(3)})
                                    </span>
                                </div>

                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] text-slate-400">Recoil</span>
                                    <span className="font-bold text-cyan-400 text-xs">
                                        {mag.toFixed(4)}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
