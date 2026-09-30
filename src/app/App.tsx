import React, { useEffect, useState, useMemo } from 'react';
import { SimulatorController } from './SimulatorController';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { TimeControls } from './components/TimeControls';
import { ShotHistoryPanel } from './components/ShotHistoryPanel';
import { RecoilTelemetryPanel } from './components/RecoilTelemetryPanel';
import { ShotLogPanel } from './components/ShotLogPanel';
import { FPSCanvas } from './FPSCanvas';

export const App: React.FC = () => {
    const controller = useMemo(() => new SimulatorController(), []);
    const [, setTick] = useState(0);

    const [selectedShotIndex, setSelectedShotIndex] = useState<number | null>(null);
    const [showDebugVectors, setShowDebugVectors] = useState(false); // DEFAULT OFF
    const [showTracers, setShowTracers] = useState(false); // DEFAULT OFF
    const [activeDrawer, setActiveDrawer] = useState<'telemetry' | 'history' | 'log' | 'settings' | null>('settings');

    // Low frequency timer (10 Hz) for virtual time display without 60 FPS React re-render lag
    useEffect(() => {
        const interval = setInterval(() => {
            if (controller.state.isPlaying) {
                setTick((t) => (t + 1) % 1000);
            }
        }, 100);

        const unsubscribe = controller.subscribe(() => {
            setTick((t) => (t + 1) % 1000);
        });

        // 'C' key shortcut to reset simulation
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            if (e.key === 'c' || e.key === 'C') {
                controller.resetSimulation();
                setSelectedShotIndex(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            clearInterval(interval);
            unsubscribe();
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [controller]);

    const viewSnapshot = controller.getPlayerViewSnapshot();
    const firearmPositions = controller.getFirearmPositions();
    const shots = controller.getPhysicalShots();

    const handleToggleDrawer = (drawer: 'telemetry' | 'history' | 'log' | 'settings') => {
        setActiveDrawer((prev) => (prev === drawer ? null : drawer));
    };

    return (
        <div className="w-screen h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
            {/* Minimal macOS Style Header */}
            <Header
                weaponData={controller.compiledWeaponData}
                targetDistance={controller.state.targetDistance}
                onSetTargetDistance={(dist) => controller.setTargetDistance(dist)}
                activeDrawer={activeDrawer}
                onToggleDrawer={handleToggleDrawer}
            />

            {/* Fullscreen Interactive 3D Viewport Stage */}
            <div className="relative flex-1 w-full h-full overflow-hidden bg-slate-950">
                {/* 3D Three.js FPS Viewport (Primary Focus) */}
                <FPSCanvas
                    controller={controller}
                    showDebugVectors={showDebugVectors}
                    showTracers={showTracers}
                    selectedShotIndex={selectedShotIndex}
                    onSelectShot={setSelectedShotIndex}
                />

                {/* Left Floating Settings Sidebar */}
                {activeDrawer === 'settings' && (
                    <div className="absolute top-3 left-3 z-20">
                        <ControlPanel controller={controller} onClose={() => setActiveDrawer(null)} />
                    </div>
                )}

                {/* Right Popovers: Telemetry, Shot History, or Shot Debug Log */}
                {activeDrawer === 'telemetry' && (
                    <div className="absolute top-3 right-3 z-20">
                        <RecoilTelemetryPanel
                            viewSnapshot={viewSnapshot}
                            firearmPositions={firearmPositions}
                            onClose={() => setActiveDrawer(null)}
                        />
                    </div>
                )}

                {activeDrawer === 'history' && (
                    <div className="absolute top-3 right-3 z-20">
                        <ShotHistoryPanel
                            shots={shots}
                            selectedShotIndex={selectedShotIndex}
                            onSelectShot={setSelectedShotIndex}
                            targetDistance={controller.state.targetDistance}
                            magsize={controller.compiledWeaponData.magsize || 30}
                            onClose={() => setActiveDrawer(null)}
                        />
                    </div>
                )}

                {activeDrawer === 'log' && (
                    <div className="absolute top-3 right-3 z-20">
                        <ShotLogPanel
                            shots={shots}
                            targetDistance={controller.state.targetDistance}
                            weaponName={controller.compiledWeaponData.displayname}
                            onClose={() => setActiveDrawer(null)}
                        />
                    </div>
                )}

                {/* Bottom Center Floating Controls (Time & Visual Debug Options) */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
                    <TimeControls controller={controller} />

                    {/* Secondary Visual Toggles */}
                    <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800/80 rounded-full px-2.5 py-1.5 flex items-center gap-2 text-[11px] font-mono">
                        <button
                            onClick={() => setShowTracers(!showTracers)}
                            className={`px-2 py-0.5 rounded transition-colors ${
                                showTracers ? 'bg-slate-800 text-cyan-300 font-semibold' : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            Tracers
                        </button>
                        <button
                            onClick={() => setShowDebugVectors(!showDebugVectors)}
                            className={`px-2 py-0.5 rounded transition-colors ${
                                showDebugVectors ? 'bg-slate-800 text-cyan-300 font-semibold' : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            Vectors
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
