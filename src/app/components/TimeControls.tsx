import React from 'react';
import { Play, Pause, FastForward, Clock } from 'lucide-react';
import { SimulatorController } from '../SimulatorController';

interface TimeControlsProps {
    controller: SimulatorController;
}

export const TimeControls: React.FC<TimeControlsProps> = ({ controller }) => {
    const { isPlaying, timeSpeed, currentTime } = controller.state;
    const speeds = [0.1, 0.25, 0.5, 1.0];

    return (
        <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 rounded-full px-4 py-1.5 shadow-2xl flex items-center gap-4 text-slate-100 font-mono select-none">
            {/* Play / Pause Toggle */}
            <button
                onClick={() => controller.togglePlayPause()}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                    isPlaying
                        ? 'bg-slate-800 text-amber-300 hover:bg-slate-700'
                        : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-bold'
                }`}
                title={isPlaying ? "Pause Simulation" : "Play Simulation"}
            >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-slate-950" />}
            </button>

            {/* Virtual Timestamp */}
            <div className="flex items-center gap-1.5 text-xs">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-semibold text-cyan-300 min-w-[55px]">
                    {currentTime.toFixed(3)}s
                </span>
            </div>

            {/* Divider */}
            <div className="w-px h-4 bg-slate-800" />

            {/* Speed Selector */}
            <div className="flex items-center gap-1 text-[11px]">
                <FastForward className="w-3 h-3 text-slate-500 mr-0.5" />
                {speeds.map((s) => (
                    <button
                        key={s}
                        onClick={() => controller.setTimeSpeed(s)}
                        className={`px-2 py-0.5 rounded-md transition-all font-semibold ${
                            Math.abs(timeSpeed - s) < 1e-3
                                ? 'bg-cyan-500 text-slate-950 shadow-xs'
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        {s}x
                    </button>
                ))}
            </div>
        </div>
    );
};
