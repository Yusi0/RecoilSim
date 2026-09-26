# Tech Direction

## 1. Project Goal

이 프로젝트는 **Phantom Forces의 실제 무기 데이터와 recoil system을 재현하는 시뮬레이션 엔진**과 이를 시각화하는 Web UI를 개발하는 것을 목표로 한다.

핵심 목표는 다음과 같다.

- Phantom Forces의 실제 WeaponData 및 AttachmentData를 사용한다.
- Phantom Forces의 modifier compilation 동작을 재현한다.
- Phantom Forces의 Spring / Vector3Spring / RecoilSprings 동작을 재현한다.
- 무기 recoil과 camera recoil을 구분하여 시뮬레이션한다.
- 실제 PF 데이터와 역공학 결과를 기반으로 수치적으로 검증 가능한 결과를 만든다.
- 동일한 입력과 random seed에서 동일한 simulation 결과를 얻을 수 있도록 한다.
- 향후 attachment 비교, recoil trajectory 분석, Monte Carlo simulation을 지원한다.

목표는 원본 Lua 코드를 문자 그대로 복제하는 것이 아니라,

> **Phantom Forces에서 실제로 발생하는 동작과 수치 결과를 재현하는 것**

이다.

원본 Lua의 모듈 구조와 명칭은 가능한 경우 대응시키지만, TypeScript 구현은 테스트 가능성, 명확한 책임 분리, 유지보수성을 우선한다.


---

## 2. Core Principles

### 2.1 Simulation Core와 UI를 분리한다

Simulation Core는 React나 Three.js에 의존하지 않는다.

```text
UI
 ↓
Simulation API
 ↓
Simulation Core
```

Core는 다음 환경에서 독립적으로 사용할 수 있어야 한다.

```text
Web UI
CLI
Automated Tests
Monte Carlo Worker
```

---

### 2.2 실제 PF 동작을 우선한다

구현 편의성을 위해 일반적인 FPS recoil 공식을 임의로 적용하지 않는다.

특히 다음은 실제 Phantom Forces 구현을 기준으로 재현한다.

- Modifier compilation
- WeaponData compilation
- Spring
- Vector3Spring
- RecoilSprings
- recoil impulse
- recovery parameter switching
- camera recoil
- weapon translation recoil
- weapon rotation recoil
- stance multiplier
- firemode stability
- input device camera recoil multiplier
- CFrame rotation composition

확인되지 않은 동작은 임의로 구현하지 않는다.

---

### 2.3 역공학 결과와 추측을 구분한다

프로젝트 문서와 구현에서는 다음을 구분한다.

```text
Confirmed
  실제 PF source / data를 통해 확인된 동작

Inferred
  여러 source를 바탕으로 추론한 동작

Unknown
  아직 확인되지 않은 동작
```

Unknown인 부분을 임의의 공식이나 시스템으로 채우지 않는다.


---

## 3. Technology Stack

### Language

**TypeScript**

이유:

- Lua 코드를 구조적으로 대응시키기 쉽다.
- Vector3, CFrame, Spring 등의 자료구조를 명확하게 표현할 수 있다.
- 복잡한 WeaponData와 modifier path에 대한 정적 타입 검사가 가능하다.
- 브라우저에서 직접 실행할 수 있다.
- Node.js 기반 테스트 및 simulation에서도 동일한 Core를 사용할 수 있다.

---

### Runtime / Package Manager

**Node.js + pnpm**

Node.js:

- 개발 및 테스트 runtime
- CLI / batch simulation

pnpm:

- package management
- workspace management

Simulation Core는 가능한 한 browser-specific API에 의존하지 않는다.


---

### Frontend

**React + Vite**

React:

- UI 구성

Vite:

- development server
- production build

React component에서 직접 recoil 계산을 수행하지 않는다.

---

### 3D Rendering

**Three.js**

용도:

- camera 방향 시각화
- recoil trajectory 표시
- shot별 trajectory 표시
- attachment별 trajectory 비교
- 3D recoil pattern 표시

Three.js는 visualization layer이다.

