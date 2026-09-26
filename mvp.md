# Phantom Forces Recoil Simulator — MVP

## 1. 프로젝트 목표

이 MVP는 Phantom Forces의 **전체 무기 시스템을 구현하는 프로젝트가 아니다.**

현재 확인된 소스와 실제 데이터에 근거해, **C25 한 정과 실제로 제공되는 attachment**를 대상으로 다음 경로가 원본과 일치하는지 단계적으로 검증하는 것이 목적이다.

```text
Raw data
    ↓
Normalize + Meta↔Detail binding
    ↓
Attachment modifier compilation
    ↓
ContentUtils.compileWeaponData post-processing
    ↓
Final WeaponData
    ↓
RecoilSprings → Vector3Spring → GameClock
    ↓
Weapon / Camera recoil state
    ↓
검증 가능한 shot 기록과 trajectory
```

MVP의 성공 기준은 “그럴듯한 반동 그래프”가 아니라, 고정된 입력ㆍ가상 시간ㆍ난수 seed에서 **C25의 compiled WeaponData와 recoil simulation 결과를 재현 가능하고 비교 가능하게 만드는 것**이다.

원본 Lua의 문법이나 파일 구조를 문자 그대로 복사하는 것은 목표가 아니다. 목표는 원본에서 확인된 동작과 수치적 결과를 TypeScript에서 명확하고 테스트 가능하게 재현하는 것이다.

---

## 2. MVP의 핵심 원칙

### 실제 PF 소스와 데이터가 명세다

제공된 Lua source와 raw data에서 확인된 동작은 authoritative specification으로 취급한다. 일반적인 FPS recoil 공식, 임의의 recoil weight, 임의의 부착물 호환 규칙을 추가하지 않는다.

확인 상태는 문서ㆍ테스트ㆍ구현에서 구분한다.

```text
Confirmed
  source 또는 실제 raw data로 직접 확인됨

Inferred
  여러 확인 결과를 연결한 구현상 추론. 근거를 source-map에 기록함

TODO / 검증 필요
  아직 source 또는 데이터로 닫히지 않음. 동작을 발명하지 않음
```

### Simulation Core와 표시 계층을 분리한다

Simulation Core는 React, Three.js, 브라우저 시간 API에 의존하지 않는다.

```text
UI / CLI / Test / Monte Carlo worker
                ↓
          Simulation API
                ↓
          Simulation Core
```

UI는 입력과 결과 표시를 담당한다. WeaponData compilation, random sampling, spring state 계산을 React component나 renderer에서 수행하지 않는다.

### 결정론을 기본값으로 한다

모든 simulation 실행은 주입 가능한 virtual clock과 seeded RNG를 받는다. Core는 `Date.now()`, `performance.now()`, `Math.random()` 같은 전역 상태에 직접 의존하지 않는다.

같은 다음 입력은 같은 출력과 trace를 만들어야 한다.

```text
raw-data version + C25 selection + attachment selection
+ firemode + aim / stance + device
+ seed + virtual-clock schedule
```

---

## 3. 현재 MVP 범위

### 포함

- C25의 raw meta와 detail을 binding하여 base WeaponData를 얻는다.
- C25에서 실제로 선택 가능한 attachment와 해당 modifier를 사용한다.
- raw data를 normalized schema로 보존ㆍ변환한다.
- PF Modifier Engine의 확인된 9단계 compilation 순서와 `indexPath`/priority 의미를 재현한다.
- `ContentUtils.compileWeaponData`의 확인된 post-processing을 재현한다.
- `RecoilSprings → Vector3Spring → GameClock`의 시간 기반 recoil 실행을 재현한다.
- weapon recoil과 camera recoil을 별도 state와 별도 CFrame composition 경로로 다룬다.
- stance, firemode stability, input device multiplier가 impulse에 미치는 확인된 차이를 재현한다.
- golden/reference test와 debug trace로 각 단계의 결과를 비교한다.

