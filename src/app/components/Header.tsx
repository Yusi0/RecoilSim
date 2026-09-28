import React from 'react';
import { Sliders } from 'lucide-react';
import { CompiledWeaponData } from '../c25DataLoader';

interface HeaderProps {
    weaponData: CompiledWeaponData;
    targetDistance: number;
    onSetTargetDistance: (dist: number) => void;
    activeDrawer: 'telemetry' | 'history' | 'log' | 'settings' | null;
    onToggleDrawer: (drawer: 'telemetry' | 'history' | 'log' | 'settings') => void;
}

export const Header: React.FC<HeaderProps> = ({
    weaponData,
    targetDistance,
    onSetTargetDistance,
    activeDrawer,
    onToggleDrawer
}) => {
    return (
        <header className="h-12 px-4 bg-slate-950/70 backdrop-blur-md border-b border-slate-900 flex items-center justify-between z-30 select-none text-slate-300">
            {/* Left Brand & Settings Gear Button */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => onToggleDrawer('settings')}
                    className={`p-1.5 rounded-md transition-colors ${
                        activeDrawer === 'settings'
                            ? 'text-cyan-400 bg-slate-800'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                    title="Toggle Settings Sidebar"
                >
                    <Sliders className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="font-bold text-slate-100 tracking-tight">RecoilSim</span>
                    <span className="text-[11px] text-slate-500">/</span>
                    <span className="text-[11px] text-slate-400">{weaponData.displayname || 'C25'}</span>
                </div>
            </div>

            {/* Center Target Distance Presets */}
            <div className="flex items-center gap-1 text-[11px] font-mono bg-slate-900/60 p-1 rounded-md border border-slate-800/60">
                <span className="text-slate-500 px-1.5">Target:</span>
                {[50, 100, 200].map((dist) => (
                    <button
                        key={dist}
                        onClick={() => onSetTargetDistance(dist)}
                        className={`px-2 py-0.5 rounded transition-colors ${
                            targetDistance === dist
                                ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        {dist}m
                    </button>
                ))}
            </div>

            {/* Right Secondary Drawer Buttons */}
            <div className="flex items-center gap-3 text-xs font-mono">
                <button
                    onClick={() => onToggleDrawer('telemetry')}
                    className={`transition-colors ${
                        activeDrawer === 'telemetry'
                            ? 'text-cyan-400 font-medium underline underline-offset-4'
                            : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                    Telemetry
                </button>

                <button
                    onClick={() => onToggleDrawer('history')}
                    className={`transition-colors ${
                        activeDrawer === 'history'
                            ? 'text-cyan-400 font-medium underline underline-offset-4'
                            : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                    Shots
                </button>

                <button
                    onClick={() => onToggleDrawer('log')}
                    className={`transition-colors ${
                        activeDrawer === 'log'
                            ? 'text-cyan-400 font-medium underline underline-offset-4'
                            : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                    Log
                </button>
            </div>
        </header>
    );
};
