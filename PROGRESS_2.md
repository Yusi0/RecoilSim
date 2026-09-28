# RecoilSim 프로젝트 진행 보고서 (PROGRESS_2.md)

**작성 일시**: 2026-09-28  
**프로젝트**: RecoilSim 3D Interactive Simulator MVP & Simulation Core Verification  
**테스트 상태**: 10개 Jest 테스트 스위트 / 79개 테스트 100% 통과 (PASS)  
**빌드 상태**: TypeScript `tsc --noEmit` PASS / Vite Production Build PASS (`dist/`)

---

## 1. 개요 및 전환 배경

검증 단계(Python 수치 검증 프로토타입, PF 원본 Lua 크로스 대조, Golden Simulation)를 성공적으로 완료하고, **RecoilSim 3D 시뮬레이터 웹 애플리케이션 MVP 구현**에 착수하여 성공적으로 완료했습니다.

기존에 완전 검증된 `SimulationEngine` 물리 코어를 100% 보존하면서, 사용자 및 연구자가 실제 Phantom Forces C25 총기 발사 반동을 3차원으로 시각화하고 실시간 Telemetry 및 탄도(Shot Trajectory)를 관측할 수 있는 웹 기반 3D 시뮬레이터를 구축했습니다.

---

## 2. 수치 검증 및 소스 대조 완료 내역

### 1) Python 수치 검증 프로토타입 대조
- `scratch/c25_prototype.py`를 구축하여 C25의 연속 발사 수치 시뮬레이션 수행.
- **Camera Body Recoil ADS 감쇄 수식 보정**:
  - PF 원본 `FirearmObject_Recoil.lua` 대조 결과: $n2 = (1 - aimProgress) \times \text{camerarecoilmult}$
  - ADS 진입률($aimProgress$)이 1에 가까워질수록 카메라 몸체/머리 반동이 감소하는 PF 원본 동작을 `FirearmObjectRecoil.ts`에 반영 및 동기화 완료.

### 2) PF 원본 런타임 이벤트 연동 검증
- `RenderSteppedUpdater`, `PreAnimationUpdater`, `HeartbeatUpdater`, `FixedTimeStepper` 호출 순서 대조.
- `fireRound()` $\rightarrow$ `impulseSprings()` $\rightarrow$ `RecoilSprings:step()` $\rightarrow$ `Shot Generation` $\rightarrow$ `MainCamera update` 순서가 `SimulationEngine` 가상시간 이벤트 루프와 1:1 일치함을 최종 확인.

---

## 3. RecoilSim 3D 시뮬레이터 시스템 구조

```text
React UI Layer (ControlPanel, TimeControls, Telemetry, History)
     │
     ▼
Simulator Controller / Adapter (`src/app/SimulatorController.ts`)
     │
     ▼
SimulationEngine Core (`src/core/sim/SimulationEngine.ts`)
  ├── RecoilSprings (Translation / Rotation Springs)
  ├── FirearmObjectRecoil
  └── MainCameraObjectRecoil
     │
     ▼ (Visual Data Rendering Only)
Three.js 3D Viewport (`src/app/FPSCanvas.tsx`)
  ├── FPS Camera & Weapon Mesh
  ├── Dynamic Reticle (Spread & Recoil-reactive)
  ├── Physical Shot Trajectory Lines
  └── Target Board Impact Points (Z = -50m)
```

### 가상시간(Virtual Time) 및 렌더링 분리 원칙
- **Physics Core**: 반동 연산, 탄도 생성, 스프링 상태 갱신은 반드시 `SimulationEngine`의 가상시간(Virtual Timestamp)을 엄격히 사용.
- **Rendering**: `requestAnimationFrame` 및 Three.js 렌더링 루프는 읽기 전용 시각화 용도로만 동작하여 프레임 레이트 변동에 상관없이 100% 결정론적(Deterministic) 물리 시뮬레이션 보장.

---

## 4. 신규 구현 기능 상세