Recoil 계산과 simulation은 Three.js에 의존하지 않는다.


---

### Testing

**Vitest**

다음 영역을 우선적으로 테스트한다.

- Modifier Engine
- WeaponData compilation
- Spring
- Vector3Spring
- RecoilSprings
- recoil impulse
- recovery
- shot timing
- trajectory
- camera recoil
- weapon recoil
- Monte Carlo metrics

실제 PF 데이터 및 역공학 결과를 이용한 golden/reference test를 적극적으로 사용한다.


---

## 4. Data Pipeline

현재 프로젝트는 Phantom Forces의 실제 API/dump data를 기반으로 한다.

전체 데이터 흐름은 다음과 같다.

```text
Phantom Forces Data
        │
        ▼
     Raw Data
        │
        ▼
      Parser
        │
        ▼
   Normalized Data
        │
        ▼
   Modifier Engine
        │
        ▼
 Compiled WeaponData
        │
        ▼
     Simulation
```

---

## 5. Raw Data

Raw data는 가능한 한 원본 데이터의 구조를 보존한다.

현재 주요 데이터는 다음과 같다.

```text
data/
├─ raw/
│  ├─ weapons.json
│  └─ weapon-details/
│     ├─ C25.json
│     ├─ ...
│
└─ normalized/
   ├─ weapons.json
   └─ attachments.json
```

### Weapon Meta

`data/raw/weapons.json`

Phantom Forces weapon meta API에서 수집한 weapon 목록이다.

현재 416개의 weapon entry를 대상으로 한다.

---

### Weapon Detail

`data/raw/weapon-details/`

각 weapon의 상세 데이터를 저장한다.

Weapon detail에는 다음과 같은 정보가 포함될 수 있다.

- baseWeaponData
- baseAttachmentSet
- recoil parameters
- animations
- firemode
- fire rate
- attachment slots
- 기타 weapon-specific data

Weapon detail의 실제 `name`과 meta의 이름이 항상 동일하다고 가정하지 않는다.

예:

```text
Meta:
E GUN

Detail:
E SHOTGUN
```

따라서 meta identity와 detail identity를 구분하여 처리한다.


---

### Attachment Data

Attachment data는 generic attachment modifier와 weapon-specific attachment modifier를 포함한다.

하나의 attachment 이름만으로 variant를 식별할 수 있다고 가정하지 않는다.

Attachment variant는 modifier content를 기반으로 구분할 수 있도록 한다.


---

## 6. Parser / Normalizer

Parser의 책임은 Raw Data를 Simulation Core에서 사용하기 적합한 normalized schema로 변환하는 것이다.

```text
Raw API / Dump
      ↓
Parser
      ↓
Normalized Data
```

Parser는 simulation logic을 수행하지 않는다.

예를 들어 recoil을 계산하거나 modifier를 적용하지 않는다.

그 역할은 이후 Modifier Engine과 Weapon Compiler가 담당한다.


---

## 7. Normalized Data

### Weapon

개념적인 구조:

```text
NormalizedWeapon
├─ id
├─ name
├─ displayName
├─ category
├─ stats
└─ attachmentSlots
```

---

### Attachment

개념적인 구조:

```text
NormalizedAttachment
├─ id
├─ name
├─ displayName
├─ slot
├─ info
├─ unlockKills
├─ isCommon
├─ variantHash
├─ compatibleWeaponIds
└─ modifiers
```

Modifier는 다음과 같은 정보를 표현할 수 있다.

```text
Modifier
├─ type
├─ indexPath
├─ value
├─ priority
├─ insertIndex
└─ extra
```

Normalized schema는 Raw Data의 표현을 보존하면서 Simulation Core가 사용할 수 있는 공통 형태를 제공한다.


---

# 8. Weapon Compilation Architecture

Phantom Forces의 weapon data는 단순히 base weapon + attachment를 더하는 구조가 아니다.

실제 compilation 흐름은 개념적으로 다음과 같다.

