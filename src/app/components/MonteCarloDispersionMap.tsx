import React, { useRef, useEffect, useState, useMemo } from 'react';
import { MonteCarloResult } from '../../montecarlo';
import {
    worldToCanvas,
    computeCovarianceEllipse,
    calculateClusterFraming,
    getShotProgressionColor,
    WorldBounds
} from './dispersionGeometry';
import { X, Target, Navigation, Disc } from 'lucide-react';

export interface DispersionDataset {
    id: string;
    label: string;
    color: string;
    result: MonteCarloResult;
}

export interface MonteCarloDispersionMapProps {
    result?: MonteCarloResult;
    datasets?: DispersionDataset[];
    onClose?: () => void;
    onRerun?: () => void;
    isRunning?: boolean;
}

export const MonteCarloDispersionMap: React.FC<MonteCarloDispersionMapProps> = ({
    result,
    datasets,
    onClose,
    onRerun,
    isRunning = false
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Active dataset resolution (supports single result or multiple datasets)
    const activeDatasets: DispersionDataset[] = useMemo(() => {
        if (datasets && datasets.length > 0) {
            return datasets;
        }
        if (result) {
            return [{
                id: 'primary',
                label: result.weaponName || 'Primary Weapon',
                color: '#00f2fe',
                result
            }];
        }
        return [];
    }, [datasets, result]);

    const primaryDataset = activeDatasets[0];
    const mcResult = primaryDataset?.result;

    // Visual layer toggles: Drift vector / R50 / R90 / 1σ ellipse are DEFAULT OFF as requested
    const [showDrift, setShowDrift] = useState(false);
    const [showEllipse, setShowEllipse] = useState(false);
    const [showConfidenceRings, setShowConfidenceRings] = useState(false);
    const [showGrid, setShowGrid] = useState(true);

    // Compute bounding box strictly across all stored impacts to center on the impact distribution
    const worldBounds: WorldBounds = useMemo(() => {
        if (!mcResult || mcResult.impacts.length === 0) {
            return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
        }
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const imp of mcResult.impacts) {
            if (imp.x < minX) minX = imp.x;
            if (imp.x > maxX) maxX = imp.x;
            if (imp.y < minY) minY = imp.y;
            if (imp.y > maxY) maxY = imp.y;
        }
        // Fallback safety if single point
        if (minX === maxX) {
            minX -= 0.5;
            maxX += 0.5;
        }
        if (minY === maxY) {
            minY -= 0.5;
            maxY += 0.5;
        }
        return { minX, maxX, minY, maxY };
    }, [mcResult]);

    // Canvas drawing effect
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !mcResult) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        // Optimized cluster framing: centers on the actual impact distribution
        const framing = calculateClusterFraming(worldBounds, width, height, 45);
        const { scale, originX, originY, isOriginInViewport, clusterCenterY } = framing;

        // Clear canvas with sleek dark theme
        ctx.fillStyle = '#060913';
        ctx.fillRect(0, 0, width, height);

        // 1. Draw Sparse Cartesian Stud Grid (Minimal, non-distracting)
        if (showGrid) {
            ctx.save();
            ctx.font = '9px monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            // Determine grid step in studs (1 stud or 2 studs depending on scale)
            const gridStepStuds = scale > 80 ? 0.5 : (scale > 40 ? 1.0 : 2.0);

            // Compute visible world coordinate range
            const visibleMinWorldX = (0 - originX) / scale;
            const visibleMaxWorldX = (width - originX) / scale;
            const visibleMinWorldY = (originY - height) / scale;
            const visibleMaxWorldY = (originY - 0) / scale;

            const startX = Math.floor(visibleMinWorldX / gridStepStuds) * gridStepStuds;
            const endX = Math.ceil(visibleMaxWorldX / gridStepStuds) * gridStepStuds;
            const startY = Math.floor(visibleMinWorldY / gridStepStuds) * gridStepStuds;
            const endY = Math.ceil(visibleMaxWorldY / gridStepStuds) * gridStepStuds;

            // Draw grid lines
            for (let wx = startX; wx <= endX; wx += gridStepStuds) {
                const cx = originX + wx * scale;
                const isZero = Math.abs(wx) < 1e-4;
                ctx.beginPath();
                ctx.moveTo(cx, 0);
                ctx.lineTo(cx, height);
                ctx.strokeStyle = isZero ? 'rgba(71, 85, 105, 0.45)' : 'rgba(30, 41, 59, 0.35)';
                ctx.lineWidth = isZero ? 1.2 : 0.8;
                ctx.setLineDash(isZero ? [] : [2, 3]);
                ctx.stroke();

                // Axis label
                if (!isZero && Math.abs(wx % (gridStepStuds * 2)) < 1e-4) {
                    ctx.fillStyle = 'rgba(100, 116, 139, 0.5)';
                    ctx.fillText(`${wx > 0 ? `+${wx}` : wx}s`, cx + 3, height - 14);
                }
            }

            for (let wy = startY; wy <= endY; wy += gridStepStuds) {
                const cy = originY - wy * scale;
                const isZero = Math.abs(wy) < 1e-4;
                ctx.beginPath();
                ctx.moveTo(0, cy);
                ctx.lineTo(width, cy);
                ctx.strokeStyle = isZero ? 'rgba(71, 85, 105, 0.45)' : 'rgba(30, 41, 59, 0.35)';
                ctx.lineWidth = isZero ? 1.2 : 0.8;
                ctx.setLineDash(isZero ? [] : [2, 3]);
                ctx.stroke();

                // Axis label
                if (!isZero && Math.abs(wy % (gridStepStuds * 2)) < 1e-4) {
                    ctx.fillStyle = 'rgba(100, 116, 139, 0.5)';
                    ctx.fillText(`${wy > 0 ? `+${wy}` : wy}s`, 4, cy + 2);
                }
            }
            ctx.restore();
        }

        // 2. Draw Aim Origin (0, 0) if visible in viewport
        if (isOriginInViewport) {
            ctx.save();
            // Subtle crosshair
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(originX - 7, originY);
            ctx.lineTo(originX + 7, originY);
            ctx.moveTo(originX, originY - 7);
            ctx.lineTo(originX, originY + 7);
            ctx.stroke();

            // Center dot
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(originX, originY, 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '10px monospace';
            ctx.fillText('(0, 0) Aim', originX + 7, originY + 12);
            ctx.restore();
        } else {
            // Off-screen Aim Direction Indicator (e.g. at bottom edge)
            ctx.save();
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.strokeStyle = 'rgba(71, 85, 105, 0.6)';
            ctx.lineWidth = 1;

            const badgeW = 140;
            const badgeH = 22;
            const badgeX = width / 2 - badgeW / 2;
            const badgeY = height - 30;

            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const driftStudsDown = Math.max(0, clusterCenterY).toFixed(1);
            ctx.fillText(`↓ Aim (0, 0) [${driftStudsDown}s down]`, width / 2, badgeY + badgeH / 2);
            ctx.restore();
        }

        // 3. Draw Translucent Shot Progression Impact Points (Green -> Yellow -> Orange -> Red)
        const shotsPerTrial = mcResult.shotsPerTrial || 30;
        const impacts = mcResult.impacts;

        ctx.save();
        // Alpha compositing: individual dots are translucent (0.28), overlapping dots build up density naturally
        ctx.globalAlpha = 0.28;

        for (let i = 0; i < impacts.length; i++) {
            const imp = impacts[i];
            const { cx, cy } = worldToCanvas(imp.x, imp.y, originX, originY, scale);
            const color = getShotProgressionColor(imp.shotIndex, shotsPerTrial);

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        const stats = mcResult.statistics;
        const { cx: meanCx, cy: meanCy } = worldToCanvas(stats.meanX, stats.meanY, originX, originY, scale);

        // 4. (Optional Toggle) Recoil Drift Vector: (0, 0) -> (meanX, meanY)
        if (showDrift && stats.sampleCount > 0) {
            ctx.save();
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(originX, originY);
            ctx.lineTo(meanCx, meanCy);
            ctx.stroke();

            // Diamond marker at mean point
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.moveTo(meanCx, meanCy - 6);
            ctx.lineTo(meanCx + 6, meanCy);
            ctx.lineTo(meanCx, meanCy + 6);
            ctx.lineTo(meanCx - 6, meanCy);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // 5. (Optional Toggle) Centered Confidence Rings (R50 / R90)
        if (showConfidenceRings && stats.sampleCount > 0) {
            ctx.save();
            if (stats.dispersion.centeredMedianRadius > 0) {
                const r50Px = stats.dispersion.centeredMedianRadius * scale;
                ctx.beginPath();
                ctx.arc(meanCx, meanCy, r50Px, 0, Math.PI * 2);
                ctx.strokeStyle = '#f59e0b';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.stroke();
            }

            if (stats.dispersion.centeredP90Radius > 0) {
                const r90Px = stats.dispersion.centeredP90Radius * scale;
                ctx.beginPath();
                ctx.arc(meanCx, meanCy, r90Px, 0, Math.PI * 2);
                ctx.strokeStyle = '#c084fc';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
            }
            ctx.restore();
        }

        // 6. (Optional Toggle) 1-Sigma Covariance Dispersion Ellipse
        if (showEllipse && stats.sampleCount > 1) {
            const ellipse = computeCovarianceEllipse(stats.stdX, stats.stdY, stats.covarianceXY);
            if (ellipse.semiMajor > 0 && ellipse.semiMinor > 0) {
                ctx.save();
                const aPx = ellipse.semiMajor * scale;
                const bPx = ellipse.semiMinor * scale;

                ctx.beginPath();
                ctx.ellipse(meanCx, meanCy, aPx, bPx, -ellipse.angleRad, 0, Math.PI * 2);
                ctx.strokeStyle = '#00f2fe';
                ctx.lineWidth = 1.8;
                ctx.fillStyle = 'rgba(0, 242, 254, 0.08)';
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }
        }
    }, [mcResult, worldBounds, showDrift, showEllipse, showConfidenceRings, showGrid]);

    if (!mcResult) {
        return null;
    }

    const stats = mcResult.statistics;
    const cond = mcResult.conditions;
    const ellipse = computeCovarianceEllipse(stats.stdX, stats.stdY, stats.covarianceXY);
    const shotsPerTrial = mcResult.shotsPerTrial || 30;

    return (
        <div className="flex flex-col bg-slate-950/95 border border-slate-800/90 rounded-xl shadow-2xl backdrop-blur-xl overflow-hidden font-sans text-slate-200 w-[860px] max-w-[95vw] select-none">
            {/* 1. Modal / Panel Header */}
            <div className="px-4 py-3 bg-slate-900/80 border-b border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <Target className="w-4 h-4 text-cyan-400" />
                    <span className="font-semibold text-sm text-slate-100">
                        Monte Carlo 2D Dispersion Map
                    </span>
                    <span className="text-slate-600 text-xs">|</span>
                    <span className="font-mono text-xs text-slate-300">
                        {mcResult.weaponName || 'Weapon'} · {cond.isAiming ? 'ADS' : 'HIPFIRE'} · {cond.stance} · {mcResult.targetDistance} studs
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {onRerun && (
                        <button
                            onClick={onRerun}
                            disabled={isRunning}
                            className="px-2.5 py-1 text-xs font-mono bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded border border-cyan-500/40 transition-colors disabled:opacity-50"
                        >
                            {isRunning ? 'Simulating...' : 'Re-run'}
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* 2. Main Body: Target Canvas (Left) + Decoupled Drift & Dispersion Metrics (Right) */}
            <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-800/80">
                {/* Left: 2D Target Canvas Stage */}
                <div className="flex-1 flex flex-col items-center justify-center p-3.5 bg-slate-950 relative" ref={containerRef}>
                    <canvas
                        ref={canvasRef}
                        width={520}
                        height={520}
                        className="rounded-lg border border-slate-900 shadow-inner bg-[#060913]"
                    />

                    {/* Recoil Progression Gradient Color Legend */}
                    <div className="mt-3 w-full px-2 flex flex-col gap-1.5 font-mono text-[11px]">
                        <div className="flex items-center justify-between text-slate-400">
                            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                                Shot #1 (Start)
                            </span>
                            <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-[0_0_8px_rgba(245,158,11,0.6)]"></span>
                                Shot #{Math.round(shotsPerTrial / 2)} (Mid)
                            </span>
                            <span className="flex items-center gap-1.5 text-rose-400 font-semibold">
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>
                                Shot #{shotsPerTrial} (End)
                            </span>
                        </div>

                        {/* Visual Gradient Bar */}
                        <div className="h-1.5 w-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 via-55% via-orange-500 to-rose-500 shadow-sm opacity-80" />

                        {/* Auxiliary metadata and optional toggles */}
                        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                            <span>
                                Showing {mcResult.impacts.length} samples ({mcResult.totalShots} total shots across {mcResult.trialCount} trials)
                            </span>

                            {/* Optional toggles (defaulted to OFF to preserve clean shot progression) */}
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => setShowDrift(!showDrift)}
                                    className={`px-1.5 py-0.5 rounded border transition-colors ${
                                        showDrift ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300' : 'border-slate-800 text-slate-600 hover:text-slate-400'
                                    }`}
                                >
                                    Drift
                                </button>
                                <button
                                    onClick={() => setShowConfidenceRings(!showConfidenceRings)}
                                    className={`px-1.5 py-0.5 rounded border transition-colors ${
                                        showConfidenceRings ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'border-slate-800 text-slate-600 hover:text-slate-400'
                                    }`}
                                >
                                    R50/R90
                                </button>
                                <button
                                    onClick={() => setShowEllipse(!showEllipse)}
                                    className={`px-1.5 py-0.5 rounded border transition-colors ${
                                        showEllipse ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' : 'border-slate-800 text-slate-600 hover:text-slate-400'
                                    }`}
                                >
                                    1σ Ellipse
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Decoupled Metrics Sidebar */}
                <div className="w-full md:w-72 p-4 bg-slate-900/40 flex flex-col gap-4 font-mono text-xs">
                    {/* Section 1: Recoil Drift (원점 이탈 편향) */}
                    <div className="bg-slate-950/70 border border-yellow-500/30 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-yellow-400 font-semibold mb-2 text-[11px]">
                            <Navigation className="w-3.5 h-3.5" />
                            <span>1. RECOIL DRIFT (이탈 편향)</span>
                        </div>
                        <div className="space-y-1.5 text-[11px]">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Mean X (수평):</span>
                                <span className="text-slate-200 font-medium">{stats.drift.meanX >= 0 ? `+${stats.drift.meanX.toFixed(3)}` : stats.drift.meanX.toFixed(3)} s</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Mean Y (수직):</span>
                                <span className="text-slate-200 font-medium">{stats.drift.meanY >= 0 ? `+${stats.drift.meanY.toFixed(3)}` : stats.drift.meanY.toFixed(3)} s</span>
                            </div>
                            <div className="flex justify-between pt-1 border-t border-slate-800/80">
                                <span className="text-slate-300 font-semibold">Total Drift Radius:</span>
                                <span className="text-yellow-300 font-bold">{stats.drift.meanRadius.toFixed(3)} studs</span>
                            </div>
                        </div>
                        <div className="mt-2 text-[10px] text-slate-500 leading-tight">
                            조준점 (0, 0)에서 탄착군 전체 중심이 이동한 순수 반동 편향 거리입니다.
                        </div>
                    </div>

                    {/* Section 2: Centered Dispersion (평균점 중심 순수 집탄율) */}
                    <div className="bg-slate-950/70 border border-cyan-500/30 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 text-cyan-400 font-semibold mb-2 text-[11px]">
                            <Disc className="w-3.5 h-3.5" />
                            <span>2. CENTERED DISPERSION (순수 분산)</span>
                        </div>
                        <div className="space-y-1.5 text-[11px]">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Std X (σX 수평):</span>
                                <span className="text-slate-200">±{stats.stdX.toFixed(3)} s</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Std Y (σY 수직):</span>
                                <span className="text-slate-200">±{stats.stdY.toFixed(3)} s</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Radial Std (σ_r):</span>
                                <span className="text-cyan-300">{stats.radialStd.toFixed(3)} s</span>
                            </div>
                            <div className="flex justify-between pt-1 border-t border-slate-800/80">
                                <span className="text-amber-400">CEP (R50 50% 원):</span>
                                <span className="text-slate-200">{stats.dispersion.centeredMedianRadius.toFixed(3)} s</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-purple-400">R90 (90% 원):</span>
                                <span className="text-slate-200">{stats.dispersion.centeredP90Radius.toFixed(3)} s</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">R95 (95% 원):</span>
                                <span className="text-slate-200">{stats.dispersion.centeredP95Radius.toFixed(3)} s</span>
                            </div>
                            <div className="flex justify-between pt-1 border-t border-slate-800/80">
                                <span className="text-slate-400">1σ Ellipse Area:</span>
                                <span className="text-slate-200">{(Math.PI * ellipse.semiMajor * ellipse.semiMinor).toFixed(3)} s²</span>
                            </div>
                        </div>
                        <div className="mt-2 text-[10px] text-slate-500 leading-tight">
                            사수가 반동을 완벽히 잡았을 때 발생하는 고유 스프레드 및 탄착 퍼짐입니다.
                        </div>
                    </div>

                    {/* Section 3: Simulation Metadata */}
                    <div className="text-[10px] text-slate-500 space-y-1">
                        <div>• Trials: {mcResult.trialCount} × {mcResult.shotsPerTrial} shots</div>
                        <div>• Firerate: {cond.firerate} RPM</div>
                        <div>• Target Distance: {mcResult.targetDistance} studs</div>
                        <div>• Exec Time: {mcResult.executionTimeMs.toFixed(1)} ms</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
