# RecoilSim 프로젝트 진행 보고서 (PROGRESS_1.md)

**작성 일시**: 2026-09-28  
**프로젝트**: Phantom Forces Recoil Simulation Engine Core  
**테스트 상태**: 10개 테스트 수트, 79개 테스트 100% 통과 (PASS)

---

## 1. 개요 및 목적
Phantom Forces 무기 스탯 파싱, Stat Modifier 연산 엔진, 무기 컴파일러, 스프링 물리 엔진(Spring / Vector3Spring), 다중 반동 스프링 제어기(RecoilSprings), 총기 발사 반동 통합 연동(FirearmObject Recoil Integration), 그리고 카메라 반동 시스템(MainCameraObject Recoil System)의 원본 Lua 재현 및 TypeScript 구현 경과를 기록합니다.

---

## 2. 모듈별 구현 및 검증 내역

### Phase 1: Raw Data & WeaponsParser
- **416개 무기 Raw Data 파싱**: `weapons.json` 및 PFX API로 확보된 무기 데이터 파싱.
- **Normalized Weapon 데이터 구축**: 기본 스탯, attachment, modifier 데이터 수집 및 구조화.
- **파서 검증**: `WeaponsParser.test.ts` (416개 무기 무손실 정형화 검증 통과).

### Phase 2: Stat Modifier Engine (`ModifierEngine.ts`)
- **PF Lua 9단계 Modifier 연산 구현**:
  1. `setters`
  2. `adders`
  3. `tableInserters`
  4. `tableRemovers`
  5. `relativeMultipliers`
  6. `trueMultipliers`
  7. `tableRelativeMultipliers`
  8. `tableTrueMultipliers`
  9. `functionMods`
- **충돌 및 정렬 규칙 구현**:
  - `setters` priority collision 정렬 (Lua stable sort)
  - `tableInserters` priority / absolutePriority 및 insertIndex 정렬
  - PF Lua 1-based index 및 음수 인덱스 지원
- **독립 Reference 검증**:
  - `scripts/generate_independent_reference.js` $\rightarrow$ `data/reference/c25_independent_reference.json`
  - C25 + R2 Suppressor + Compensator + Handstop 조합 독립 reference 트레이스 검증 완료 (`ModifierEngine.test.ts`).

### Phase 3: Weapon Compiler (`WeaponCompiler.ts`)
- **`ContentUtils.compileWeaponData` 재현**:
  - Base 무기 데이터 비파괴(Immutability) 보존
  - 장착 Attachment 목록에 따른 modifier 통합 연산
  - `WeaponCompiler.test.ts` 검증 완료.

### Phase 4: Physics Core (`Spring.ts` & `Vector3Spring.ts`)
- **2차 감쇠 하모닉 진동자(Damped Harmonic Oscillator) 미분방정식 감사**:
  - PF 원본 `getPV` / `getPV3` 수식과 표준 2차 미분방정식 해 대조 검증.
  - $d$ = 감쇠비 $\zeta$ (Damping Ratio)
  - $s$ = 고유진동수 $\omega_n$ (Natural Frequency, rad/s)
- **3개 감쇠 영역 검증**:
  - 미달 감쇠 ($d^2 < 1$, Underdamped)
  - 임계 감쇠 ($d^2 = 1$, Critically Damped)
  - 과감쇠 ($d^2 > 1$, Overdamped)
- **독립 Reference 검증**: `generate_spring_reference.js` $\rightarrow$ `spring_independent_reference.json` 기반 `Spring.test.ts` 검증 완료.

### Phase 5: Multi-layer Recoil Springs (`RecoilSprings.ts`)
- **`RecoilSprings.lua` 재현**:
  - 레이어별 `Vector3Spring` 동적 매핑 및 $d, s$ 축별 분할 적용
  - `applyImpulse`: 조준 상태 동기화, 균일 분포 충격량 난수 생성, CFrame 좌표 변환 및 $v$ 가산
  - `setAim`: hip $\leftrightarrow$ aim 조준 상태 전환 및 연속성(Continuous state transition) 보존
  - `step`: recovery delay 감지 및 recovery 파라미터 전환
- **독립 Reference 검증**:
  - `generate_recoilsprings_reference.js` $\rightarrow$ `recoilsprings_independent_reference.json`
  - `RecoilSprings.test.ts` 9개 검증 시나리오 통과.

### Phase 6: FirearmObject Recoil Integration (`FirearmObjectRecoil.ts`)
- **`FirearmObject_Recoil.lua` 반동 연동 구현**:
  - `translationSprings` & `rotationSprings` 독립 인스턴스 생성 및 조준 상태(`setAim`) 전동
  - `fire(currentTime)`: `recoildelay` 획득 및 발사 시각 `currentTime + recoildelay` 계산, `translationSprings.applyImpulse` / `rotationSprings.applyImpulse` 가산
  - Multiplier 분리 검증: 무기 모델 반동(`translation`, `rotation`)에는 `weightrecoilmult`만 적용되며, 스탠스/디바이스/연사안정성은 카메라 반동 계수(`computeCameraRecoilMultiplier()`)에만 영향.
  - Stance Stability: `stand` (0.0), `crouch` (0.25), `prone` (0.50)
  - Device Multiplier: `mouse` (1.0), `touch` (0.6), `controller` (0.8)