```text
Base WeaponData
       │
       ├───────────────┐
       │               │
       ▼               ▼
Generic Attachment   Weapon-specific
Modifiers             Attachment Modifiers
       │               │
       └───────┬───────┘
               ▼
        Modifier Engine
               │
               ▼
       Compiled WeaponData
               │
               ▼
       PF-specific postprocess
```

주요 compilation entry point:

```text
SharedModules.ContentUtils
└─ compileWeaponData
```

Modifier compilation entry point:

```text
SharedModules.StatModifierInterface
└─ compileModifiers
```


---

## 9. Modifier Engine

Modifier Engine은 Phantom Forces의 `compileModifiers` 동작을 재현한다.

Modifier 처리 순서는 다음과 같다.

```text
1. setters
2. adders
3. tableInserters
4. tableRemovers
5. relativeMultipliers
6. trueMultipliers
7. tableRelativeMultipliers
8. tableTrueMultipliers
9. functionMods
```

현재 실제 JSON/API 데이터에서 확인되는 주요 modifier type은 다음과 같다.

```text
setters
adders
relativeMultipliers
trueMultipliers
tableInserters
tableTrueMultipliers
```

`functionMods`는 Lua function을 포함하기 때문에 JSON/API 데이터만으로 직접 재현할 수 없는 영역이다.

따라서 실제 데이터에서 확인되지 않은 function modifier 동작은 임의로 구현하지 않는다.


### Scalar Modifier Model

현재 확인된 scalar modifier 계산은 개념적으로 다음과 같다.

```text
Base'
  = setter가 존재하면 setter 값
  = 그렇지 않으면 Base

A = Base' + Σ(adders)

T = Π(trueMultipliers)

P = Σ(positive relativeMultipliers)

N = Σ(abs(negative relativeMultipliers))

Final = A × T × (1 + P) / (1 + N)
```

Relative multiplier는 target path별로 pooled 처리한다.

이는 단순한 modifier를 순차적으로 적용하는 것과 다르다.


### Setter Priority

Setter가 충돌하는 경우 priority resolution이 필요하다.

현재 확인된 우선순위 정보:

```text
absolutePriority
    ↓
priority
    ↓
sequence
```

동일한 조건에서 first-wins semantics를 보존한다.


### Index Path

Modifier는 scalar 하나뿐 아니라 배열 내부의 특정 값을 대상으로 할 수 있다.

지원해야 하는 target 형태에는 다음이 포함된다.

```text
single key
key array / fan-out
wildcard
condition-based targeting
```

Negative index도 지원한다.

예:

```text
-1
```

은 배열의 마지막 요소를 의미한다.


### Immutability

Modifier compilation은 Base WeaponData를 직접 수정하지 않는다.

개념적으로:

```text
Base WeaponData
      │
      ▼
  Deep Copy
      │
      ▼
Apply Modifiers
      │
      ▼
Compiled WeaponData
```

Base data는 immutable source로 취급한다.


---

# 10. compileWeaponData Post-processing

Modifier Engine 이후에도 Phantom Forces의 weapon compilation 단계에는 추가적인 post-processing이 존재한다.

현재 확인된 항목:

### spare rounds / magazine size

값을 rounding한다.

### damageGraph

- distance 기준으로 정렬한다.
- 첫 distance가 0보다 큰 경우 distance 0 entry를 추가한다.

### animationmods

기존 animation data와 merge한다.

### firerate

animation timing을 기반으로 추가적인 clamp를 수행한다.

따라서 최종 fire rate는 단순히 modifier engine의 결과값과 항상 동일하지 않을 수 있다.

### Finalization

최종 WeaponData는 deep freeze된다.


---

# 11. Recoil Architecture

Phantom Forces recoil은 단순히 매 shot마다 카메라 각도를 더하는 방식이 아니다.

기본 구조는 다음과 같다.

```text
Weapon recoil parameters
        │
        ▼
   RecoilSprings
        │
        ▼
   Vector3Spring
        │
        ▼
Analytic Spring State
        │
        ▼
Position / Rotation
```

Recoil impulse와 spring recovery를 시간에 따라 계산한다.