### 제외

- 모든 PF 무기 및 모든 attachment variant 지원
- 전체 firing state machine, character movement, animation, networking, replay 시스템
- 게임 화면과 동일한 완성도 높은 UI
- 자동 attachment 최적화와 대규모 Monte Carlo 분석
- source에서 아직 확인되지 않은 function modifier 또는 compatibility rule의 추측 구현

Monte Carlo와 attachment 비교 UI는 Core가 결정론적으로 검증된 뒤의 확장 단계다. MVP 완료 조건에는 포함하지 않는다.

---

## 4. 데이터 파이프라인

### 4.1 Raw data는 보존한다

Raw data는 수집된 API/dump의 형태와 식별자를 가능한 한 보존하는 read-only 입력이다. Parser/normalizer가 원본을 고치거나 simulation 결과를 raw data에 기록하지 않는다.

```text
raw/
├─ weapon-meta/          # 무기 목록ㆍ표시 정보ㆍ원본 식별자
├─ weapon-details/       # C25 등 개별 무기 상세 데이터
└─ attachments/          # common / weapon-specific modifier 원본
```

파일명이나 display name만으로 엔터티를 동일시하지 않는다. meta의 이름과 detail의 이름이 다를 수 있다.

### 4.2 Meta ↔ Detail binding

Normalizer는 meta entry와 detail entry의 원본 식별자, 알려진 alias, detail 내부 identity를 이용해 binding record를 만든다.

```text
WeaponMeta ── binding evidence ──> WeaponDetail
                                      ↓
                                NormalizedWeapon
```

각 binding은 다음을 traceable하게 보존한다.

- meta source ID와 detail source ID
- binding에 사용한 key/alias 및 근거
- display name과 simulation identity의 차이
- 성공, 미결정, 충돌 상태

C25 MVP에서는 binding이 하나로 결정되어야 한다. 충돌하거나 미결정인 binding은 임의 선택하지 않고 오류로 보고한다.

### 4.3 Normalized data

Normalized schema는 Core가 안정적으로 사용할 형태를 제공하지만, modifier의 원래 의미를 잃지 않는다.

```text
NormalizedWeapon
├─ identity / display metadata
├─ baseWeaponData
├─ attachmentSlots
├─ availableAttachment references
└─ source references

NormalizedAttachment
├─ identity / display metadata
├─ slot and compatibility evidence
├─ common or weapon-specific origin
├─ modifier groups
└─ source references
```

Modifier는 type, value, `indexPath`, priority 계열 값, insertion/condition metadata와 원본 위치를 함께 보존한다. normalize 단계는 modifier를 계산하거나 적용하지 않는다.

---

## 5. Weapon compilation

### 5.1 책임 경계

Shared 성격의 compiler는 “선택한 C25와 attachment가 어떤 최종 WeaponData를 갖는가”를 결정한다.

```text
Base WeaponData + selected actual attachments
                  ↓
            Modifier Engine
                  ↓
   ContentUtils.compileWeaponData post-processing
                  ↓
           immutable Final WeaponData
```

Client 성격의 simulation은 Final WeaponData를 시간축에서 실행한다. stance나 device처럼 실행 환경에서 정해지는 값은 compiler가 아닌 simulation context의 입력이다.

### 5.2 Base-data immutability

Compiler는 base WeaponData를 직접 변경하지 않는다. compilation은 deep copy에서 시작하고, base와 compiled 결과를 각각 비교할 수 있어야 한다. 최종 결과는 원본 finalization에 대응해 immutable로 노출한다.

### 5.3 Modifier Engine: 확인된 9단계 순서

PF의 `compileModifiers`에 대응하는 엔진은 modifier group을 다음 순서로 처리한다.

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

이 순서는 단순한 구현 편의가 아니라 최종 WeaponData의 일부다. type별 modifier를 무작위로 순회하거나 attachment별로 순차 적용해 결과를 우연히 만들지 않는다.

