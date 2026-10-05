import React from 'react';
import { CompiledWeaponData } from '../c25DataLoader';

interface HeaderProps {
    weaponData: CompiledWeaponData;
    activeTab: 'simulation' | 'recommendation';
    onSelectTab: (tab: 'simulation' | 'recommendation') => void;
    targetDistance: number;
    onSetTargetDistance: (dist: number) => void;
    isAiming: boolean;
    onToggleAim: () => void;
    onReset: () => void;
    isDispersionOpen?: boolean;
    onToggleDispersion?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
    weaponData,
    activeTab,
    onSelectTab,
    targetDistance,
    onSetTargetDistance,
    isAiming,
    onToggleAim,
    onReset,
    isDispersionOpen,
    onToggleDispersion
}) => {
    return (
        <header className="h-14 px-6 bg-[#121214] border-b border-[#1c1c20] flex items-center justify-between z-30 select-none font-sans">
            {/* 1. Left Brand & Current Weapon */}
            <div className="flex items-center gap-3">
                <span className="font-bold text-base text-[#ffffff] tracking-tight">
                    PF RecoilSim
                </span>
                <span className="text-[#3a3a40]">/</span>
                <span className="text-xs font-mono text-[#8e8e93]">
                    {weaponData.displayname || 'C25'}
                </span>
            </div>

            {/* 2. Center Tabs (Clean Apple-style minimal tabs) */}
            <div className="flex items-center gap-8">
                <button
                    onClick={() => onSelectTab('simulation')}
                    className={`text-sm py-1 font-medium transition-all relative ${
                        activeTab === 'simulation'
                            ? 'text-[#ffffff] font-semibold'
                            : 'text-[#7c7c82] hover:text-[#c0c0c5]'
                    }`}
                >
                    시뮬레이션
                    {activeTab === 'simulation' && (
                        <div className="absolute -bottom-3 left-0 right-0 h-[2px] bg-[#3b82f6] rounded-full" />
                    )}
                </button>

                <button
                    onClick={() => onSelectTab('recommendation')}
                    className={`text-sm py-1 font-medium transition-all relative flex items-center gap-2 ${
                        activeTab === 'recommendation'
                            ? 'text-[#ffffff] font-semibold'
                            : 'text-[#7c7c82] hover:text-[#c0c0c5]'
                    }`}
                >
                    부착물 추천
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-[#202024] text-[#8e8e93]">
                        2x2
                    </span>
                    {activeTab === 'recommendation' && (
                        <div className="absolute -bottom-3 left-0 right-0 h-[2px] bg-[#3b82f6] rounded-full" />
                    )}
                </button>
            </div>

            {/* 3. Right Quick Controls with Pill-Segmented Distance & Clear Divider */}
            <div className="flex items-center gap-3 text-xs font-mono">
                {/* Distance Selector (Pill-Segmented Control) */}
                <div className="flex items-center bg-[#1c1c1f] p-0.5 rounded-full">
                    {[25, 50, 100].map((dist) => (
                        <button
                            key={dist}
                            onClick={() => onSetTargetDistance(dist)}
                            className={`px-3 py-1 rounded-full transition-colors text-xs font-mono font-medium ${
                                targetDistance === dist
                                    ? 'bg-[#2e2e34] text-[#ffffff] shadow-sm'
                                    : 'text-[#8e8e93] hover:text-[#f0f0f2]'
                            }`}
                        >
                            {dist}m
                        </button>
                    ))}
                </div>

                {/* Explicit Visual Divider */}
                <div className="w-[1px] h-4 bg-[#26262c] mx-1" />

                {/* Dispersion Map Modal Toggle */}
                {onToggleDispersion && (
                    <button
                        onClick={onToggleDispersion}
                        className={`px-3 py-1.5 rounded-md transition-colors text-xs font-sans font-medium ${
                            isDispersionOpen
                                ? 'bg-cyan-600 text-[#ffffff]'
                                : 'bg-[#1c1c1f] text-[#8e8e93] hover:bg-[#26262c] hover:text-[#f0f0f2]'
                        }`}
                        title="몬테카를로 탄착군 분석"
                    >
                        탄착군 맵
                    </button>
                )}

                {/* ADS Aim Toggle */}
                <button
                    onClick={onToggleAim}
                    className={`px-3 py-1.5 rounded-md transition-colors text-xs font-sans font-medium ${
                        isAiming
                            ? 'bg-[#3b82f6] text-[#ffffff]'
                            : 'bg-[#1c1c1f] text-[#8e8e93] hover:bg-[#26262c] hover:text-[#f0f0f2]'
                    }`}
                >
                    {isAiming ? '조준 해제' : '정조준 (ADS)'}
                </button>

                {/* Reset Simulation Button */}
                <button
                    onClick={onReset}
                    className="px-2.5 py-1.5 rounded-md bg-[#1c1c1f] text-[#8e8e93] hover:text-[#f0f0f2] hover:bg-[#26262c] transition-colors"
                    title="단축키: C"
                >
                    초기화 (C)
                </button>
            </div>
        </header>
    );
};
