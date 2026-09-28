import React, { useMemo } from 'react';
import { PhysicalShotSnapshot } from '../../core';
import { Terminal, Copy, Check } from 'lucide-react';

interface ShotLogPanelProps {
    shots: readonly PhysicalShotSnapshot[];
    targetDistance?: number;
    onClose?: () => void;
}

export const ShotLogPanel: React.FC<ShotLogPanelProps> = ({
    shots,
    targetDistance = 50,
    onClose
}) => {
    const [copied, setCopied] = React.useState(false);

    // Format plain text log output + RotP/RotV spring trace + ΔDir & DirAng
    const logText = useMemo(() => {
        const header = 'Pos                 Del                 Dis      Ang      Dir                     DirAng   ΔDir';
        if (shots.length === 0) {
            return `${header}\n\n(No shots fired yet)`;
        }

        const targetZ = -targetDistance;
        const lines: string[] = [header];

        let prevX: number | null = null;
        let prevY: number | null = null;
        let prevDir: { x: number; y: number; z: number } | null = null;

        shots.forEach((shot, idx) => {
            const shotNum = `#${idx + 1}`;
            const origin = shot.origin;
            const dir = shot.direction;

            // Compute 2D Direction Angle: atan2(dir.y, dir.x), +X=0 deg, +Y=90 deg (Up)
            const dirRad = Math.atan2(dir.y, dir.x);
            const dirDeg = (dirRad * 180 / Math.PI + 360) % 360;
            const dirAngStr = `${dirDeg.toFixed(1)}°`;

            // Compute 2D impact position on target plane
            const distToTarget = Math.abs((targetZ - origin.z) / (dir.z === 0 ? -1 : dir.z));
            const x = origin.x + dir.x * distToTarget;
            const y = origin.y + dir.y * distToTarget;

            const posStr = `(${x.toFixed(3)}, ${y.toFixed(3)})`;
            const dirStr = `(${dir.x.toFixed(3)}, ${dir.y.toFixed(3)}, ${dir.z.toFixed(3)})`;

            if (idx === 0 || prevX === null || prevY === null || prevDir === null) {
                const line = `${shotNum}: ${posStr}, —, —, —, ${dirStr}, ${dirAngStr}, —`;
                lines.push(line);
            } else {
                const dx = x - prevX;
                const dy = y - prevY;
                const dis = Math.hypot(dx, dy);

                let rad = Math.atan2(dy, dx);
                let deg = (rad * 180 / Math.PI + 360) % 360;

                const dxSign = dx >= 0 ? `+${dx.toFixed(3)}` : dx.toFixed(3);
                const dySign = dy >= 0 ? `+${dy.toFixed(3)}` : dy.toFixed(3);

                const delStr = `(${dxSign}, ${dySign})`;
                const disStr = dis.toFixed(3);
                const angStr = `${deg.toFixed(1)}°`;

                // Delta Dir (ΔDir)
                const ddx = dir.x - prevDir.x;
                const ddy = dir.y - prevDir.y;
                const ddz = dir.z - prevDir.z;

                const ddxSign = ddx >= 0 ? `+${ddx.toFixed(3)}` : ddx.toFixed(3);
                const ddySign = ddy >= 0 ? `+${ddy.toFixed(3)}` : ddy.toFixed(3);
                const ddzSign = ddz >= 0 ? `+${ddz.toFixed(3)}` : ddz.toFixed(3);
                const deltaDirStr = `(${ddxSign}, ${ddySign}, ${ddzSign})`;

                const line = `${shotNum}: ${posStr}, ${delStr}, ${disStr}, ${angStr}, ${dirStr}, ${dirAngStr}, ${deltaDirStr}`;
                lines.push(line);
            }

            prevX = x;
            prevY = y;
            prevDir = dir;
        });

        // Add C25 Rotation Recoil Spring State Trace (#N RotP & RotV)
        lines.push('');
        lines.push('--------------------------------------------------------------------------------');
        lines.push(`--- C25 ROTATION RECOIL SPRING STATE TRACE (RotP & RotV) (${shots.length} Shots) ---`);
        lines.push('--------------------------------------------------------------------------------');

        shots.forEach((shot, idx) => {
            const shotNum = `#${idx + 1}`;
            const rotP = shot.rotationRecoilVec;
            const rotV = shot.rotationRecoilVelVec ?? { x: 0, y: 0, z: 0 };
            const D = shot.direction;

            const rotPStr = `RotP=(${rotP.x.toFixed(4)}, ${rotP.y.toFixed(4)}, ${rotP.z.toFixed(4)})`;
            const rotVStr = `RotV=(${rotV.x.toFixed(4)}, ${rotV.y.toFixed(4)}, ${rotV.z.toFixed(4)})`;
            const dirStr = `Dir=(${D.x.toFixed(4)}, ${D.y.toFixed(4)}, ${D.z.toFixed(4)})`;

            lines.push(`${shotNum} ${rotPStr} ${rotVStr} ${dirStr}`);
        });

        // Add Section Phase Analysis (#2~#13 vs #14~#24)
        if (shots.length >= 14) {
            lines.push('');
            lines.push('--- RECOIL DRIFT PHASE ANALYSIS ---');

            const shot2 = shots[1];
            const shot13 = shots[Math.min(12, shots.length - 1)];
            const shot14 = shots[Math.min(13, shots.length - 1)];
            const shot24 = shots[Math.min(23, shots.length - 1)];

            if (shot2 && shot13) {
                const rotP2 = shot2.rotationRecoilVec;
                const rotP13 = shot13.rotationRecoilVec;
                lines.push(`#2~#13 Rightward Accumulation Phase:`);
                lines.push(`    #2  RotP=(${rotP2.x.toFixed(4)}, ${rotP2.y.toFixed(4)}, ${rotP2.z.toFixed(4)})`);
                lines.push(`    #13 RotP=(${rotP13.x.toFixed(4)}, ${rotP13.y.toFixed(4)}, ${rotP13.z.toFixed(4)})`);
            }

            if (shot14 && shot24) {
                const rotP14 = shot14.rotationRecoilVec;
                const rotP24 = shot24.rotationRecoilVec;
                lines.push(`#14~#24 Transition/Recovery Phase:`);
                lines.push(`    #14 RotP=(${rotP14.x.toFixed(4)}, ${rotP14.y.toFixed(4)}, ${rotP14.z.toFixed(4)})`);
                lines.push(`    #24 RotP=(${rotP24.x.toFixed(4)}, ${rotP24.y.toFixed(4)}, ${rotP24.z.toFixed(4)})`);
            }
        }

        // Add Target Plane Definition & Ray-Plane Intersection Audit Section
        lines.push('');
        lines.push('--------------------------------------------------------------------------------');
        lines.push(`--- DIAGNOSTIC AUDIT: Direction Vector Delta & Ray-Plane Intersection (${shots.length} Shots) ---`);
        lines.push(`Target Plane Origin: (0.000, 0.000, ${targetZ.toFixed(3)})`);
        lines.push(`Target Plane Normal: (0.000, 0.000, 1.000)`);
        lines.push('--------------------------------------------------------------------------------');

        shots.forEach((shot, idx) => {
            const shotNum = `#${idx + 1}`;
            const O = shot.origin;
            const D = shot.direction;

            const distToTarget = Math.abs((targetZ - O.z) / (D.z === 0 ? -1 : D.z));
            const posX = O.x + D.x * distToTarget;
            const posY = O.y + D.y * distToTarget;
            const posZ = targetZ;

            const P0_z = targetZ;
            const t = D.z !== 0 ? (P0_z - O.z) / D.z : 0;

            const calcX = O.x + t * D.x;
            const calcY = O.y + t * D.y;
            const calcZ = O.z + t * D.z;

            const errX = posX - calcX;
            const errY = posY - calcY;
            const errZ = posZ - calcZ;
            const errMag = Math.hypot(errX, errY, errZ);

            lines.push(`${shotNum}: Dir=(${D.x.toFixed(4)}, ${D.y.toFixed(4)}, ${D.z.toFixed(4)})`);
            lines.push(`    Pos    = (${posX.toFixed(4)}, ${posY.toFixed(4)}, ${posZ.toFixed(4)})`);
            lines.push(`    CalcPos= (${calcX.toFixed(4)}, ${calcY.toFixed(4)}, ${calcZ.toFixed(4)})`);
            lines.push(`    Error  = (${errX.toFixed(6)}, ${errY.toFixed(6)}, ${errZ.toFixed(6)}) Mag=${errMag.toFixed(6)}`);
        });

        return lines.join('\n');
    }, [shots, targetDistance]);

    const handleCopy = () => {
        navigator.clipboard.writeText(logText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="w-[660px] bg-slate-950/95 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 font-mono z-40 select-none animate-in fade-in slide-in-from-top-2 duration-150 text-slate-100">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs uppercase tracking-wider text-slate-300 font-bold">
                        Shot Audit & Rotation Recoil Log
                    </h3>
                    <span className="text-[10px] text-slate-500 font-normal">({shots.length} Shots, {targetDistance}m)</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
                        title="Copy log to clipboard"
                    >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                        <span>{copied ? 'Copied' : 'Copy Log'}</span>
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all text-xs"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Selectable Monospaced Plain Text Area */}
            <div className="relative bg-slate-950 rounded-xl border border-slate-800/80 p-3 max-h-[440px] overflow-auto custom-scrollbar">
                <pre className="text-[11px] leading-relaxed text-slate-200 select-text cursor-text font-mono whitespace-pre font-normal">
                    {logText}
                </pre>
            </div>
        </div>
    );
};