현재 C25 raw attachment에서 실제로 만나는 modifier type과 source evidence를 먼저 테스트한다. `functionMods`는 Lua function을 포함할 수 있으므로, JSON만으로 행동을 확정할 수 없으면 **TODO / 검증 필요**로 기록하고 임의 callback을 만들지 않는다.

### 5.4 `indexPath` semantics

`indexPath`는 nested scalar나 table element를 가리킨다. Lua의 1-based 배열 인덱스를 source-level 의미로 보존하고, TypeScript 내부 배열 접근으로 바꿀 때는 경계에서만 명시적으로 변환한다.

예:

```text
recoil.aimRotation.x[1][3]
```

는 지정된 recoil layer의 세 번째 parameter만 대상으로 한다. “recoil 전체를 N% 감소”처럼 의미를 넓혀 적용하지 않는다.

source에서 확인된 path 기능(배열/fan-out, wildcard, negative index, condition-based target)은 각 기능별 evidence와 test를 갖춘 뒤에만 활성화한다. C25에서 실제 사용하지 않는 기능은 지원한다고 가정하지 않는다.

### 5.5 Priority semantics

충돌하는 setter와 path modifier의 우선순위는 원본이 사용하는 `absolutePriority`, `priority`, sequence 순으로 해석한다. 같은 조건에서의 first-wins 동작도 보존한다.

priority resolution은 attachment 표시 순서나 JavaScript object iteration 순서에 의존하면 안 된다. trace에는 후보 전체와 winner, 결정 근거를 남긴다.

### 5.6 Scalar modifier 결합

확인된 scalar 경로에서는 modifier를 path별로 모은 후 다음 의미로 결합한다.

```text
Base' = setter가 있으면 선택된 setter 값, 없으면 Base
A     = Base' + Σ(adders)
T     = Π(trueMultipliers)
P     = Σ(양수 relativeMultipliers)
N     = Σ(abs(음수 relativeMultipliers))
Final = A × T × (1 + P) / (1 + N)
```

relative multiplier는 단순히 선언 순서대로 곱하지 않는다. table modifier와 scalar modifier를 같은 규칙으로 뭉개지 않는다.

### 5.7 `ContentUtils.compileWeaponData` post-processing

Modifier Engine의 출력은 최종 WeaponData가 아니다. `ContentUtils.compileWeaponData`에서 확인된 후처리를 별도 단계로 명시한다.

- spare rounds / magazine size 관련 값을 원본 규칙으로 rounding한다.
- `damageGraph`를 distance 기준으로 정렬하고, 첫 distance가 0보다 크면 distance 0 entry를 추가한다.
- `animationmods`를 기존 animation data와 merge한다.
- animation timing을 반영해 firerate에 추가 clamp를 적용한다.
- final WeaponData를 freeze/finalize한다.

각 항목은 modifier trace와 분리된 compiler post-process trace를 낸다. 원본 source에서 세부 조건이 아직 닫히지 않은 후처리는 해당 C25 input에 대한 golden fixture를 만들기 전에 **검증 필요**로 남긴다.

---

## 6. Recoil simulation

### 6.1 Spring 계층

Recoil은 탄마다 각도를 누적하는 모델이 아니다. 확인된 실행 계층은 다음과 같다.

```text
Recoil parameters
      ↓
RecoilSprings (여러 recoil layer 관리)
      ↓
Vector3Spring (x / y / z 독립 state)
      ↓
analytic scalar Spring
      ↓
position / velocity at GameClock time
```

`Spring`과 `Vector3Spring`은 Euler integration으로 대체하지 않는다. 원본의 analytic damped spring 동작과 damping regime을 golden test로 비교한다.

### 6.2 Impulse와 recovery

recoil parameter layer는 확인된 형태 `[damping, speed, mean, variance]`를 사용한다. shot impulse의 난수 값은 다음과 동등한 범위다.

