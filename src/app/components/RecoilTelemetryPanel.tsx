import React from 'react';
import { PlayerViewSnapshot, Vector3 } from '../../core';
import { Activity, Camera, RotateCw, Move } from 'lucide-react';

interface RecoilTelemetryPanelProps {
    viewSnapshot: PlayerViewSnapshot;
    firearmPositions: { translation: Vector3; rotation: Vector3 };
    onClose?: () => void;
}

export const RecoilTelemetryPanel: React.FC<RecoilTelemetryPanelProps> = ({
    viewSnapshot,
    firearmPositions,
    onClose
}) => {
    const { cameraBodyRecoilVec, cameraHeadRecoilVec } = viewSnapshot;
    const { translation, rotation } = firearmPositions;

    const renderVectorRow = (label: string, vec: Vector3, colorClass: string) => {
        const mag = vec.magnitude;
        return (
            <div className="flex flex-col gap-1 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 font-medium">{label}</span>
                    <span className={`font-bold ${colorClass}`}>Mag: {mag.toFixed(5)}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-400 font-mono text-center">
                    <span className="bg-slate-900 px-1 py-0.5 rounded border border-slate-800">X: {vec.x.toFixed(4)}</span>
                    <span className="bg-slate-900 px-1 py-0.5 rounded border border-slate-800">Y: {vec.y.toFixed(4)}</span>
                    <span className="bg-slate-900 px-1 py-0.5 rounded border border-slate-800">Z: {vec.z.toFixed(4)}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="w-80 bg-slate-950/85 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 text-slate-100 font-mono z-40 select-none animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                    <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-2">
                        <Activity className="w-4 h-4 text-cyan-400" />
                        Recoil Telemetry
                    </h3>
                    <p className="text-[9px] text-slate-500 font-mono">Roblox CFrame (X=Right, Y=Up, Z=Forward/Back)</p>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
                    >
                        ✕
                    </button>
                )}
            </div>

            <div className="flex flex-col gap-2">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide flex items-center gap-1 font-bold">
                    <RotateCw className="w-3 h-3 text-blue-400" /> Weapon Rotation Recoil
                </div>
                {renderVectorRow("Rotation Recoil", rotation, "text-blue-400")}

                <div className="text-[10px] text-slate-500 uppercase tracking-wide flex items-center gap-1 font-bold mt-1">
                    <Move className="w-3 h-3 text-emerald-400" /> Weapon Translation Recoil
                </div>
                {renderVectorRow("Translation Recoil", translation, "text-emerald-400")}

                <div className="text-[10px] text-slate-500 uppercase tracking-wide flex items-center gap-1 font-bold mt-1">
                    <Camera className="w-3 h-3 text-rose-400" /> Camera Body Recoil
                </div>
                {renderVectorRow("Camera Body", cameraBodyRecoilVec, "text-rose-400")}

                <div className="text-[10px] text-slate-500 uppercase tracking-wide flex items-center gap-1 font-bold mt-1">
                    <Camera className="w-3 h-3 text-amber-400" /> Camera Head Recoil
                </div>
                {renderVectorRow("Camera Head", cameraHeadRecoilVec, "text-amber-400")}
            </div>
        </div>
    );
};