| 카테고리 | 구현 기능 및 설명 |
| :--- | :--- |
| **Weapon Pipeline** | `WeaponsParser` 및 `WeaponCompiler` 파이프라인으로 `data/weapons/c25.json` 로드. UI 하드코딩 금지 준수. |
| **Settings** | 조준 모드(Hip / ADS), 자세(Stand / Crouch / Prone), 입력 장치(Mouse / Touch / Controller), 리셋. |
| **Firing System** | 단발(Single) 및 연사(Full Auto) 지원. C25 실제 firerate(700 RPM, 0.0857초 쿨다운) 적용. |
| **3D Visualizer** | Three.js 기반 FPS 시점, 조준선(Reticle), 총기 Placeholder, 발사 탄도 Ray/Line, $50\text{m}$ 표적지 탄착군(Hit Dots). |
| **Recoil Telemetry** | Camera Body Recoil, Camera Head Recoil, Weapon Rotation, Weapon Translation 실시간 스프링 벡터 $(p, v)$ 디버그 게이지. |
| **Time Controls** | 재생(Play), 일시정지(Pause), 리셋(Reset), 가상시간 배속 조절(0.1x ~ 2.0x), 가상시간 타임스탬프 표시. |
| **Shot History** | 발사 목록(인덱스, 가상시간, 발사 방향, 반동 크기) 표시 및 클릭 시 해당 탄도 하이라이트 기능. |

---

## 5. 추가 및 수정된 파일 목록

- `package.json`: Vite, React, Three.js, Lucide-React dependencies 및 build/dev script 추가
- `vite.config.ts`: React 플러그인 빌드 설정
- `tsconfig.json`: React JSX 및 JSON import 설정
- `index.html`: Google Fonts 및 웹 앱 진입점
- `src/index.css`: Vanilla CSS 기반 반응형 디자이너 디자인 시스템
- `src/app/c25DataLoader.ts`: C25 파이프라인 동적 파싱 로더
- `src/app/SimulatorController.ts`: React UI와 물리 시뮬레이터 연결 어댑터
- `src/app/FPSCanvas.tsx`: Three.js 3D Canvas Visualizer
- `src/app/components/Header.tsx`: 무기 메타데이터 헤더
- `src/app/components/ControlPanel.tsx`: 사격/조준/자세 컨트롤 패널
- `src/app/components/TimeControls.tsx`: 가상시간 제어 패널
- `src/app/components/ShotHistoryPanel.tsx`: 탄환 히스토리 패널
- `src/app/components/RecoilTelemetryPanel.tsx`: 실시간 반동 물리 벡터 게이지
- `src/app/App.tsx` & `src/main.tsx`: 메인 시뮬레이터 쉘 레이아웃
- `src/core/parser/WeaponsParser.ts`: 브라우저 번들 호환 해시 처리
- `src/core/data/AttachmentData.ts` & `src/core/sim/SimulationTypes.ts`: Vite ESModule build 호환 `import type` 수정

---

## 6. 빌드 및 테스트 검증 결과

### 1) Jest 단위 테스트 수트 (`npm test`)
- **결과**: `10 Test Suites passed`, `79 Tests passed`
- **검증 내용**: Spring, Vector3Spring, RecoilSprings, FirearmObject, MainCameraObject, SimulationEngine, ModifierEngine, WeaponCompiler, WeaponsParser, C25 Golden Simulation 전체 통과.

### 2) 프로덕션 빌드 (`npm run build`)
- **결과**: TypeScript `tsc --noEmit` 에러 0건, Vite Client Bundle 빌드 성공 (`dist/index.html`, `dist/assets/index-DX8aatIc.js`).

---

## 7. 향후 확장 과제 (Roadmap)

1. **Attachment UI 및 반동 변산 비교기**: 부품 장착/탈착 시 실시간 반동 궤적 3D 비교 기능.
2. **전체 무기(416종) 드롭다운 연동**: C25 외 타 총기 프리셋 선택 지원.
3. **2D 탄착군 분포(Spread Pattern) 캔버스 그래프**: 2D 히트맵 분석 도구 연동.