```text
mean + Uniform(-variance, +variance)
```

mean과 variance는 곧바로 최종 camera angle 또는 impact point가 아니다. spring velocity에 적용되는 impulse를 결정한다.

RecoilSprings는 impulse 뒤의 시간 경과와 `_lastImpulseTime` 및 recovery delay에 따라 recovery parameter로 전환한다. recovery를 “N초 뒤 무조건 0”으로 단순화하지 않는다.

### 6.3 GameClock과 virtual clock

원본 `GameClock`은 Spring이 읽는 게임 시간 추상화다. simulation은 이를 다음처럼 주입 가능한 virtual clock으로 대체한다.

```text
clock.now()
clock.advance(dt)
```

시계는 monotonic하며, shot event와 관측 event는 같은 시간축을 공유한다. frame rate나 실제 대기 시간은 결과에 영향을 주면 안 된다.

원본의 network time sync와 replay offset 재현은 MVP 범위 밖이다. Spring이 요구하는 `getTime()` 의미를 결정론적으로 제공하는 것이 MVP의 범위다.

### 6.4 Seeded RNG

난수 생성기는 simulation context에서 주입한다. trace에는 seed와 shot별 random draw를 기록한다. 따라서 실패한 golden test는 같은 seedㆍclock schedule로 재생할 수 있어야 한다.

RNG algorithm 자체가 원본과 동일한지 아직 직접 검증되지 않았다면, 결과를 “PF와 동일한 난수열”이라고 주장하지 않는다. MVP에서는 **재현 가능한 분포와 deterministic replay**를 보장하고, 원본 RNG 일치는 별도 검증 항목으로 둔다.

---

## 7. Weapon recoil과 camera recoil

두 경로는 같은 RecoilSprings 구현을 공유하지만, 서로 다른 instance와 합성 경로를 가진다. 하나의 recoil vector로 합치지 않는다.

```text
Final WeaponData
       │
       ├─ weapon recoil
       │   ├─ translation springs
       │   └─ rotation springs
       │
       └─ camera recoil
           ├─ camera body springs
           └─ camera head springs
```

weapon recoil은 `FirearmObject`의 translation/rotation springs에서 관리된다. camera recoil은 `MainCameraObject`의 camera body/head springs에서 관리된다. camera CFrame은 body recoil을 먼저, head recoil을 그 다음에 적용하는 원본 composition 순서를 검증 대상으로 둔다.

weapon local recoil과 camera world orientation을 임의로 같은 좌표계에서 합산하지 않는다. 최종 CFrame/trajectory의 정확한 추가 transformation 순서가 source로 닫히지 않은 부분은 **TODO / 검증 필요**로 남긴다.

### 7.1 확인된 impulse scale

firemode별 `firemodestability`는 compiled WeaponData에서 얻고, stance stability와 device는 simulation context에서 얻는다.

```text
weapon scale
= (1 - firemodeStability) × (1 - characterStability)

camera scale
= weapon scale × deviceMultiplier
```

확인된 context 값은 다음과 같다.

```text
character stability
standing  = 0
crouching = 0.15
prone     = 0.10

device multiplier
mouse / keyboard = 1.0
touch            = 0.75
controller       = 0.5
```

device multiplier는 weapon translation/rotation recoil에 적용하지 않고 camera recoil에만 적용한다. firemode selection이 모호하거나 해당 stability stat의 fallback이 source와 대조되지 않은 경우에는 test fixture에 explicit input을 넣고 **검증 필요**로 표시한다.

---

## 8. 단계별 구현과 검증

## Phase 1 — C25 데이터와 binding

목표:

```text
C25 meta + C25 detail + actual attachment data
                     ↓
          validated NormalizedWeapon
```

성공 조건:

- C25 meta↔detail binding의 근거와 source ID가 기록된다.
- 실제 attachment slot과 선택 가능한 input을 명시적으로 검증한다.
- raw data를 수정하지 않고 normalized result를 생성한다.
- binding 충돌/누락은 fallback 선택이 아니라 오류로 드러난다.

