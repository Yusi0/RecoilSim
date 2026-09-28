import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SimulatorController } from './SimulatorController';
import { PhysicalShotSnapshot, Vector3 } from '../core';

interface FPSCanvasProps {
    controller: SimulatorController;
    showDebugVectors?: boolean;
    showTracers?: boolean;
    selectedShotIndex?: number | null;
    onSelectShot?: (index: number) => void;
}

const MAX_IMPACT_DOTS = 300;
const MAX_TRACERS = 100;

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
    const targetWallGroupRef = useRef<THREE.Group | null>(null);
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

        // 1. Three.js Scene & Camera Setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x060913);
        scene.fog = new THREE.FogExp2(0x060913, 0.005);
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
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // 3. Lighting Setup
        const ambLight = new THREE.AmbientLight(0x94a3b8, 0.8);
        scene.add(ambLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(20, 40, 20);
        dirLight.castShadow = true;
        scene.add(dirLight);

        const fillLight = new THREE.PointLight(0x00f2fe, 0.4, 30);
        fillLight.position.set(-10, 5, -10);
        scene.add(fillLight);

        // Muzzle Flash Light (attached to camera)
        const muzzleFlashLight = new THREE.PointLight(0xffaa22, 0, 8);
        muzzleFlashLight.position.set(0, -0.05, -0.65);
        camera.add(muzzleFlashLight);
        muzzleFlashLightRef.current = muzzleFlashLight;

        // 4. Ground Grid & Firing Range Environment
        const gridHelper = new THREE.GridHelper(300, 150, 0x1e293b, 0x0f172a);
        gridHelper.position.y = 0;
        scene.add(gridHelper);

        // 5. Target Board Group
        const targetGroup = new THREE.Group();
        targetWallGroupRef.current = targetGroup;
        scene.add(targetGroup);
        buildTargetBoard(targetGroup, controller.state.targetDistance);

        // 6. Viewmodel Mesh Group (PARENTED TO CAMERA for true FPS ADS recoil)
        const weaponGroup = new THREE.Group();
        weaponGroupRef.current = weaponGroup;
        camera.add(weaponGroup); // PARENTED TO CAMERA!
        buildLowPolyWeapon(weaponGroup);

        // 7. Object Pools Allocation (Created ONCE to prevent GC lag)
        const impactGroup = new THREE.Group();
        scene.add(impactGroup);
        const impactPool: THREE.Mesh[] = [];
        const dotGeo = new THREE.SphereGeometry(0.08, 12, 12);
        const normalDotMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe });
        const latestDotMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
        const selectedDotMat = new THREE.MeshBasicMaterial({ color: 0xffea00 });

        for (let i = 0; i < MAX_IMPACT_DOTS; i++) {
            const mesh = new THREE.Mesh(dotGeo, normalDotMat);
            mesh.visible = false;
            impactGroup.add(mesh);
            impactPool.push(mesh);
        }
        impactMeshPoolRef.current = impactPool;

        const tracerGroup = new THREE.Group();
        scene.add(tracerGroup);
        const tracerPool: THREE.Line[] = [];
        const lineMat = new THREE.LineBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.5 });
        for (let i = 0; i < MAX_TRACERS; i++) {
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

            // Target Distance Position Check
            if (targetWallGroupRef.current) {
                const targetZ = -controller.state.targetDistance;
                if (Math.abs(targetWallGroupRef.current.position.z - targetZ) > 0.01) {
                    buildTargetBoard(targetWallGroupRef.current, controller.state.targetDistance);
                }
            }

            // Fetch Recoil & Camera States
            const view = controller.getPlayerViewSnapshot();
            const firearmPos = controller.getFirearmPositions();
            const isAiming = controller.state.aiming;

            // FOV Transition (Zoom in ADS)
            const targetFov = isAiming ? 48 : 75;
            camera.fov += (targetFov - camera.fov) * 0.15;
            camera.updateProjectionMatrix();

            // Camera Body & Head Recoil (Camera Rotation)
            const bodyRecoil = view.cameraBodyRecoilVec;
            const headRecoil = view.cameraHeadRecoilVec;

            camera.rotation.set(
                bodyRecoil.x + headRecoil.x,
                bodyRecoil.y + headRecoil.y,
                bodyRecoil.z + headRecoil.z,
                'YXZ'
            );

            // Viewmodel Recoil Position & Rotation (Relative to Camera)
            const rotRecoil = firearmPos.rotation;
            const transRecoil = firearmPos.translation;

            const targetPosX = isAiming ? 0 : 0.18;
            const targetPosY = isAiming ? -0.08 : -0.15;
            const targetPosZ = isAiming ? -0.32 : -0.42;

            weaponGroup.position.set(
                targetPosX + transRecoil.x,
                targetPosY + transRecoil.y,
                targetPosZ + transRecoil.z
            );

            weaponGroup.rotation.set(rotRecoil.x, rotRecoil.y, rotRecoil.z, 'YXZ');

            // Render Impact Dots (탄착점) & Tracers using pre-allocated object pools
            updateImpactsAndTracers(
                shots,
                selectedShotIndex,
                controller.state.targetDistance,
                showTracers,
                normalDotMat,
                latestDotMat,
                selectedDotMat
            );

            // Render Debug Vectors if enabled
            if (showDebugVectors) {
                updateDebugVectors(bodyRecoil, rotRecoil);
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
            normalDotMat.dispose();
            latestDotMat.dispose();
            selectedDotMat.dispose();
            lineMat.dispose();

            if (rendererRef.current && rendererRef.current.domElement) {
                rendererRef.current.domElement.remove();
                rendererRef.current.dispose();
            }
        };
    }, [controller, showDebugVectors, showTracers, selectedShotIndex]);

    // Build Target Board Mesh
    const buildTargetBoard = (group: THREE.Group, distance: number) => {
        group.clear();
        const targetZ = -distance;
        group.position.set(0, 0, targetZ);

        const boardSize = Math.max(10, distance * 0.35);
        const boardGeo = new THREE.PlaneGeometry(boardSize, boardSize);
        const boardMat = new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            roughness: 0.85,
            metalness: 0.2
        });
        const board = new THREE.Mesh(boardGeo, boardMat);
        board.position.set(0, 1.5, 0);
        board.receiveShadow = true;
        group.add(board);

        // Bullseye Rings
        const scaleFactor = distance / 50;
        const ringColors = [0xffffff, 0x000000, 0x00f2fe, 0xff0055, 0xffcc00];
        const ringRadii = [3.0 * scaleFactor, 2.25 * scaleFactor, 1.5 * scaleFactor, 0.75 * scaleFactor, 0.25 * scaleFactor];

        ringRadii.forEach((r, idx) => {
            const innerR = idx === ringRadii.length - 1 ? 0 : ringRadii[idx + 1];
            const ringGeo = new THREE.RingGeometry(innerR, r, 64);
            const ringMat = new THREE.MeshBasicMaterial({
                color: ringColors[idx],
                side: THREE.DoubleSide
            });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.position.set(0, 1.5, 0.05);
            group.add(ringMesh);
        });
    };

    // Build Simple FPS Viewmodel (Receiver, Barrel, Grip, Muzzle, Optic Sight)
    const buildLowPolyWeapon = (group: THREE.Group) => {
        group.clear();

        const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
        const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
        const polymerMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.1, roughness: 0.8 });
        const reticleLensMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe });

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

        // Optic Sight (RDS)
        const opticBase = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.1), metalMat);
        opticBase.position.set(0, 0.07, -0.05);
        group.add(opticBase);

        const opticLens = new THREE.Mesh(new THREE.RingGeometry(0.004, 0.015, 32), reticleLensMat);
        opticLens.position.set(0, 0.07, -0.1);
        group.add(opticLens);

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

    // Update Impact Dots (탄착점) & Tracers without allocations
    const updateImpactsAndTracers = (
        shots: readonly PhysicalShotSnapshot[],
        selectedIdx: number | null,
        targetDistance: number,
        enableTracers: boolean,
        normalMat: THREE.Material,
        latestMat: THREE.Material,
        selectedMat: THREE.Material
    ) => {
        const impactPool = impactMeshPoolRef.current;
        const tracerPool = tracerLinePoolRef.current;
        const targetZ = -targetDistance;
        const totalShots = shots.length;

        // Update Impact Dots
        for (let i = 0; i < MAX_IMPACT_DOTS; i++) {
            if (i < totalShots) {
                const shot = shots[i];
                const origin = shot.origin;
                const dir = shot.direction;

                const distToTarget = Math.abs((targetZ - origin.z) / (dir.z === 0 ? -1 : dir.z));
                const endPointX = origin.x + dir.x * distToTarget;
                const endPointY = origin.y + dir.y * distToTarget;

                const mesh = impactPool[i];
                mesh.position.set(endPointX, endPointY, targetZ + 0.02);

                const isSelected = selectedIdx === i;
                const isLatest = i === totalShots - 1;

                if (isSelected) {
                    mesh.material = selectedMat;
                    mesh.scale.set(1.5, 1.5, 1.5);
                } else if (isLatest) {
                    mesh.material = latestMat;
                    mesh.scale.set(1.2, 1.2, 1.2);
                } else {
                    mesh.material = normalMat;
                    mesh.scale.set(1.0, 1.0, 1.0);
                }
                mesh.visible = true;
            } else {
                impactPool[i].visible = false;
            }
        }

        // Update Tracers (Only if enabled)
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
                line.visible = true;
            } else {
                tracerPool[i].visible = false;
            }
        }
    };

    const updateDebugVectors = (bodyRecoil: Vector3, rotRecoil: Vector3) => {
        if (!debugGroupRef.current) return;
        const group = debugGroupRef.current;
        group.clear();

        const dirBody = new THREE.Vector3(bodyRecoil.x, bodyRecoil.y, bodyRecoil.z).multiplyScalar(40);
        const arrowBody = new THREE.ArrowHelper(dirBody.clone().normalize(), new THREE.Vector3(-0.4, 1.4, -2), dirBody.length(), 0xff0055);
        group.add(arrowBody);

        const dirRot = new THREE.Vector3(rotRecoil.x, rotRecoil.y, rotRecoil.z).multiplyScalar(40);
        const arrowRot = new THREE.ArrowHelper(dirRot.clone().normalize(), new THREE.Vector3(-0.2, 1.4, -2), dirRot.length(), 0x00f2fe);
        group.add(arrowRot);
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
            className="relative w-full h-full cursor-crosshair select-none bg-slate-950"
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
            {/* FPS Center Crosshair / Reticle */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                    className="w-4 h-4 border border-cyan-400/80 rounded-full transition-transform duration-75 flex items-center justify-center"
                    style={{
                        transform: `scale(${controller.state.aiming ? 0.5 : 1.2})`
                    }}
                >
                    <div className="w-1 h-1 bg-cyan-400 rounded-full" />
                </div>
            </div>

            {/* Subtle Guide Hint */}
            {isCanvasFocused && (
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 pointer-events-none text-[11px] font-mono text-slate-400/80 bg-slate-950/80 px-3 py-1 rounded-full border border-slate-800 shadow-md">
                    Left Click: Fire | Right Click: ADS Aim
                </div>
            )}
        </div>
    );
};