---

# 12. RecoilSprings

주요 source:

```text
ClientModules.Weapons.RecoilSprings
```

RecoilSprings는 여러 개의 `Vector3Spring` layer를 관리한다.

```text
RecoilSprings
├─ Vector3Spring
├─ Vector3Spring
├─ ...
└─ Vector3Spring
```

각 Vector3Spring은 다시 독립적인 x/y/z 축을 가진다.

따라서 recoil layer와 axis를 혼동하지 않는다.

```text
Recoil layer
    └─ Vector3Spring
         ├─ X
         ├─ Y
         └─ Z
```


---

## 13. Recoil Impulse

각 recoil parameter는 다음과 같은 개념을 가진다.

```text
[damping, speed, mean, variance]
```

Shot마다 impulse가 발생한다.

Random value는 현재 확인된 구현에서 다음과 같은 형태다.

```text
mean + variance × 2 × random() - variance
```

즉,

```text
mean + Uniform(-variance, +variance)
```

이다.

따라서 mean과 variance는 최종 recoil angle 자체가 아니다.

이 값들은 spring에 전달되는 **shot impulse**를 결정한다.


---

## 14. Spring Behavior

Spring은 단순한 선형 보간이나 고정 시간 recoil animation으로 대체하지 않는다.

Phantom Forces는 analytic damped spring을 사용한다.

관련 source:

```text
SharedModules.Math.Spring
SharedModules.Math.Vector3Spring
```

`Vector3Spring`은 x/y/z를 독립적으로 계산한다.

Spring은 다음 상태를 가진다.

```text
position
velocity
damping
speed
time
```

현재 상태를 기반으로 analytic solution을 계산한다.

Damping 조건에 따라:

```text
underdamped
critical damped
overdamped
```

형태를 처리한다.


---

# 15. Recovery

Recoil recovery는 recoil impulse와 별개의 과정이다.

RecoilSprings는 `_lastImpulseTime`과 각 layer/axis의 recovery delay를 이용하여 recovery parameter로 전환할 수 있다.

개념적으로:

```text
Normal Spring Parameters
        │
        │ recoil
        ▼
Impulse State
        │
        │ recovery delay
        ▼
Recovery Parameters
        │
        ▼
Return toward equilibrium
```

Recovery speed는 단순히

> "정확히 N초 후 원점에 도착한다"

라는 고정 시간이 아니다.

Spring parameter의 일부이며, 실제 trajectory는 damping/speed/현재 state에 의해 결정된다.


---

# 16. GameClock

`Vector3Spring`은 일반적인 wall-clock API에 직접 의존하지 않고 Phantom Forces의 GameClock을 사용한다.

Source:

```text
SharedModules.GameClock
```

RecoilSim에서는 이를 simulation-friendly virtual clock으로 추상화한다.

개념:

```text
clock.now()
clock.advance(dt)
```

Simulation Core에서 `Date.now()`, `performance.now()`, `os.clock()` 등의 실제 wall clock에 직접 의존하지 않는다.

이 구조는 다음을 가능하게 한다.

```text
Deterministic Simulation
Fast-forward
Frame-by-frame testing
Golden testing
Monte Carlo simulation
```


---

# 17. Weapon Recoil vs Camera Recoil

Phantom Forces에는 서로 다른 recoil spring system이 존재한다.

## Weapon recoil

`FirearmObject`에서 직접 관리된다.

```text
_translationSprings
_rotationSprings
```

둘 다 `RecoilSprings`를 사용한다.

Impulse는 identity/local-space CFrame 기준으로 적용된다.

즉, weapon recoil impulse 자체에 camera orientation을 적용하는 별도의 world-space 회전이 존재하지 않는다.


---

## Camera recoil

Camera recoil은 `MainCameraObject`가 관리한다.

```text
_cameraHeadSprings
_cameraBodySprings
```

둘 다 `RecoilSprings`를 사용한다.

`CameraInterface` 자체가 recoil 계산을 수행하는 것이 아니라 camera object로 routing하는 역할을 한다.

