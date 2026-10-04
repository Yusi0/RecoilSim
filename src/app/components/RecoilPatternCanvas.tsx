import React, { useMemo, useRef, useEffect } from 'react';
import { MonteCarloEngine } from '../../montecarlo/MonteCarloEngine';

interface RecoilPatternCanvasProps {
    weaponData: Record<string, any>;
    title: string;
    attachmentsSummary: string[];
    isUser?: boolean;
    onApply?: () => void;
    targetDistance?: number;
}

/**
 * Shot sequence progression color mapping:
 * Green (1~3 shots) -> Chartreuse/Yellow-green -> Amber/Yellow (mid shots) -> Orange -> Crimson/Red (late shots)
 * Faithful to the reference image recoil scatter visual.
 */
function getShotRgb(progress: number): [number, number, number] {
    const t = Math.max(0, Math.min(1, progress));
    if (t < 0.2) {
        // Green (34, 197, 94) -> Lime (132, 204, 22)
        const f = t / 0.2;
        return [
            Math.round(34 + f * (132 - 34)),
            Math.round(197 + f * (204 - 197)),
            Math.round(94 + f * (22 - 94))
        ];
    } else if (t < 0.45) {
        // Lime (132, 204, 22) -> Yellow (234, 179, 8)
        const f = (t - 0.2) / 0.25;
        return [
            Math.round(132 + f * (234 - 132)),
            Math.round(204 + f * (179 - 204)),
            Math.round(22 + f * (8 - 22))
        ];
    } else if (t < 0.7) {
        // Yellow (234, 179, 8) -> Orange (249, 115, 22)
        const f = (t - 0.45) / 0.25;
        return [
            Math.round(234 + f * (249 - 234)),
            Math.round(179 + f * (115 - 179)),
            Math.round(8 + f * (22 - 8))
        ];
    } else {
        // Orange (249, 115, 22) -> Crimson Red (239, 68, 68)
        const f = (t - 0.7) / 0.3;
        return [
            Math.round(249 + f * (239 - 249)),
            Math.round(115 + f * (68 - 115)),
            Math.round(22 + f * (68 - 22))
        ];
    }
}

