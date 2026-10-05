# Tech Direction

## 1. 기본 방향

이 프로젝트는 **Phantom Forces의 실제 recoil system을 재현하는 시뮬레이션 엔진**과
이를 시각화하는 **Web UI**를 분리하여 개발한다.

핵심 원칙:

- Simulation Core는 UI와 독립적으로 동작해야 한다.
- Phantom Forces의 Lua 구현을 가능한 한 그대로 TypeScript로 이식한다.
- 수치 계산의 정확성을 최우선으로 한다.
- UI는 Simulation Core의 결과를 표시하고 입력을 전달하는 역할만 담당한다.
- 향후 Monte Carlo simulation 및 attachment optimization을 추가할 수 있도록 확장 가능한 구조를 사용한다.

---

## 2. Tech Stack

### Language

**TypeScript**

선정 이유:

- Lua로 작성된 Phantom Forces 코드를 비교적 직접적으로 이식하기 좋음
- Vector3, CFrame, Spring 등의 구조를 class/type으로 명확하게 표현 가능
- 정적 타입을 이용해 복잡한 WeaponData와 modifier path의 오류를 줄일 수 있음
- 브라우저에서 그대로 실행 가능
- 추후 Node.js 기반 테스트/시뮬레이션에도 동일한 코드 사용 가능

---

### Runtime / Package Manager

**Node.js + pnpm**

- Node.js: 개발 및 테스트 런타임
- pnpm: 의존성 및 workspace 관리

가능하면 Simulation Core는 브라우저 전용 API에 의존하지 않는다.

---

### Frontend

**React + Vite**

- React: UI 구성
- Vite: 개발 서버 및 production build

UI는 Simulation Core와 분리한다.

```text
UI
 ↓
Simulation API
 ↓
Simulation Core
```

React component에서 직접 recoil 계산을 수행하지 않는다.

---

### 3D Rendering

**Three.js**

용도:

- 카메라 방향 시각화
- recoil trajectory 표시
- shot별 trajectory 표시
- attachment 변경에 따른 trajectory 비교
- 3D 공간에서의 recoil pattern 표시

Three.js는 visualization layer이며,
recoil 계산 자체는 Three.js에 의존하지 않는다.

---

### Testing

**Vitest**

단위 테스트를 중심으로 구성한다.

우선 테스트해야 할 영역:

- Modifier Engine
- WeaponData compilation
- Spring
- Vector3Spring
- RecoilSpring
- Shot timing
- Trajectory calculation
- Monte Carlo metrics

특히 Phantom Forces의 Lua 결과와 비교할 수 있는
**golden/reference test**를 적극적으로 사용한다.

---

### Data

초기에는 기존 Phantom Forces dump에서 추출한 JSON을 그대로 사용한다.

```text
data/
├─ weapons/
│  └─ C25.json
└─ attachments/
   └─ attachments.json
```

데이터를 코드에 하드코딩하지 않는다.

WeaponData와 AttachmentData의 schema를 TypeScript type으로 정의한다.

---

## 3. Architecture

전체 구조:

```text
┌─────────────────────────────────────┐
│              Web UI                 │
│         React + Three.js             │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│          Simulation API             │
│  weapon / attachment / simulation   │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│         Simulation Core             │
│                                     │
│  Data Loader                        │
│  Modifier Engine                    │
│  Weapon Compiler                    │
│  Spring System                      │
│  Recoil System                      │
│  Shot Simulation                    │
│  Trajectory                         │
│  Monte Carlo                        │
└─────────────────────────────────────┘
```

---

## 4. Source Code Structure

