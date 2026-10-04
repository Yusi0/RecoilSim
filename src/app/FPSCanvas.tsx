import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SimulatorController } from './SimulatorController';
import { PhysicalShotSnapshot, Vector3, CFrame, WeaponPose } from '../core';

const _cframeMatrix = new THREE.Matrix4();
export function applyCFrameToObject(object: THREE.Object3D, cf: CFrame): void {
    const r = cf.r;
    const p = cf.p;
    _cframeMatrix.set(
        r[0], r[1], r[2], p.x,
        r[3], r[4], r[5], p.y,
        r[6], r[7], r[8], p.z,
        0,    0,    0,    1
    );
    _cframeMatrix.decompose(object.position, object.quaternion, object.scale);
}

interface FPSCanvasProps {
    controller: SimulatorController;
    showDebugVectors?: boolean;
    showTracers?: boolean;
    selectedShotIndex?: number | null;
    onSelectShot?: (index: number) => void;
}

const MAX_IMPACT_DOTS = 600;
const MAX_TRACERS = 600;

export const FPSCanvas: React.FC<FPSCanvasProps> = ({
    controller,
    showDebugVectors = false,
    showTracers = false,
    selectedShotIndex = null,
    onSelectShot
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const weaponGroupRef = useRef<THREE.Group | null>(null);
    const debugGroupRef = useRef<THREE.Group | null>(null);
    const muzzleFlashLightRef = useRef<THREE.PointLight | null>(null);

    // Object Pools to eliminate 60 FPS allocations and memory leaks
    const impactMeshPoolRef = useRef<THREE.Mesh[]>([]);
    const tracerLinePoolRef = useRef<THREE.Line[]>([]);

    const [isCanvasFocused, setIsCanvasFocused] = useState(false);
    const isMouseDownRef = useRef(false);

    useEffect(() => {
        if (!containerRef.current) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        // 1. Three.js Scene & Camera Setup (Neutral Grayscale)
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1c);
        scene.fog = new THREE.FogExp2(0x1a1a1c, 0.005);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(75, width / height, 0.05, 500);
        camera.position.set(0, 1.5, 0);
        scene.add(camera); // Camera added to scene
        cameraRef.current = camera;

        // 2. Renderer Setup
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // 3. Lighting Setup (Neutral tones)
        const ambLight = new THREE.AmbientLight(0xd1d5db, 0.85);
        scene.add(ambLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(20, 40, 20);
        dirLight.castShadow = true;
        scene.add(dirLight);

        const fillLight = new THREE.PointLight(0xffffff, 0.25, 30);
        fillLight.position.set(-10, 5, -10);
        scene.add(fillLight);

        // 4. Ground Grid & Firing Range Environment (Neutral Grayscale)
        const gridHelper = new THREE.GridHelper(500, 100, 0x2e2e32, 0x18181a);
        gridHelper.position.y = -10.0;
        scene.add(gridHelper);

        // 5. Viewmodel Mesh Group (PARENTED TO SCENE, NOT CAMERA)
        // Eliminates CameraHead recoil contamination from viewmodel
        const weaponGroup = new THREE.Group();
        weaponGroupRef.current = weaponGroup;
        scene.add(weaponGroup);
        buildLowPolyWeapon(weaponGroup);

        // Muzzle Flash Light (attached to weaponGroup at barrel tip)
        const muzzleFlashLight = new THREE.PointLight(0xffaa22, 0, 8);
        muzzleFlashLight.position.set(0, 0, -0.65);
        weaponGroup.add(muzzleFlashLight);
        muzzleFlashLightRef.current = muzzleFlashLight;

        // 6. Object Pools Allocation (Created ONCE to prevent GC lag)
        const impactGroup = new THREE.Group();
        scene.add(impactGroup);
        const impactPool: THREE.Mesh[] = [];
        // Unit sphere geometry: scaled dynamically in render loop for screen-space constant size
        const dotGeo = new THREE.SphereGeometry(1.0, 16, 16);

        for (let i = 0; i < MAX_IMPACT_DOTS; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: 0x00f2fe,
                transparent: true,
                opacity: 1.0,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(dotGeo, mat);
            mesh.visible = false;
            impactGroup.add(mesh);
            impactPool.push(mesh);
        }
        impactMeshPoolRef.current = impactPool;

        const tracerGroup = new THREE.Group();
        scene.add(tracerGroup);
        const tracerPool: THREE.Line[] = [];
        for (let i = 0; i < MAX_TRACERS; i++) {
            const lineMat = new THREE.LineBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.5 });
            const lineGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -1)
            ]);
            const line = new THREE.Line(lineGeo, lineMat);
            line.visible = false;
            tracerGroup.add(line);
            tracerPool.push(line);
        }
        tracerLinePoolRef.current = tracerPool;

        const debugGroup = new THREE.Group();
        debugGroupRef.current = debugGroup;
        scene.add(debugGroup);

        // 8. Animation Frame Loop (Single Instance with cancel teardown)
        let lastTimeSec = performance.now() / 1000;
        let animationFrameId: number;
        let lastShotCount = 0;

        const animate = () => {
            const nowSec = performance.now() / 1000;
            const dt = Math.min(nowSec - lastTimeSec, 0.1);
            lastTimeSec = nowSec;

            // Step Simulation Engine
            controller.updateFrame(dt);

            // Muzzle Flash Check
            const shots = controller.getPhysicalShots();
            if (shots.length > lastShotCount) {
                lastShotCount = shots.length;
                if (muzzleFlashLightRef.current) {
                    muzzleFlashLightRef.current.intensity = 4.0;
                }
            }

            if (muzzleFlashLightRef.current && muzzleFlashLightRef.current.intensity > 0) {
                muzzleFlashLightRef.current.intensity *= 0.6;
                if (muzzleFlashLightRef.current.intensity < 0.05) {
                    muzzleFlashLightRef.current.intensity = 0;
                }
            }


            // Fetch Recoil, Camera & WeaponPose States
            const view = controller.getPlayerViewSnapshot();
            const weaponPose = controller.getWeaponPose();
            const isAiming = controller.state.aiming;

            // FOV Transition (Zoom in ADS)
            const targetFov = isAiming ? 48 : 75;
            camera.fov += (targetFov - camera.fov) * 0.15;
            camera.updateProjectionMatrix();

            // Camera receives v187: baseCamera * bodyRecoil * headRecoil + positionOffset
            applyCFrameToObject(camera, view.v187);

            // Viewmodel receives authoritative WeaponPose: weaponCFrame (rootCFrame * _mainC0)
            // CameraHead has strictly 0% presence in WeaponPose!
            applyCFrameToObject(weaponGroup, weaponPose.weaponCFrame);

            // Render Impact Dots (탄착점) & Tracers using pre-allocated object pools
            updateImpactsAndTracers(
                camera,
                shots,
                selectedShotIndex,
                controller.state.targetDistance,
                showTracers
            );

            // Render Debug Vectors if enabled
            if (showDebugVectors) {
                const latestShot = shots.length > 0 ? shots[shots.length - 1] : null;
                updateDebugVectors(weaponPose.cameraBodyRecoilVec, weaponPose.rotationRecoilVec, latestShot, controller.state.targetDistance);
            } else {
                debugGroup.clear();
            }

            renderer.render(scene, camera);
            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        // Handle Resize
        const handleResize = () => {
            if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
            const newW = containerRef.current.clientWidth;
            const newH = containerRef.current.clientHeight;
            cameraRef.current.aspect = newW / newH;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(newW, newH);
        };

        window.addEventListener('resize', handleResize);

        // Teardown & Complete Memory Disposal on Unmount
        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleResize);

            dotGeo.dispose();
            impactPool.forEach((m) => (m.material as THREE.Material).dispose());
            tracerPool.forEach((l) => {
                l.geometry.dispose();
                (l.material as THREE.Material).dispose();
            });

            if (rendererRef.current && rendererRef.current.domElement) {
                rendererRef.current.domElement.remove();
                rendererRef.current.dispose();
            }
        };
    }, [controller, showDebugVectors, showTracers, selectedShotIndex]);

    // Build Simple FPS Viewmodel (Receiver, Barrel, Grip, Muzzle) - SIGHT MODEL REMOVED
    const buildLowPolyWeapon = (group: THREE.Group) => {
        group.clear();

        const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
        const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
        const polymerMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.1, roughness: 0.8 });

        // Receiver Body
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.38), metalMat);
        receiver.position.set(0, 0, 0);
        group.add(receiver);

        // Barrel (Tip at Z = -0.65)
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 16), darkMetal);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0, -0.42);
        group.add(barrel);

        // Muzzle Device (Positioned at exact barrel tip -0.65)
        const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 16), darkMetal);
        muzzle.rotation.x = Math.PI / 2;
        muzzle.position.set(0, 0, -0.65);
        group.add(muzzle);

        // Grip & Magazine
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.06), polymerMat);
        grip.rotation.x = 0.3;
        grip.position.set(0, -0.11, 0.14);
        group.add(grip);

        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.07), polymerMat);
        mag.rotation.x = -0.2;
        mag.position.set(0, -0.12, 0.04);
        group.add(mag);
    };

    // Color palette cycling per magazine: Math.floor(shot.fireCount / magsize)
    const IMPACT_COLOR_PALETTE = [
        0x00f2fe, // Group 0 (Mag 1): Cyan
        0xff9f43, // Group 1 (Mag 2): Vibrant Amber / Orange
        0x10b981, // Group 2 (Mag 3): Emerald Mint
        0xa855f7, // Group 3 (Mag 4): Electric Purple
        0xf43f5e, // Group 4 (Mag 5): Rose Pink
        0x38bdf8, // Group 5 (Mag 6): Sky Blue
        0xfacc15  // Group 6 (Mag 7): Bright Gold
    ];

    // Update Impact Dots (탄착점) & Tracers with Magazine-based Coloring
    const updateImpactsAndTracers = (
        camera: THREE.PerspectiveCamera,
        shots: readonly PhysicalShotSnapshot[],
        selectedIdx: number | null,
        targetDistance: number,
        enableTracers: boolean
    ) => {
        const impactPool = impactMeshPoolRef.current;
        const tracerPool = tracerLinePoolRef.current;
        const targetZ = -targetDistance;
        const totalShots = shots.length;

        // Dynamic Magazine Size from Weapon Data (no hardcoded values)
        const magsize = Math.max(1, Math.round(controller.compiledWeaponData.magsize || 30));

        // Half vertical FOV in radians for screen-space constant size projection
        const halfFovRad = THREE.MathUtils.degToRad(camera.fov / 2);
        const tanHalfFov = Math.tan(halfFovRad);
        // Screen-space scale factor multiplied by user settings (controller.state.dotSize)
        const dotScale = controller.state.dotSize ?? 1.0;
        const screenFraction = 0.0035 * dotScale;

        // 1. Update 3D Floating Impact Dots
        for (let i = 0; i < MAX_IMPACT_DOTS; i++) {
            if (i < totalShots) {
                const shot = shots[i];
                const origin = shot.origin;
                const dir = shot.direction;

                const distToTarget = Math.abs((targetZ - origin.z) / (dir.z === 0 ? -1 : dir.z));
                const endPointX = origin.x + dir.x * distToTarget;
                const endPointY = origin.y + dir.y * distToTarget;

                const mesh = impactPool[i];
                mesh.position.set(endPointX, endPointY, targetZ);

                // Constant screen-space size formula:
                // worldRadius = 2.0 * distanceToCamera * tan(fov / 2) * screenFraction
                const distToCamera = camera.position.distanceTo(mesh.position);
                const baseScale = 2.0 * distToCamera * tanHalfFov * screenFraction;

                const isSelected = selectedIdx === i;
                const isLatest = i === totalShots - 1;

                // Color index strictly determined by magazine index = Math.floor(fireCount / magsize)
                // Retains same color if firing is paused & resumed within same magazine!
                const colorGroup = Math.floor(shot.fireCount / magsize);
                const groupColorHex = IMPACT_COLOR_PALETTE[colorGroup % IMPACT_COLOR_PALETTE.length];

                // Opacity calculation (independent of color):
                const ageInShots = (totalShots - 1) - i;
                const minOpacity = 0.20;
                const ageSpan = Math.max(magsize, totalShots - 1);
                const ageFactor = Math.min(1.0, ageInShots / ageSpan);
                const computedOpacity = isSelected ? 1.0 : (1.0 - ageFactor * (1.0 - minOpacity));

                const mat = mesh.material as THREE.MeshBasicMaterial;
                if (isSelected) {
                    mat.color.setHex(0xffea00);
                    mat.opacity = 1.0;
                    const s = baseScale * 1.5;
                    mesh.scale.set(s, s, s);
                } else if (isLatest) {
                    mat.color.setHex(groupColorHex);
                    mat.opacity = 1.0;
                    const s = baseScale * 1.25;
                    mesh.scale.set(s, s, s);
                } else {
                    mat.color.setHex(groupColorHex);
                    mat.opacity = computedOpacity;
                    const s = baseScale * 1.0;
                    mesh.scale.set(s, s, s);
                }
                mesh.visible = true;
            } else {
                impactPool[i].visible = false;
            }
        }

        // 2. Update Bullet Tracers (Only if enabled)
        for (let i = 0; i < MAX_TRACERS; i++) {
            if (enableTracers && i < totalShots) {
                const shot = shots[i];
                const origin = shot.origin;
                const dir = shot.direction;

                const distToTarget = Math.abs((targetZ - origin.z) / (dir.z === 0 ? -1 : dir.z));
                const endPointX = origin.x + dir.x * distToTarget;
                const endPointY = origin.y + dir.y * distToTarget;

                const line = tracerPool[i];
                const positions = line.geometry.attributes.position.array as Float32Array;
                positions[0] = origin.x;
                positions[1] = origin.y;
                positions[2] = origin.z;
                positions[3] = endPointX;
                positions[4] = endPointY;
                positions[5] = targetZ;
                line.geometry.attributes.position.needsUpdate = true;

                const colorGroup = Math.floor(shot.fireCount / magsize);
                const colorHex = IMPACT_COLOR_PALETTE[colorGroup % IMPACT_COLOR_PALETTE.length];
                (line.material as THREE.LineBasicMaterial).color.setHex(colorHex);
                line.visible = true;
            } else {
                tracerPool[i].visible = false;
            }
        }
    };

    const updateDebugVectors = (
        bodyRecoil: Vector3,
        rotRecoil: Vector3,
        latestShot?: PhysicalShotSnapshot | null,
        targetDistance: number = 50
    ) => {
        if (!debugGroupRef.current) return;
        const group = debugGroupRef.current;
        group.clear();

        const dirBody = new THREE.Vector3(bodyRecoil.x, bodyRecoil.y, bodyRecoil.z).multiplyScalar(40);
        const arrowBody = new THREE.ArrowHelper(dirBody.clone().normalize(), new THREE.Vector3(-0.4, 1.4, -2), dirBody.length(), 0xff0055);
        group.add(arrowBody);

        const dirRot = new THREE.Vector3(rotRecoil.x, rotRecoil.y, rotRecoil.z).multiplyScalar(40);
        const arrowRot = new THREE.ArrowHelper(dirRot.clone().normalize(), new THREE.Vector3(-0.2, 1.4, -2), dirRot.length(), 0x00f2fe);
        group.add(arrowRot);

        // Visual Diagnostic Lines: CORE DIRECTION (Yellow) vs RENDERED DIRECTION (Cyan)
        if (latestShot) {
            const origin = new THREE.Vector3(latestShot.origin.x, latestShot.origin.y, latestShot.origin.z);
            const coreDir = new THREE.Vector3(latestShot.direction.x, latestShot.direction.y, latestShot.direction.z).normalize();

            const targetZ = -targetDistance;
            const distToTarget = Math.abs((targetZ - latestShot.origin.z) / (latestShot.direction.z === 0 ? -1 : latestShot.direction.z));
            const endPoint = new THREE.Vector3(
                latestShot.origin.x + latestShot.direction.x * distToTarget,
                latestShot.origin.y + latestShot.direction.y * distToTarget,
                targetZ
            );
            const renderedDir = endPoint.clone().sub(origin).normalize();

            // 1. CORE DIRECTION (Yellow arrow)
            const arrowCore = new THREE.ArrowHelper(coreDir, origin, 15, 0xffea00, 0.4, 0.15);
            group.add(arrowCore);

            // 2. RENDERED DIRECTION (Cyan arrow)
            const arrowRendered = new THREE.ArrowHelper(renderedDir, origin, 15, 0x00f2fe, 0.4, 0.15);
            group.add(arrowRendered);
        }
    };

    // Canvas Click Input Handlers
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button === 0) {
            // Left Click: Fire
            isMouseDownRef.current = true;
            controller.setContinuousFiring(true);
        } else if (e.button === 2) {
            // Right Click: ADS Toggle
            e.preventDefault();
            controller.setAim(!controller.state.aiming);
        }
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button === 0) {
            isMouseDownRef.current = false;
            controller.setContinuousFiring(false);
        }
    };

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full cursor-crosshair select-none bg-[#141416]"
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onContextMenu={(e) => e.preventDefault()}
            onMouseEnter={() => setIsCanvasFocused(true)}
            onMouseLeave={() => {
                setIsCanvasFocused(false);
                if (isMouseDownRef.current) {
                    isMouseDownRef.current = false;
                    controller.setContinuousFiring(false);
                }
            }}
        >
            {/* FPS Center Crosshair: Classic Clean White Cross (+) */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                    className="relative w-5 h-5 flex items-center justify-center transition-transform duration-75"
                    style={{
                        transform: `scale(${controller.state.aiming ? 0.75 : 1.0})`
                    }}
                >
                    {/* Top tick */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[2px] h-[6px] bg-white/90 shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
                    {/* Bottom tick */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[2px] h-[6px] bg-white/90 shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
                    {/* Left tick */}
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[6px] h-[2px] bg-white/90 shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
                    {/* Right tick */}
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[6px] h-[2px] bg-white/90 shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
                </div>
            </div>

            {/* Subtle Guide Hint */}
            {isCanvasFocused && (
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 pointer-events-none text-[11px] font-mono text-[#8e8e93] bg-[#18181c]/90 px-3 py-1 rounded-full border border-[#24242a] shadow-lg">
                    Left Click: Fire | Right Click: ADS | C: Reset
                </div>
            )}
        </div>
    );
};
