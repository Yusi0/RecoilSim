import React from 'react';
import { SimulatorController } from '../SimulatorController';
import { StanceMode, DeviceType } from '../../core';

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

            {/* Weapon Spec */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/60">
                <span>Weapon</span>
                <span className="font-semibold text-slate-200">{weapon.displayname || 'C25'} ({weapon.firerate} RPM)</span>
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

            {/* Reset */}
            <button
                onClick={() => controller.resetSimulation()}
                className="w-full mt-1 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors text-[11px]"
            >
                Reset Engine
            </button>
        </div>
    );
};