## Phase 2 — Modifier compilation과 final WeaponData

목표:

```text
C25 base WeaponData + one actual attachment
                  ↓
   9-stage Modifier Engine
                  ↓
compileWeaponData post-processing
                  ↓
       Final WeaponData
```

성공 조건:

- modifier가 정확한 `indexPath`에 적용된다.
- Lua 1-based index와 priority semantics가 test로 고정된다.
- scalar modifier pool과 table modifier 단계가 섞이지 않는다.
- post-processing 전/후 결과와 path-level debug trace를 출력한다.
- C25 + attachment fixture의 final recoil, firerate, 필요한 후처리 결과를 golden fixture와 비교한다.

## Phase 3 — Single-shot recoil

목표:

```text
Final WeaponData + fixed context + fixed seed + virtual clock
                         ↓
       weapon/camera RecoilSprings state
```

성공 조건:

- `RecoilSprings → Vector3Spring → analytic Spring`의 위치와 velocity가 기준 시점별로 검증된다.
- weapon translation/rotation과 camera body/head가 별도 trace로 기록된다.
- standing/PC 기본 fixture에서 impulse scale을 검증한다.
- stance 또는 device fixture를 하나 이상 추가해 weapon과 camera scale 차이를 검증한다.

## Phase 4 — Multi-shot timing

목표:

```text
fire schedule + recoildelay + virtual clock
                    ↓
       impulse / recovery / shot trace
```

성공 조건:

- `firerate`와 post-processing된 firerate를 사용한 shot interval을 검증한다.
- 각 shot에서 recovery, delay, impulse, spring state를 trace한다.
- 동일 seed와 schedule은 byte-for-byte 비교 가능한 logical trace를 낸다.
- burst, firecap, burstlock 등 C25에서 필요하지만 source로 아직 닫히지 않은 firing rule은 구현하지 않고 TODO로 남긴다.

## Phase 5 — 최소 trajectory 출력

목표는 renderer가 아니라 simulation 결과의 관측 가능성이다.

각 shot/observation은 최소 다음을 내보낸다.

```text
shot number
event timestamp
seed / random draw
weapon spring position and velocity
camera body/head position and velocity
applied impulse scales
documented CFrame composition inputs
look direction / impact point (구성 순서가 검증된 경우에만)
```

3D visualization은 이 trace를 소비하는 얇은 계층으로만 추가한다. impact point에 대해 source 기반 CFrame composition이 아직 완전히 검증되지 않았다면, recoil state visualization까지만 제공하고 탄착점 정확도를 주장하지 않는다.

---

## 9. Golden tests와 source-map

### 9.1 Golden tests

Golden test는 숫자 하나만 비교하지 않는다. 작은 fixture마다 input, source version, seed, clock schedule, expected intermediate state를 함께 고정한다.

우선순위는 다음과 같다.

```text
1. C25 meta↔detail binding
2. C25 base data normalization
3. attachment modifier의 indexPath / priority / scalar pooling
4. compileWeaponData post-processing
5. scalar Spring 및 Vector3Spring 기준 시점
6. one-shot weapon/camera impulse와 scale
7. multi-shot recovery와 timing
8. 검증된 CFrame / trajectory output
```

원본 Lua와 직접 비교 가능한 값은 source-derived golden으로 표시한다. simulator 내부에서 한 번 생성한 값만 기준으로 삼는 self-referential test는 원본 재현의 증거가 아니다.

### 9.2 Source-map 문서화

확인된 동작마다 source-map entry를 만든다. source-map은 구현 코드와 테스트가 왜 존재하는지 추적하는 문서이며, 추측을 확정 사실처럼 숨기지 않는다.

최소 필드:

```text
feature
status: Confirmed | Inferred | TODO
PF module / function
source file and line range (확인 가능한 경우)
raw-data fixture / path
implementation module
golden test / trace fixture
notes and open questions
```