실제 gameplay camera recoil은 `MainCameraObject`에서 처리한다.


---

# 18. Recoil Impulse Scaling

Weapon recoil과 camera recoil의 impulse scaling은 동일하지 않다.

FirearmObject에서 기본 scale은 개념적으로:

```text
(1 - firemodeStability)
×
(1 - characterStability)
```

이다.

Stance별 `characterStability`는 현재 확인된 값:

```text
standing = 0
crouching = 0.15
prone = 0.10
```

따라서 현재 확인된 구조에서는 crouching과 prone의 recoil multiplier가 동일하지 않다.


---

## Camera Device Multiplier

Camera recoil에는 input device multiplier가 추가로 적용된다.

현재 확인된 값:

```text
Mouse / Keyboard = 1.0
Touch            = 0.75
Controller       = 0.5
```

따라서 camera recoil의 최종 scale은:

```text
(1 - firemodeStability)
×
(1 - characterStability)
×
deviceMultiplier
```

이다.

중요:

**device multiplier는 weapon translation/rotation recoil에 적용되지 않는다.**

이는 camera recoil에만 적용된다.


---

# 19. Firemode Stability

Firemode stability는 weapon stat에서 firemode별로 가져온다.

```text
firemodestability
```

현재 확인된 기본값은 0이다.

FirearmObject에서 recoil scale 계산에 사용된다.

별도의 `computeWeightRecoilMult()` 같은 독립적인 recoil weight 함수는 현재 확인되지 않았다.

따라서 존재하지 않는 추상화나 multiplier를 임의로 추가하지 않는다.


---

# 20. Recoil Rotation

Recoil rotation은 Euler angle 누적 방식으로 구현하지 않는다.

Phantom Forces의 rotation은 axis-angle 기반 CFrame rotation을 사용한다.

개념적으로:

```text
Axis + Angle
      ↓
Rodrigues / Axis-Angle Rotation
      ↓
CFrame
```

최종 CFrame composition의 정확한 순서는 source에 맞춰 보존한다.

특히 translation과 rotation의 곱셈 순서 및 camera body/head recoil의 적용 순서를 임의로 변경하지 않는다.


---

# 21. Camera CFrame Composition

MainCameraObject에서는 camera body와 camera head recoil이 별개의 layer로 적용된다.

개념적인 구조:

```text
Base Camera
    │
    ▼
Camera Body Recoil
    │
    ▼
Body Sway
    │
    ▼
Camera Head Recoil
    │
    ▼
Other Camera Effects
    │
    ▼
Final Camera CFrame
```

정확한 multiplication order는 실제 source와 golden test를 기준으로 유지한다.


---

# 22. Randomness and Determinism

Randomness는 injectable하게 설계한다.

```ts
interface RandomSource {
    next(): number;
}
```

Production simulation에서는 일반 random source를 사용할 수 있다.

Testing에서는 seeded random source를 사용한다.

목표:

```text
same weapon
+ same attachments
+ same stance
+ same firemode
+ same input device
+ same seed
+ same simulation settings
=
same result
```

이를 통해 recoil trajectory와 Monte Carlo 결과를 재현할 수 있어야 한다.


---

# 23. Source Mapping

역공학된 PF source와 RecoilSim 구현 사이의 대응 관계를 유지한다.

주요 source:

```text
SharedModules.ContentUtils
    └─ compileWeaponData

SharedModules.StatModifierInterface
    └─ compileModifiers

SharedModules.Math.Spring
    └─ Spring

SharedModules.Math.Vector3Spring
    └─ Vector3Spring

SharedModules.GameClock
    └─ GameClock abstraction

ClientModules.Weapons.RecoilSprings
    └─ RecoilSpring

ClientModules.FPS.FirearmObject
    └─ Weapon recoil / impulse scaling

ClientModules.Camera.MainCameraObject
    └─ Camera recoil

ClientModules.Camera.CameraInterface
    └─ Camera routing
```

실제 source path는 `docs/source-map.md`에서 관리한다.