- **독립 Reference 검증**:
  - `generate_firearm_recoil_reference.js` $\rightarrow$ `firearm_recoil_independent_reference.json`
  - `FirearmObjectRecoil.test.ts` 8개 시나리오 및 풀 파이프라인 검증 통과.

### Phase 7: Camera Recoil System (`MainCameraObjectRecoil.ts`)
- **`MainCameraObject.Lua` CFrame 계층 구현**:
  - `_cameraBodySprings` (`cambody`)와 `_cameraHeadSprings` (`camhead`) 독립 파라미터 관리
  - 계층적 CFrame 곱셈 수식 재현:
    $$v186 = v185 \times \text{fromAxisAngle}(\text{cambody.getP}())$$
    $$\text{\_shakeCFrame} = v186 + \text{positionOffset} \quad (\text{Viewmodel Reference Frame})$$
    $$v187 = v186 \times \text{fromAxisAngle}(\text{camhead.getP}()) + \text{positionOffset} \quad (\text{Final Camera Frame})$$
  - 계층 분리 검증: `_shakeCFrame`에는 Body Recoil만 반영되어 총기 모델이 카메라와 함께 흔들리며, Head Recoil은 최종 `Camera.CFrame`에만 독립 적용되어 시선 이탈 재현.
- **독립 Reference 검증**:
  - `generate_camera_recoil_reference.js` $\rightarrow$ `camera_recoil_independent_reference.json`
  - `MainCameraObjectRecoil.test.ts` 10개 시나리오 검증 통과.

### Phase 8: Deterministic Simulation Engine Core (`SimulationEngine.ts`)
- **`simulation_loop_spec_vfinal.md` 100% 준수**:
  - `SeededPRNG.ts`: Mulberry32 기반 32비트 결정론 난수 생성기.
  - `SimulationTypes.ts`: `SimEvent`, `PhysicalShotSnapshot`, `PlayerViewSnapshot`, `SimulationState` 타입 정의.
  - `SimulationEngine.ts`: Event Queue 기반 Virtual-Time 시뮬레이션 루프 엔진.
- **주요 파이프라인 검증 완료**:
  1. `FIRE_INPUT` 시점 `aimProgressAtFire` 캡처.
  2. `RECOIL_IMPULSE` 시점 Stance/Device/Weight/Camera Multipliers 동적 계산.
  3. `nextShotTime` persistent firearm cooldown state 유지 및 `canFire()` 쿨다운 검증.
  4. CameraHead는 Physical Shot ($v474$, Origin, Direction) 연산에서 100% 제외 (Player View $v187$에만 적용).
  5. CameraBody는 Physical Shot ($v474$, Origin, Direction) 및 $v186$ / `_shakeCFrame`에 100% 포함.
  6. 렌더링 dt(60 FPS, 1000 FPS)에 독립적인 Virtual-Time 시간 진행 및 100% 재현성 검증.
- **테스트 완료**: `tests/SimulationEngine.test.ts` (10개 시나리오 100% 통과).

### Phase 9: C25 Golden Simulation Validation (`C25GoldenSimulation.test.ts`)
- **실제 C25 원본 및 컴파일 데이터 연동 검증**:
  - `data/C25.json` 및 `WeaponCompiler` 컴파일 데이터 100% 바인딩.
  - C25 aimRotation (`[-0.7, 0.2]`, `[-0.25, 0.36]`, `[0.1, 0.5]`), aimTranslation (`[0, 0.1]`, `[-0.5, 0.2]`, `[7.1, 0.7]`), hipTranslation, aimCameraBody (`[1.92, 0.45]`, `[0.1, 0.02]`), Recovery delay/speeds (`delay = 0.1`), 800 RPM (0.075s interval) 정확성 확인.
- **Golden Test 실행 결과**:
  1. Single-shot (1발): $t_{\text{fire}}=0.3\text{s}$, aimProgress $> 0.95$, $v474$, Origin, Direction 정상 발출.
  2. 3-shot burst (3발): $t = 0.300, 0.375, 0.450\text{s}$, 발사 진행에 따른 rotationRecoil/bodyRecoil 누적 검증.
  3. Automatic 10-shot sequence (10발): 800 RPM 10발 연속 발사 후 사격 중단 시 spring state 회복(Recovery) 검증.
  4. CameraHead 0% 영향 및 CameraBody 100% 반영 검증.
  5. Seeded Reproducibility (동일 seed 10발 궤적 100% 일치) 검증.
- **테스트 완료**: `tests/C25GoldenSimulation.test.ts` (6개 시나리오 100% 통과).