export const RecoilPatternCanvas: React.FC<RecoilPatternCanvasProps> = ({
    weaponData,
    title,
    attachmentsSummary,
    isUser = false,
    onApply,
    targetDistance = 50
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // 1. Run authoritative Monte Carlo Engine and group 500 trials by shotIndex to compute empirical mean recoil trajectory
    const meanTrajectory = useMemo(() => {
        if (!weaponData) return [];

        const burstSize = 30; // 30 shots per burst
        const trialCount = 500; // 500 trials for high-resolution empirical mean trajectory
        const dist = targetDistance || 50;

        const engine = new MonteCarloEngine({
            weaponData,
            masterSeed: 2026,
            trialCount,
            burstSize,
            targetDistance: dist,
            stance: 'stand',
            device: 'mouse',
            aiming: true,
            aimProgress: 1.0,
            initialAimProgress: 1.0,
            settleTime: 0.2,
            maxStoredImpacts: 15000
        });

        const result = engine.run();
        const rawImpacts = result.impacts;
        if (rawImpacts.length === 0) return [];

        // Baseline reference origin: initial aim point of trial 0 shot 0
        const originX = rawImpacts[0].x;
        const originY = rawImpacts[0].y;

        // Group 500-trial impacts by shotIndex to calculate the empirical mean (x, y) for each shot
        const shotBuckets: { sumX: number; sumY: number; count: number }[] = Array.from(
            { length: burstSize },
            () => ({ sumX: 0, sumY: 0, count: 0 })
        );

        for (const p of rawImpacts) {
            if (p.shotIndex >= 0 && p.shotIndex < burstSize) {
                shotBuckets[p.shotIndex].sumX += p.x - originX;
                shotBuckets[p.shotIndex].sumY += p.y - originY;
                shotBuckets[p.shotIndex].count += 1;
            }
        }

        return shotBuckets.map((bucket, shotIndex) => ({
            shotIndex,
            x: bucket.count > 0 ? bucket.sumX / bucket.count : 0,
            y: bucket.count > 0 ? bucket.sumY / bucket.count : 0
        }));
    }, [weaponData, targetDistance]);

    // 2. High-DPI HTML5 Canvas Render Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const parent = canvas.parentElement;
        if (!parent) return;

        const rect = parent.getBoundingClientRect();
        const width = Math.floor(rect.width);
        const height = Math.floor(rect.height);

        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        ctx.resetTransform();
        ctx.scale(dpr, dpr);

        // A. Background (Deep neutral dark)
        ctx.fillStyle = '#0d0d10';
        ctx.fillRect(0, 0, width, height);

        // Coordinate scaling:
        // Strict 1:1 isometric scale across X and Y (40 px per stud on target plane)
        const pixelsPerStud = 40;

        const originPxX = width / 2;
        const originPxY = height - 26;

        const toScreenX = (x: number) => originPxX + x * pixelsPerStud;
        const toScreenY = (y: number) => originPxY - y * pixelsPerStud;

        // B. Subtle Grid Background (Matches reference image)
        const gridStepPx = 28;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.lineWidth = 1;

        // Vertical grid lines
        for (let gx = originPxX % gridStepPx; gx < width; gx += gridStepPx) {
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, height);
            ctx.stroke();
        }
        // Horizontal grid lines
        for (let gy = originPxY % gridStepPx; gy < height; gy += gridStepPx) {
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(width, gy);
            ctx.stroke();
        }

        // Center vertical dashed guide
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(originPxX, 8);
        ctx.lineTo(originPxX, height - 8);
        ctx.stroke();
        ctx.setLineDash([]);

        // Faint concentric range reference circles
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        [40, 85, 140].forEach((r) => {
            ctx.beginPath();
            ctx.arc(originPxX, originPxY, r, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Top-Left Empirical Mean Trajectory Mode Label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'left';
        ctx.fillText('EMPIRICAL MEAN TRAJECTORY', 12, 16);

        // Top-Right Distance Label ("DIST 50m")
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`DIST ${targetDistance}m`, width - 12, 16);

        // C. Baseline & Origin Marker (Green Triangle ▲)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(14, originPxY);
        ctx.lineTo(width - 14, originPxY);
        ctx.stroke();

        // Green triangle at (0, 0)
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.moveTo(originPxX, originPxY - 7);
        ctx.lineTo(originPxX - 6, originPxY + 3);
        ctx.lineTo(originPxX + 6, originPxY + 3);
        ctx.closePath();
        ctx.fill();

        // D. Empirical Mean Recoil Trajectory (Connected Line & Shot Markers)
        // Grouped empirical mean impact position per shot across 500 Monte Carlo trials
        if (meanTrajectory.length > 1) {
            const burstMax = 29;

            // 1. Draw line segments connecting consecutive empirical mean shot locations
            for (let i = 0; i < meanTrajectory.length - 1; i++) {
                const p1 = meanTrajectory[i];
                const p2 = meanTrajectory[i + 1];

                const progress = (i + 0.5) / burstMax;
                const [r, g, b] = getShotRgb(progress);

                ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                ctx.beginPath();
                ctx.moveTo(toScreenX(p1.x), toScreenY(p1.y));
                ctx.lineTo(toScreenX(p2.x), toScreenY(p2.y));
                ctx.stroke();
            }

            // 2. Draw shot markers at each empirical mean shot position
            for (let i = 0; i < meanTrajectory.length; i++) {
                const pt = meanTrajectory[i];
                const progress = i / burstMax;
                const [r, g, b] = getShotRgb(progress);

                const px = toScreenX(pt.x);
                const py = toScreenY(pt.y);

                // Subtle dark halo for high-contrast visibility against grid
                ctx.fillStyle = '#0d0d10';
                ctx.beginPath();
                ctx.arc(px, py, 4, 0, Math.PI * 2);
                ctx.fill();

                // Colored marker point
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.beginPath();
                ctx.arc(px, py, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }, [meanTrajectory, targetDistance]);

    const attLabel = attachmentsSummary.length > 0 ? attachmentsSummary.join(' + ') : '순정 (기본)';

    return (
        <div
            className={`flex flex-col h-full rounded-xl overflow-hidden select-none transition-colors ${
                isUser ? 'bg-[#1c1c22]' : 'bg-[#141417]'
            }`}
        >
            {/* Header: Title + Attachments + Optional Apply Button */}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-transparent shrink-0">
                <div className="flex items-center gap-2 truncate pr-2">
                    <span className="text-xs font-bold font-mono text-[#ffffff]">
                        {title}
                    </span>
                    {isUser && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-[#282832] text-[#d4d4dc]">
                            현재 장착
                        </span>
                    )}
                    <span className="text-[11px] text-[#8e8e93] truncate font-mono">
                        {attLabel}
                    </span>
                </div>

                {onApply && !isUser && (
                    <button
                        onClick={onApply}
                        className="text-xs text-[#c4c4ca] hover:text-[#ffffff] px-2.5 py-1 rounded bg-[#202026] hover:bg-[#3b82f6] transition-colors shrink-0 font-medium"
                    >
                        적용
                    </button>
                )}
            </div>

            {/* Canvas Container: Visual Recoil Cloud + Smooth Trajectory Line */}
            <div className="flex-1 w-full min-h-0 relative overflow-hidden bg-[#0d0d10]">
                <canvas ref={canvasRef} className="w-full h-full block" />
            </div>
        </div>
    );
};