원본 Lua 파일을 RecoilSim repository에 그대로 복제하는 것을 기본 원칙으로 하지 않는다.

Repository에는 **PF 내부 logical source path와 RecoilSim 구현의 대응 관계**를 기록한다.


---

# 24. Project Structure

현재 프로젝트의 구조는 다음 방향을 따른다.

```text
src/
├─ core/
│  ├─ data/
│  │  ├─ WeaponData.ts
│  │  ├─ AttachmentData.ts
│  │  └─ schemas/
│  │
│  ├─ parser/
│  │  ├─ WeaponsParser.ts
│  │  └─ ...
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
├─ ui/
│  ├─ components/
│  ├─ pages/
│  └─ viewer/
│
└─ app/
   └─ main.tsx

data/
├─ raw/
│  ├─ weapons.json
│  └─ weapon-details/
│
└─ normalized/
   ├─ weapons.json
   └─ attachments.json

docs/
├─ tech_direction.md
├─ architecture.md
├─ source-map.md
└─ reverse-engineering/
```

실제 repository 구조가 이 문서와 달라지는 경우, 구현을 억지로 문서에 맞추기보다 문서를 현재 구조에 맞게 갱신한다.


---

# 25. Dependency Rules

Core와 UI의 dependency 방향은 다음과 같다.

```text
UI
 ↓
Simulation API
 ↓
Simulation Core
 ↓
Data / Math
```

Core에서 다음을 import하지 않는다.

```text
React
Three.js
DOM API
Browser UI state
```

예:

```text
Allowed:

UI → RecoilSimulator
UI → WeaponCompiler

Forbidden:

RecoilSimulator → React
RecoilSimulator → Three.js
WeaponCompiler → React
Vector3Spring → Three.js
```

Three.js Vector3를 simulation state의 기본 자료구조로 사용하는 것도 피한다.

Simulation Core는 자체적인 math representation을 사용한다.


---

# 26. Testing Strategy

테스트는 단순히 TypeScript 함수가 실행되는지를 확인하는 것이 아니라 **Phantom Forces와의 동작 일치성을 검증하는 것**을 목표로 한다.

우선순위:

```text
Raw Data
   ↓
Parser
   ↓
Normalized Data
   ↓
Modifier Engine
   ↓
Weapon Compiler
   ↓
Spring
   ↓
Vector3Spring
   ↓
RecoilSprings
   ↓
Shot Simulation
   ↓
Trajectory
```

각 단계에서 가능한 경우 PF의 실제 결과와 비교한다.


### Golden Fixtures

대표적인 weapon과 attachment를 golden fixture로 유지한다.

예:

```text
C25
EF88
Compensator
Handstop
R2 Suppressor
```

C25는 recoil spring 및 weapon data 검증을 위한 주요 fixture로 사용한다.

Golden test는 가능한 경우 다음을 비교한다.

```text
input
+
parameters
+
seed
+
time
=
expected output
```


---

# 27. Performance Direction

초기 MVP에서는 일반적인 TypeScript/JavaScript CPU simulation을 사용한다.

성능 문제가 실제로 확인된 경우에만 다음을 고려한다.

```text
1. Web Worker
2. TypedArray
3. simulation batching
4. WASM
5. GPU computation
```

처음부터 WASM이나 GPU simulation을 도입하지 않는다.

특히 Monte Carlo simulation은 먼저 정확한 CPU implementation을 완성한 뒤 최적화한다.


---

# 28. Monte Carlo

Monte Carlo는 기본 simulation이 정확하게 구현된 이후 추가한다.

개념:

```text
Weapon + Attachments
        │
        ▼
Deterministic Simulation
        │
        ▼
Random Seed 변경
        │
        ▼
Many Simulations
        │
        ▼
Metrics
```

Monte Carlo가 직접 recoil 공식을 정의해서는 안 된다.

항상 실제 recoil simulation을 반복 실행하는 방식으로 동작한다.

따라서:

```text
Modifier Engine
        ↓
Weapon Compiler
        ↓
Recoil Simulation
        ↓
Monte Carlo
```