### Phase 10: Zero-Variance Cross-Validation Harness (`PFRuntimeComparator.ts` & `PFCaptureHarness.lua`)
- **Roblox Studio Luau Capture Harness (`scripts/PFCaptureHarness.lua`)**:
  - Roblox Studio Playtest 중 C25 `impulseVariance`를 0으로 고정(Phase A Zero-Variance Mode)하고, 고주파 프레임 샘플(`springs`, `cframes`, `state`) 및 발사 스냅샷(`shots`, `v474`, `origin`, `direction`)을 JSON으로 캡처/직렬화.
- **RecoilSim Automated Comparator Engine (`PFRuntimeComparator.ts`)**:
  - `PFTelemetryTypes.ts`: Fixture Schema 타입 정의.
  - `PFRuntimeComparator`: Telemetry Fixture 데이터 기반 `SimulationEngine` 자동 정밀 검증.
  - 5계층 진단 트리 (`TIMING` $\to$ `IMPULSE_MULT` $\to$ `SPRING_ODE` $\to$ `CFRAME_CHAIN` $\to$ `SPREAD`) 구현으로 불일치 지점 자동 산출.
- **테스트 완료**: `tests/PFRuntimeComparator.test.ts` (Phase A Clean Fixture 검증 및 Layer 3~5 Fault Injection 자동 진단 통과).

---

## 3. 전체 테스트 통과 결과 (Test Suite Summary)

```
PASS tests/RecoilSprings.test.ts
PASS tests/Spring.test.ts
PASS tests/MainCameraObjectRecoil.test.ts
PASS tests/SimulationEngine.test.ts
PASS tests/ModifierEngine.test.ts
PASS tests/FirearmObjectRecoil.test.ts
PASS tests/WeaponCompiler.test.ts
PASS tests/PFRuntimeComparator.test.ts
PASS tests/C25GoldenSimulation.test.ts
PASS tests/WeaponsParser.test.ts

Test Suites: 10 passed, 10 total
Tests:       79 passed, 79 total
Time:        17.162 s
```

---

## 4. 소스 코드 및 레퍼런스 구성

| 구분 | 파일 경로 | 설명 |
| :--- | :--- | :--- |
| **Data Parser** | [WeaponsParser.ts](file:///c:/Users/choez/OneDrive/바탕 화면/RecoilSim/src/core/parser/WeaponsParser.ts) | Raw Weapon/Attachment 데이터 정형화 |
| **Modifier Engine** | [ModifierEngine.ts](file:///c:/Users/choez/OneDrive/바탕 화면/RecoilSim/src/core/modifier/ModifierEngine.ts) | 9단계 Modifier 적용 엔진 |
| **Weapon Compiler** | [WeaponCompiler.ts](file:///c:/Users/choez/OneDrive/바탕 화면/RecoilSim/src/core/compiler/WeaponCompiler.ts) | 무기 + Attachment 최종 스탯 컴파일러 |
| **Spring Physics** | [Spring.ts](file:///c:/Users/choez/OneDrive/바탕 화면/RecoilSim/src/core/math/Spring.ts) | 1D Analytical ODE 2차 감쇠 해 |
| **Vector3 Spring** | [Vector3Spring.ts](file:///c:/Users/choez/OneDrive/바탕 화면/RecoilSim/src/core/math/Vector3Spring.ts) | 3D Vector3 감쇠 스프링 |
| **CFrame Math** | [CFrame.ts](file:///c:/Users/choez/OneDrive/바탕 화면/RecoilSim/src/core/math/CFrame.ts) | 3x3 변환 행렬 및 좌표계 연산 |
| **Recoil Springs** | [RecoilSprings.ts](file:///c:/Users/choez/OneDrive/바탕 화면/RecoilSim/src/core/recoil/RecoilSprings.ts) | 다중 반동 스프링 제어 엔진 |
| **Firearm Recoil Integration** | [FirearmObjectRecoil.ts](file:///c:/Users/choez/OneDrive/바탕 화면/RecoilSim/src/core/recoil/FirearmObjectRecoil.ts) | 총기 발사 반동 통합 엔진 |
| **Camera Recoil System** | [MainCameraObjectRecoil.ts](file:///c:/Users/choez/OneDrive/바탕 화면/RecoilSim/src/core/recoil/MainCameraObjectRecoil.ts) | 카메라 계층적 CFrame 반동 엔진 |
| **Reference Generators** | `scripts/generate_*_reference.js` | Lua 알고리즘 기반 독립 Reference 생성기 |
| **Reference Data** | `data/reference/*.json` | 독립 Reference 트레이스 JSON |

---

## 5. 향후 과제 (Next Steps)

1. **Recoil Trajectory / Pattern Simulator**: 시간에 따른 2D/3D 반동 궤적 탄착군 시뮬레이션 및 데이터 시각화.
2. **Interactive UI**: Web/App 기반 무기 및 부품 선택 시 반동 패턴 비교 인터페이스 구축.
