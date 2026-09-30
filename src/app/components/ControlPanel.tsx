import React from 'react';
import { SimulatorController } from '../SimulatorController';
import { StanceMode, DeviceType } from '../../core';
import { SUPPORTED_WEAPONS } from '../c25DataLoader';

interface ControlPanelProps {
    controller: SimulatorController;
    onClose?: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ controller, onClose }) => {
    const { aiming, stance, device } = controller.state;
    const weapon = controller.compiledWeaponData;

    return (
        <div className="w-64 bg-slate-950/85 backdrop-blur-md border border-slate-800/60 rounded-lg p-3.5 shadow-xl flex flex-col gap-4 text-slate-200 text-xs font-mono select-none">
            {/* Title & Close */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="font-semibold text-slate-400">Settings</span>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-slate-500 hover:text-slate-300 text-xs px-1"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Weapon Selector Presets */}
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Weapon</span>
                    <span className="font-semibold text-cyan-400">{weapon.displayname || 'C25'} ({weapon.firerate} RPM)</span>
                </div>
                <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-900/80 rounded border border-slate-800/80 text-[11px]">
                    {SUPPORTED_WEAPONS.map((w) => {
                        const activeName = (weapon.displayname || weapon.name || '').toLowerCase();
                        const isSelected = activeName === w.displayName.toLowerCase() || activeName === w.name.toLowerCase();
                        return (
                            <button
                                key={w.id}
                                onClick={() => controller.selectWeapon(w.id)}
                                className={`py-1 rounded text-center transition-colors ${
                                    isSelected
                                        ? 'bg-slate-800 text-cyan-300 font-semibold border border-cyan-500/40'
                                        : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                {w.displayName}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Aiming Mode */}
            <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-slate-500">Aiming</span>
                <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-900/80 rounded border border-slate-800/80 text-[11px]">
                    <button
                        onClick={() => controller.setAim(false)}
                        className={`py-1 rounded text-center transition-colors ${
                            !aiming ? 'bg-slate-800 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        Hipfire
                    </button>
                    <button
                        onClick={() => controller.setAim(true)}
                        className={`py-1 rounded text-center transition-colors ${
                            aiming ? 'bg-slate-800 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        ADS
                    </button>
                </div>
            </div>

            {/* Stance */}
            <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-slate-500">Stance</span>
                <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-900/80 rounded border border-slate-800/80 text-[11px]">
                    {(['stand', 'crouch', 'prone'] as StanceMode[]).map((st) => (
                        <button
                            key={st}
                            onClick={() => controller.setStance(st)}
                            className={`py-1 rounded capitalize transition-colors ${
                                stance === st ? 'bg-slate-800 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            {st}
                        </button>
                    ))}
                </div>
            </div>

            {/* Input Device */}
            <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-slate-500">Device</span>
                <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-900/80 rounded border border-slate-800/80 text-[11px]">
                    {(['mouse', 'touch', 'controller'] as DeviceType[]).map((dev) => (
                        <button
                            key={dev}
                            onClick={() => controller.setDevice(dev)}
                            className={`py-1 rounded capitalize transition-colors ${
                                device === dev ? 'bg-slate-800 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            {dev}
                        </button>
                    ))}
                </div>
            </div>

            {/* Dot Size (탄착점 크기 조절) */}
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Dot Size</span>
                    <span className="text-cyan-400 font-semibold">{Math.round((controller.state.dotSize ?? 1.0) * 100)}%</span>
                </div>
                <input
                    type="range"
                    min="0.3"
                    max="2.5"
                    step="0.1"
                    value={controller.state.dotSize ?? 1.0}
                    onChange={(e) => controller.setDotSize(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-400 border border-slate-800"
                />
                <div className="flex justify-between text-[9px] text-slate-600 px-0.5">
                    <button
                        onClick={() => controller.setDotSize(0.5)}
                        className="hover:text-slate-400 transition-colors"
                    >
                        Small (50%)
                    </button>
                    <button
                        onClick={() => controller.setDotSize(1.0)}
                        className="hover:text-slate-400 transition-colors"
                    >
                        Reset (100%)
                    </button>
                    <button
                        onClick={() => controller.setDotSize(2.0)}
                        className="hover:text-slate-400 transition-colors"
                    >
                        Large (200%)
                    </button>
                </div>
            </div>

            {/* Reset */}
            <button
                onClick={() => controller.resetSimulation()}
                className="w-full mt-1 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors text-[11px]"
            >
                Reset Engine (C)
            </button>
        </div>
    );
};