구조를 유지한다.


---

# 29. UI Direction

UI는 Simulation Core가 완성된 이후 개발한다.

UI의 책임:

- weapon 선택
- attachment 선택
- stance 선택
- firemode 선택
- input device 선택
- simulation parameter 설정
- trajectory visualization
- shot별 recoil 표시
- 여러 loadout 비교
- Monte Carlo 결과 표시

UI는 recoil 계산 자체를 수행하지 않는다.


---

# 30. What Not To Do

다음과 같은 구현을 임의로 추가하지 않는다.

### 존재하지 않는 recoil multiplier

Source에서 확인되지 않은:

```text
weight recoil multiplier
camera recoil multiplier stat
별도의 stance recoil formula
```

등을 추측하여 추가하지 않는다.

---

### 단순 recoil 공식

다음과 같은 단순 모델로 대체하지 않는다.

```text
recoil angle += recoilValue
```

또는

```text
recoil *= damping
```

실제 PF는 analytic spring system을 사용한다.

---

### Mean / Variance를 최종 각도로 취급

다음과 같이 해석하지 않는다.

```text
mean = 최종 recoil angle
variance = 최종 recoil spread
```

Mean과 variance는 shot impulse의 random parameter이며,
실제 trajectory는 spring dynamics와 shot timing의 결과다.


---

### Recovery를 고정 시간으로 구현

```text
recoil 발생
→ 정확히 0.2초 후 원점
```

같은 방식으로 구현하지 않는다.

Recovery는 spring parameter와 현재 spring state의 결과다.


---

### Camera와 Weapon recoil을 하나로 합치기

다음 두 system은 분리한다.

```text
Weapon Translation / Rotation Recoil

Camera Body / Head Recoil
```

Camera에는 device multiplier가 적용되지만 weapon recoil에는 적용되지 않는다는 차이도 유지한다.


---

# 31. Development Priority

현재 권장 개발 순서:

```text
Existing Raw / Normalized Data
          ↓
Data Schema Validation
          ↓
Source Mapping / Documentation
          ↓
Modifier Engine
          ↓
Weapon Compiler
          ↓
Spring
          ↓
Vector3Spring
          ↓
RecoilSprings
          ↓
Weapon Recoil
          ↓
Camera Recoil
          ↓
Shot Simulation
          ↓
Trajectory
          ↓
Golden / Reference Tests
          ↓
Monte Carlo
          ↓
Three.js Visualization
          ↓
React UI
```

구현보다 먼저 역공학 결과와 source mapping을 문서화하여
향후 구현 과정에서 확인되지 않은 동작이 임의로 추가되지 않도록 한다.


---

# 32. MVP Scope

초기 MVP에서는 다음을 구현한다.

```text
✓ Real PF weapon data
✓ Real attachment data
✓ Data normalization
✓ Modifier Engine
✓ Weapon compilation
✓ Spring
✓ Vector3Spring
✓ RecoilSprings
✓ Weapon recoil
✓ Camera recoil
✓ Deterministic clock
✓ Seeded randomness
✓ Golden tests
✓ Basic trajectory simulation
```

다음은 MVP 이후로 미룬다.

```text
- Backend server
- Database
- Authentication
- Cloud simulation
- WASM
- GPU compute
- Complex state management
- Advanced UI polish
- Large-scale optimization
```


---

# 33. Documentation Rule

역공학 과정에서 새로운 사실이 확인되면 해당 사실을 코드에만 반영하지 않는다.

가능한 경우 다음 세 가지를 함께 갱신한다.

```text
Source Map
     ↓
Reverse Engineering Documentation
     ↓
Implementation / Tests
```

특히 구현이 기존 문서의 가정과 충돌하는 경우에는
구현을 임의로 기존 문서에 맞추기보다 **확인된 source를 기준으로 문서를 갱신한다.**

이 repository에서 가장 중요한 기준은:

```text
실제 PF source / data
        ↓
검증된 역공학 결과
        ↓
Golden Test
        ↓
TypeScript Implementation
```

이다.