초기 source-map의 필수 항목:

- `StatModifierInterface.compileModifiers`의 9단계와 priority/indexPath semantics
- `ContentUtils.compileWeaponData`의 후처리
- `Spring`, `Vector3Spring`, `RecoilSprings`
- `GameClock.getTime` 역할
- `FirearmObject`의 recoil delay, firemode/stance scale, weapon spring 경로
- `MainCameraObject`의 body/head spring 및 CFrame composition 경로

---

## 10. Debug / 개발 출력

개발 모드에서는 최종 impact point만 보여주지 않는다. PF와 비교할 수 있도록 중간 상태를 구조화해 출력한다.

```text
[Data]
raw source IDs
meta↔detail binding evidence
selected C25 attachment and compatibility evidence

[Compilation]
indexPath
base value
candidate setters + priority winner
adders / relative multipliers / true multipliers
table operation trace
post-processing before/after

[Simulation]
seed
virtual time
firemode / stance / input device
weapon scale / camera scale
shot impulse draws
each RecoilSprings position and velocity

[Output]
CFrame composition inputs
look direction / impact point only when verified
```

이 trace는 UI logging 형식이 아니라 test fixture로 직렬화할 수 있는 stable data model이어야 한다.

---

## 11. 검증 필요 / 명시적 TODO

다음은 MVP에서 임의로 채우지 않는다.

- C25에 실제로 필요한 범위를 넘어서는 `functionMods` 동작
- raw attachment 데이터만으로 확정할 수 없는 모든 compatibility/variant rule
- 원본 RNG algorithm과 난수 seed lifecycle의 동일성
- C25에 적용되는 모든 burst/firecap/burstlock rule의 정확한 source 경로
- weapon recoil 및 camera recoil 외의 sway, walk, damage, acceleration 등 최종 CFrame 효과
- replay offset과 network synchronized GameClock의 전체 동작
- source line/fixture가 아직 수집되지 않은 post-processing 세부 분기

TODO는 단순한 백로그가 아니다. 각 항목은 source-map에 상태와 필요한 조사 자료를 기록하며, 확인되기 전에는 golden expected value를 조작해 통과시키지 않는다.

---

## 12. MVP 완료 조건

다음이 모두 충족되면 MVP의 핵심은 완료된 것으로 본다.

```text
[ ] C25 meta와 detail을 근거와 함께 binding할 수 있다.
[ ] raw C25/attachment 데이터를 보존한 normalized schema를 만들 수 있다.
[ ] C25에서 실제 선택 가능한 attachment 하나 이상을 명시적으로 선택할 수 있다.
[ ] 9단계 Modifier Engine 순서와 C25가 사용하는 indexPath/priority semantics를 검증한다.
[ ] compileWeaponData의 확인된 post-processing을 적용하고 trace할 수 있다.
[ ] base WeaponData를 변경하지 않고 immutable Final WeaponData를 생성한다.
[ ] Spring / Vector3Spring / RecoilSprings를 virtual GameClock에서 결정론적으로 실행한다.
[ ] seed를 고정한 one-shot 결과를 golden test와 비교한다.
[ ] C25 multi-shot에서 firerate, recoildelay, recovery를 trace하고 검증한다.
[ ] weapon translation/rotation과 camera body/head recoil을 별도 state로 유지한다.
[ ] stance, firemode stability, device multiplier의 확인된 scale 차이를 테스트한다.
[ ] source-map과 golden fixture가 각 핵심 동작의 근거를 가리킨다.
[ ] 검증되지 않은 동작을 TODO로 남기고, 결과 정확도를 과장하지 않는다.
```

MVP의 최종 산출물은 “전체 PF 구현”이 아니라, **C25 + 실제 attachment에 대해 컴파일 결과와 recoil simulation을 신뢰성 있게 대조할 수 있는 작고 결정론적인 검증 기반**이다.
