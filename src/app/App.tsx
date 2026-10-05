import React, { useEffect, useState, useMemo } from 'react';
import { SimulatorController } from './SimulatorController';
import { Header } from './components/Header';
import { WeaponAttachmentSelector } from './components/WeaponAttachmentSelector';
import { AttachmentRecommendationPanel } from './components/AttachmentRecommendationPanel';
import { MonteCarloDispersionMap } from './components/MonteCarloDispersionMap';
import { MonteCarloEngine, MonteCarloResult } from '../montecarlo';
import { FPSCanvas } from './FPSCanvas';
import { SelectedAttachments } from '../core/compiler/WeaponCompiler';
import { StanceMode } from '../core';

export const App: React.FC = () => {
    const controller = useMemo(() => new SimulatorController(), []);
    const [, setTick] = useState(0);

    const [activeTab, setActiveTab] = useState<'simulation' | 'recommendation'>('simulation');
    const [selectedShotIndex, setSelectedShotIndex] = useState<number | null>(null);
    const [showDebugVectors, setShowDebugVectors] = useState(false);
    const [showTracers, setShowTracers] = useState(true);
    const [isDispersionOpen, setIsDispersionOpen] = useState(false);

    const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null);
    const [isMcRunning, setIsMcRunning] = useState(false);

    const runMonteCarlo = () => {
        setIsMcRunning(true);
        setTimeout(() => {
            const magsize = Math.round(controller.compiledWeaponData.magsize || 30);
            const mc = new MonteCarloEngine({
                weaponData: controller.compiledWeaponData,
                aiming: controller.state.aiming,
                stance: controller.state.stance,
                device: controller.state.device,
                targetDistance: controller.state.targetDistance,
                trialCount: 50,
                burstSize: magsize,
                masterSeed: controller.state.seed,
                maxStoredImpacts: 1000
            });
            const res = mc.run();
            setMcResult(res);
            setIsMcRunning(false);
        }, 10);
    };

    // Auto-run Monte Carlo when dispersion modal opens if not already generated
    useEffect(() => {
        if (isDispersionOpen && !mcResult) {
            runMonteCarlo();
        }
    }, [isDispersionOpen]);

    // Re-render subscription
    useEffect(() => {
        const interval = setInterval(() => {
            if (controller.state.isPlaying) {
                setTick((t) => (t + 1) % 1000);
            }
        }, 100);

        const unsubscribe = controller.subscribe(() => {
            setTick((t) => (t + 1) % 1000);
            setMcResult(null); // Invalidate cached MC result when weapon or controller state updates
        });

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            if (e.key === 'c' || e.key === 'C') {
                controller.resetSimulation();
                setSelectedShotIndex(null);
                setMcResult(null);
            } else if (e.key === ' ') {
                e.preventDefault();
                controller.fireSingleShot();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            clearInterval(interval);
            unsubscribe();
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [controller]);

    // Handle Weapon change from left panel
    const handleSelectWeapon = (weaponId: string) => {
        controller.selectWeapon(weaponId);
        setSelectedShotIndex(null);
        setMcResult(null);
    };

    // Handle Attachment change from left panel
    const handleChangeAttachment = (slot: string, attachmentName: string | undefined) => {
        const current = { ...controller.selectedAttachments };
        if (!attachmentName) {
            delete current[slot];
        } else {
            current[slot] = attachmentName;
        }
        controller.setAttachments(current);
        setSelectedShotIndex(null);
        setMcResult(null);
    };

    // Reset attachments
    const handleResetAttachments = () => {
        controller.setAttachments({});
        setSelectedShotIndex(null);
        setMcResult(null);
    };

    // Apply preset from 2x2 recommendation panel
    const handleApplyPreset = (presetAttachments: SelectedAttachments) => {
        controller.setAttachments(presetAttachments);
        setSelectedShotIndex(null);
        setMcResult(null);
    };

    const shots = controller.getPhysicalShots();
    const currentMagsize = controller.compiledWeaponData.magsize || 30;
    const currentFirerate = controller.compiledWeaponData.firerate || 800;

    return (
        <div className="w-screen h-screen flex flex-col bg-[#0a0a0c] text-[#e0e0e0] overflow-hidden font-sans select-none relative">
            {/* 1. Minimal Top Header */}
            <Header
                weaponData={controller.compiledWeaponData}
                activeTab={activeTab}
                onSelectTab={setActiveTab}
                targetDistance={controller.state.targetDistance}
                onSetTargetDistance={(dist) => controller.setTargetDistance(dist)}
                isAiming={controller.state.aiming}
                onToggleAim={() => controller.toggleAim()}
                onReset={() => {
                    controller.resetSimulation();
                    setSelectedShotIndex(null);
                    setMcResult(null);
                }}
                isDispersionOpen={isDispersionOpen}
                onToggleDispersion={() => setIsDispersionOpen((prev) => !prev)}
            />

            {/* Center Floating Modal: Monte Carlo 2D Dispersion Map */}
            {isDispersionOpen && mcResult && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
                    <MonteCarloDispersionMap
                        result={mcResult}
                        onClose={() => setIsDispersionOpen(false)}
                        onRerun={runMonteCarlo}
                        isRunning={isMcRunning}
                    />
                </div>
            )}

            {/* 2. Main Exact 40% : 60% Split Layout */}
            <div className="flex-1 flex w-full h-[calc(100vh-56px)] overflow-hidden">
                {/* [Left 40% Column] Settings Panel Only */}
                <div className="w-[40%] flex-none h-full bg-[#141416] border-r border-[#1a1a1e] flex flex-col">
                    <WeaponAttachmentSelector
                        currentWeaponId={controller.weaponId}
                        selectedAttachments={controller.selectedAttachments}
                        onSelectWeapon={handleSelectWeapon}
                        onChangeAttachment={handleChangeAttachment}
                        onResetAttachments={handleResetAttachments}
                    />
                </div>

                {/* [Right 60% Column] Tab Content: Simulation OR Recommendation */}
                <div className="w-[60%] flex-none h-full relative overflow-hidden bg-[#0a0a0c] flex flex-col">
                    {activeTab === 'simulation' ? (
                        /* TAB 1: Direct 3D FPS Interactive Simulation */
                        <div className="relative w-full h-full flex flex-col overflow-hidden">
                            {/* 3D Canvas */}
                            <div className="flex-1 w-full h-full relative">
                                <FPSCanvas
                                    controller={controller}
                                    showDebugVectors={showDebugVectors}
                                    showTracers={showTracers}
                                    selectedShotIndex={selectedShotIndex}
                                    onSelectShot={setSelectedShotIndex}
                                />

                                {/* Upper In-Canvas Quick Telemetry */}
                                <div className="absolute top-4 left-4 z-10 flex items-center gap-3 font-mono text-xs text-[#8e8e93] bg-[#141417]/90 backdrop-blur-md px-3.5 py-1.5 rounded-lg border-0 pointer-events-none shadow-md">
                                    <span>사격수: <strong className="text-[#ffffff]">{shots.length}</strong> / {currentMagsize}</span>
                                    <span>•</span>
                                    <span>연사력: <strong className="text-[#ffffff]">{currentFirerate}</strong> RPM</span>
                                    <span>•</span>
                                    <span>자세: <strong className="text-[#ffffff] uppercase">{controller.state.stance}</strong></span>
                                </div>
                            </div>

                            {/* Bottom Intuitive Shooting Controls */}
                            <div className="h-16 px-6 bg-[#141416] border-t border-[#1a1a1e] flex items-center justify-between z-20">
                                {/* Left Action Buttons */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => controller.fireSingleShot()}
                                        className="px-3.5 py-1.5 bg-[#1c1c1f] hover:bg-[#26262c] text-[#f0f0f2] rounded-md font-medium text-xs transition-colors"
                                    >
                                        단발 사격 (Space)
                                    </button>

                                    <button
                                        onClick={() => controller.fireBurst(3)}
                                        className="px-3.5 py-1.5 bg-[#1c1c1f] hover:bg-[#26262c] text-[#f0f0f2] rounded-md font-medium text-xs transition-colors"
                                    >
                                        3점사 사격
                                    </button>

                                    <button
                                        onClick={() => controller.toggleContinuousFiring()}
                                        className={`px-3.5 py-1.5 rounded-md font-medium text-xs transition-colors ${
                                            controller.state.isContinuousFiring
                                                ? 'bg-[#ef4444] text-[#ffffff]'
                                                : 'bg-[#1c1c1f] hover:bg-[#26262c] text-[#f0f0f2]'
                                        }`}
                                    >
                                        {controller.state.isContinuousFiring ? '사격 중지' : '전탄 연사'}
                                    </button>

                                    <button
                                        onClick={() => {
                                             controller.resetSimulation();
                                             setSelectedShotIndex(null);
                                             setMcResult(null);
                                        }}
                                        className="px-3 py-1.5 text-xs text-[#8e8e93] hover:text-[#f0f0f2] transition-colors"
                                    >
                                        탄창 리셋
                                    </button>
                                </div>

                                {/* Right Stance & Speed Options (Pill-Segmented Controls) */}
                                <div className="flex items-center gap-3 text-xs font-mono">
                                    {/* Stance Selector */}
                                    <div className="flex items-center bg-[#1c1c1f] p-0.5 rounded-full">
                                        {(['stand', 'crouch', 'prone'] as StanceMode[]).map((mode) => (
                                            <button
                                                key={mode}
                                                onClick={() => controller.setStance(mode)}
                                                className={`px-2.5 py-0.5 rounded-full text-[11px] capitalize transition-colors font-medium ${
                                                    controller.state.stance === mode
                                                        ? 'bg-[#2a2a30] text-[#ffffff] shadow-sm'
                                                        : 'text-[#8e8e93] hover:text-[#f0f0f2]'
                                                }`}
                                            >
                                                {mode}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Simulation Speed */}
                                    <div className="flex items-center bg-[#1c1c1f] p-0.5 rounded-full">
                                        {[1.0, 0.5, 0.1].map((spd) => (
                                            <button
                                                key={spd}
                                                onClick={() => controller.setTimeSpeed(spd)}
                                                className={`px-2.5 py-0.5 rounded-full text-[11px] transition-colors font-medium ${
                                                    controller.state.timeSpeed === spd
                                                        ? 'bg-[#2a2a30] text-[#ffffff] shadow-sm'
                                                        : 'text-[#8e8e93] hover:text-[#f0f0f2]'
                                                }`}
                                            >
                                                {spd}x
                                            </button>
                                        ))}
                                    </div>

                                    {/* Visual Toggles */}
                                    <button
                                        onClick={() => setShowTracers(!showTracers)}
                                        className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                                            showTracers ? 'bg-[#2a2a30] text-[#ffffff]' : 'text-[#8e8e93] hover:text-[#f0f0f2]'
                                        }`}
                                    >
                                        궤적 선
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* TAB 2: 2x2 Attachment Recoil Recommendation Matrix */
                        <div className="w-full h-full">
                            <AttachmentRecommendationPanel
                                weaponId={controller.weaponId}
                                currentUserWeaponData={controller.compiledWeaponData}
                                currentUserAttachments={controller.selectedAttachments}
                                onApplyPreset={handleApplyPreset}
                                targetDistance={controller.state.targetDistance}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