```text
src/
├─ core/
│  ├─ data/
│  │  ├─ WeaponData.ts
│  │  ├─ AttachmentData.ts
│  │  └─ schemas/
│  │
│  ├─ modifier/
│  │  ├─ ModifierEngine.ts
│  │  ├─ ModifierPath.ts
│  │  └─ SetterResolver.ts
│  │
│  ├─ weapon/
│  │  ├─ WeaponCompiler.ts
│  │  └─ Weapon.ts
│  │
│  ├─ math/
│  │  ├─ Vector3.ts
│  │  ├─ CFrame.ts
│  │  └─ Spring.ts
│  │
│  ├─ recoil/
│  │  ├─ Vector3Spring.ts
│  │  └─ RecoilSpring.ts
│  │
│  ├─ simulation/
│  │  ├─ ShotSimulator.ts
│  │  ├─ ShotTiming.ts
│  │  └─ Trajectory.ts
│  │
│  └─ montecarlo/
│     ├─ MonteCarloSimulator.ts
│     └─ Metrics.ts
│
├─ data/
│  ├─ weapons/
│  └─ attachments/
│
├─ ui/
│  ├─ components/
│  ├─ pages/
│  └─ viewer/
│
└─ app/
   └─ main.tsx
```

---

## 5. Core / UI Dependency Rule

다음 방향의 dependency만 허용한다.

```text
UI
 ↓
Simulation Core
 ↓
Data / Math
```

반대로 Core에서 React나 Three.js를 import하지 않는다.

예:

```ts
// 허용
UI → RecoilSimulator

// 금지
RecoilSimulator → React
RecoilSimulator → Three.js
```

이 구조를 유지하면 향후 다음과 같은 사용이 가능하다.

```text
Web UI
    ↓
Simulation Core

CLI
    ↓
Simulation Core

Automated Tests
    ↓
Simulation Core

Monte Carlo Worker
    ↓
Simulation Core
```

---

## 6. Math Representation

Phantom Forces의 Lua 구현을 가능한 한 직접적으로 대응시킨다.

예:

```text
Lua Vector3
    ↓
TypeScript Vector3

Lua CFrame
    ↓
TypeScript CFrame

Vector3Spring
    ↓
TypeScript Vector3Spring

RecoilSpring
    ↓
TypeScript RecoilSpring
```

Spring은 단순한 FPS recoil 공식으로 대체하지 않는다.

Phantom Forces의 analytic spring behavior를 재현하는 것을 우선한다.

---

## 7. Simulation Determinism

Monte Carlo simulation과 debugging을 위해 random number generator를 injectable하게 만든다.

```ts
interface RandomSource {
    next(): number;
}
```

Production에서는 일반 random source를 사용할 수 있지만,
테스트에서는 seeded random source를 사용한다.

이를 통해:

```text
같은 weapon
+ 같은 attachment
+ 같은 seed
+ 같은 simulation settings
= 같은 결과
```

를 보장할 수 있도록 한다.

---

## 8. Performance Direction

초기 MVP에서는 일반적인 JavaScript/TypeScript 실행으로 충분한 성능을 목표로 한다.

성능 문제가 실제로 확인된 경우에만 다음을 고려한다.

1. Web Worker
2. TypedArray
3. simulation batching
4. WASM

처음부터 WASM이나 GPU simulation을 도입하지 않는다.

특히 Monte Carlo는 먼저 정확한 CPU 구현을 완성한 뒤 최적화한다.

---

## 9. Development Priority

기술 구현 순서는 다음과 같다.

```text
TypeScript project
      ↓
Data schema
      ↓
Modifier Engine
      ↓
Weapon Compiler
      ↓
Spring
      ↓
Vector3Spring
      ↓
RecoilSpring
      ↓
Shot Simulation
      ↓
Trajectory
      ↓
Monte Carlo
      ↓
Three.js Visualization
      ↓
React UI polish
```

UI를 먼저 만들지 않는다.

Simulation Core가 독립적으로 테스트되고
실제 Phantom Forces 결과와 비교 가능한 상태가 된 이후 UI를 붙인다.

---

## 10. MVP에서 사용하지 않는 것

초기 구현에서는 다음을 사용하지 않는다.

- Backend server
- Database
- Authentication
- Cloud simulation
- WASM
- GPU compute
- 복잡한 state management library
- 불필요한 UI framework

이 프로젝트의 핵심 계산은 로컬에서 수행한다.

필요성이 확인된 경우에만 추가한다.
