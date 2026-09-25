# Phantom Forces Recoil Simulator — MVP

## 1. 프로젝트 목표

Phantom Forces의 실제 클라이언트 recoil 시스템을 최대한 동일하게 재현하는 recoil simulator를 만든다.

단순히 "반동 수치를 그래프로 표시하는 프로그램"이 아니라,

1. 기본 WeaponData를 읽고
2. 선택한 Attachment의 modifier를 적용하여 최종 WeaponData를 생성하고
3. Phantom Forces의 RecoilSpring / Vector3Spring / Spring 동작을 재현하고
4. 실제 발사 간격과 recoil recovery를 반영하여
5. 각 탄의 최종 방향과 3D trajectory를 계산하는 것

을 목표로 한다.

최종적으로는 여러 Attachment 조합을 Monte Carlo simulation으로 반복 실행하여 recoil 특성을 비교할 수 있도록 한다.

---

## 2. MVP의 핵심 원칙

### 실제 Phantom Forces 소스를 기준으로 구현한다.

제공된 Lua 소스에 구현되어 있는 동작은 해당 소스를 authoritative specification으로 취급한다.

일반적인 FPS recoil 시스템을 새로 설계하거나, 소스에 없는 recoil 공식을 임의로 만들어서는 안 된다.

소스에서 확인되지 않은 동작은 임의로 구현하지 말고 `TODO` 또는 `검증 필요`로 남긴다.

### 구현 우선순위

UI보다 정확한 simulation을 우선한다.

다음 순서로 개발한다.

```text
Attachment modifier 적용
        ↓
최종 WeaponData 생성
        ↓
RecoilSpring 재현
        ↓
단일 발사 검증
        ↓
연사/shot timing 검증
        ↓
3D trajectory
        ↓
Monte Carlo
        ↓
Attachment 조합 비교
        ↓
UI 개선
```

---

## 3. 현재 제공된 자료

프로젝트에는 다음 파일이 제공되어 있다.

```text
RecoilSim/
├─ C25.json
├─ ContentUtils.lua
├─ EF88woutSights.json
├─ FirearmObject_Recoil.lua
├─ PageLoadoutMenuDisplay.lua
├─ RecoilSprings.lua
├─ Spring.lua
├─ StatModifiers.lua
└─ Vector3Spring.lua
```

### C25.json

기본 무기 데이터.

예상되는 주요 데이터:

- damage
- firerate
- firemodes
- recoil
- hipfire
- spread
- bulletspeed
- 기타 weapon stats

### EF88woutSights.json

Attachment 데이터.

대부분의 공용 Grip / Muzzle / Suppressor / Laser 등의 attachment가 공용 stat/modifier를 사용한다.

Attachment는 `attachmentModifiers`를 통해 WeaponData의 특정 `indexPath`를 수정한다.

### ContentUtils.lua

WeaponData를 compile하는 과정과 Attachment modifier를 WeaponData에 적용하는 흐름을 확인하기 위한 소스.

### StatModifiers.lua

Attachment modifier 계산 로직.

### FirearmObject_Recoil.lua

실제 FirearmObject에서 recoil과 firing 과정이 어떻게 연결되는지 확인하기 위한 소스.

### RecoilSprings.lua

Phantom Forces의 recoil spring 시스템.

### Vector3Spring.lua

3축 spring의 실제 상태와 analytic solution을 구현한 소스.

### Spring.lua

scalar spring의 analytic solution.

### PageLoadoutMenuDisplay.lua

Loadout 메뉴에서 recoil을 실제로 simulation하는 코드.

RecoilSpring들을 생성하고 firing interval에 따라 impulse를 적용하며 CFrame과 trajectory를 계산하는 참고 구현으로 사용한다.

---

# 4. Attachment Modifier System

선택된 Attachment의 `attachmentModifiers`를 모두 수집하여 WeaponData에 적용한다.

Attachment는 슬롯별로 선택된다.

```text
Optics
Barrel
Underbarrel
Other
Ammo
```

공용 Attachment와 weapon-specific Attachment가 존재할 수 있다.

---

## 4.1 indexPath

Modifier는 `indexPath`를 통해 WeaponData 내부의 특정 값을 지정한다.

예:

```text
[
    "recoil",
    "aimRotation",
    "x",
    1,
    3
]
```

는 Lua 기준으로 다음 값을 의미한다.

```lua
weaponData.recoil.aimRotation.x[1][3]
```

Lua 배열은 1-based index이므로 구현 시 이 점을 반드시 고려한다.

---

# 5. Modifier 계산식

각각의 최종 수정 대상 값에 대해 다음 계산을 적용한다.

```text
Base' = Setter가 있으면 Setter값, 없으면 Base

A = Base' + 모든 Adders의 합

T = 모든 trueMultiplier의 곱

P = 모든 양수 relativeMultiplier의 합

N = 모든 음수 relativeMultiplier 절댓값의 합

Final = A × T × (1 + P) / (1 + N)
```

예:

```text
Base = 100

Adder:
+10

trueMultiplier:
×1.2

relativeMultiplier:
+0.2
-0.1
```

이면:

```text
Base' = 100
A = 110
T = 1.2
P = 0.2
N = 0.1

Final = 110 × 1.2 × 1.2 / 1.1
```

각 modifier를 순차적으로 단순 곱하는 방식으로 구현하지 않는다.

---

# 6. Recoil 데이터 구조

Recoil 데이터의 각 일반 recoil layer는 다음과 같은 형태를 가진다.

```text
[damping, speed, mean, variance]
```

즉:

```text
[1] = damping
[2] = speed
[3] = mean
[4] = variance
```

예:

```text
recoil.aimRotation.x[1]
```

이 하나의 layer가:

```text
[damping, speed, mean, variance]
```

를 가진다.

Attachment는 이 중 특정 요소만 수정할 수 있다.

따라서 recoil modifier를 단순히 "반동 전체를 X% 감소"로 처리하지 않는다.

반드시 실제 `indexPath`가 지정한 값을 수정한다.

---

# 7. RecoilSpring

Recoil은 단순한 random angle이 아니다.

각 recoil layer는 Spring을 사용하며, 발사 시 random impulse를 spring velocity에 적용한다.

`RecoilSprings.lua`의 동작을 최대한 그대로 재현한다.

특히 recoil impulse의 random 값은 해당 layer의:

```text
mean
variance
```

를 사용한다.

개념적으로:

```text
random = mean + uniform(-variance, +variance)
```

형태의 random impulse가 생성된다.

각 축에 대한 impulse를 Spring에 적용한다.

---

# 8. Spring

`Spring.lua`와 `Vector3Spring.lua`에서 사용하는 analytic damped spring을 재현한다.

일반적인 Euler integration으로 대체하지 않는다.

Spring의 주요 상태:

```text
damping
speed
position
velocity
target
time
```

등을 소스와 동일한 의미로 유지한다.

`Vector3Spring`은 X/Y/Z를 독립적으로 계산한다.

---

# 9. Firing / Shot Timing

Weapon의 `firerate`를 이용하여 shot interval을 계산한다.

기본적으로:

```text
shotInterval = 60 / firerate
```

를 사용한다.

단, burst / firecap / burstlock 등 별도의 firing 관련 weapon data가 실제 소스에서 사용되는 경우 해당 동작을 따른다.

또한 `recoildelay`가 존재하면 실제 recoil impulse가 적용되는 시점을 반영한다.

---

# 10. Spring Recovery

탄을 발사한 뒤 다음 탄이 발사될 때까지 Spring이 회복한다.

따라서 recoil 결과는 단순히:

```text
각 탄의 recoil 값을 누적
```

해서 계산하지 않는다.

실제 시간 흐름에 따라:

```text
이전 spring state
        ↓
시간 경과
        ↓
recovery
        ↓
다음 shot
        ↓
new impulse
```

가 반복되어야 한다.

같은 recoil stat이라도 firerate가 달라지면 shot 사이의 recovery 시간이 달라질 수 있으므로 이를 반드시 반영한다.

---

# 11. Recoil Layers

현재 확인된 주요 recoil layer:

```text
hipTranslation
hipTranslationRecovery

hipRotation
hipRotationRecovery

hipCameraBody
hipCameraBodyRecovery

hipCameraHead
hipCameraHeadRecovery

aimTranslation
aimTranslationRecovery

aimRotation
aimRotationRecovery

aimCameraBody
aimCameraBodyRecovery

aimCameraHead
aimCameraHeadRecovery
```

실제 사용 여부와 결합 방식은 제공된 소스를 기준으로 한다.

임의로 layer를 추가하거나 제거하지 않는다.

---

# 12. CFrame / Trajectory

최종 recoil state를 이용하여 실제 camera/weapon CFrame을 구성한다.

제공된 `PageLoadoutMenuDisplay.lua`의 CFrame 계산 흐름을 우선적인 참고 구현으로 사용한다.

최종적으로 각 shot에 대해 최소한 다음 정보를 얻을 수 있어야 한다.

```text
shot number
timestamp
recoil state
final rotation
final translation
look direction
impact point
```

3D trajectory는 최종 LookVector를 기반으로 계산한다.

단순히 X/Y recoil 숫자를 탄착점으로 사용하는 방식은 사용하지 않는다.

---

# 13. MVP 단계

## Phase 1 — WeaponData

목표:

```text
C25.json
    +
선택한 Attachment
    ↓
최종 WeaponData
```

를 생성한다.

### 성공 조건

C25에 Attachment 하나를 적용했을 때:

- modifier가 올바른 indexPath에 적용된다.
- Setter / Adder / trueMultiplier / relativeMultiplier가 올바르게 계산된다.
- 최종 `recoil` 데이터가 출력된다.

Debug 모드에서 각 modifier 적용 과정도 확인할 수 있어야 한다.

예:

```text
Path:
recoil.aimRotation.x[1][3]

Base:
35

Adders:
...

True Multipliers:
...

Relative Positive:
...

Relative Negative:
...

Final:
...
```

---

# 14. Phase 2 — Recoil Simulation

최종 WeaponData를 RecoilSpring에 입력한다.

우선 한 발만 simulation한다.

성공 조건:

```text
WeaponData
    ↓
RecoilSpring
    ↓
Impulse
    ↓
Spring state
```

가 정상적으로 계산된다.

---

# 15. Phase 3 — Automatic Fire

여러 발을 연속으로 발사한다.

예:

```text
C25
800 RPM
30 rounds
```

각 shot마다:

```text
timestamp
spring state
recoil impulse
final recoil
```

를 기록한다.

recoil recovery와 fire interval이 정상적으로 반영되는지 확인한다.

---

# 16. Phase 4 — 3D Visualization

한 개의 recoil trajectory를 3D 공간에서 표시한다.

최소 기능:

```text
30 shots
    ↓
각 shot의 impact point
    ↓
3D point/line visualization
```

UI 디자인은 중요하지 않다.

정확한 계산 결과를 확인할 수 있는 정도면 충분하다.

---

# 17. Phase 5 — Monte Carlo

단일 simulation이 정상적으로 검증된 이후 구현한다.

같은 weapon + attachment 조합을 여러 번 simulation한다.

예:

```text
1000 trials
30 shots / trial
```

각 trial마다 random recoil variation을 새로 생성한다.

최소한 다음 데이터를 계산할 수 있도록 한다.

```text
mean impact point
horizontal variance
vertical variance
overall variance
shot-to-shot variance
```

---

# 18. Attachment Comparison

여러 attachment 조합을 비교할 수 있도록 한다.

예:

```text
C25
├─ No attachment
├─ Compensator
├─ R2 Suppressor
├─ PBS-4 Suppressor
└─ ...
```

이후 여러 슬롯을 조합한다.

예:

```text
Barrel × Underbarrel × Other
```

단, 유효하지 않은 attachment 조합은 제외한다.

유효 조합 규칙은 제공된 weapon/attachment data와 게임 소스를 기준으로 판단한다.

---

# 19. MVP에서 하지 않을 것

다음은 초기 MVP 범위에서 제외한다.

- 완성도 높은 UI
- 계정/로그인
- 서버 기능
- 데이터베이스
- 온라인 공유
- 모든 PF 무기 지원
- 모든 Attachment 조합 자동 최적화
- 성능 최적화
- 실제 게임과 동일한 전체 무기 시스템 구현
- 사운드
- 애니메이션
- 캐릭터 movement
- 실제 Roblox 환경 구현

MVP의 목적은 **recoil 계산의 정확성 검증**이다.

---

# 20. 검증 원칙

각 단계마다 실제 PF 소스와 비교한다.

특히 다음 순서로 검증한다.

```text
1. 기본 C25 recoil 값
2. C25 + attachment modifier
3. 최종 recoil 값
4. single shot spring state
5. multiple shot spring state
6. final CFrame
7. impact point
```

숫자가 맞지 않을 경우 새로운 공식을 추측해서 추가하지 않는다.

먼저 다음을 확인한다.

```text
- modifier indexPath가 맞는가?
- Lua 1-based index 처리가 맞는가?
- modifier 적용 순서가 맞는가?
- spring state update timing이 맞는가?
- recoil delay가 적용됐는가?
- firerate가 정확한가?
- CFrame transformation 순서가 맞는가?
```

---

# 21. Debug / Development Mode

개발 중에는 최종 결과뿐 아니라 중간 결과를 확인할 수 있어야 한다.

예:

```text
[Weapon]
C25

[Attachments]
Barrel: Compensator
Underbarrel: None
Other: None

[Modifier]
recoil.aimCameraBody.x[1][3]

Base: ...
Adders: [...]
TrueMultipliers: [...]
RelativeMultipliers: [...]
Final: ...

[Recoil]
Shot: 1
Time: ...
Impulse: ...
Position: ...
Velocity: ...

[Trajectory]
LookVector: ...
Impact: ...
```

이 로그는 PF와의 값 비교를 위해 사용한다.

---

# 22. 구현 시 주의사항

### 1. 소스에 없는 계산을 임의로 만들지 않는다.

### 2. Recoil을 단일 숫자 또는 단일 Vector3로 단순화하지 않는다.

### 3. Mean과 variance를 동일한 값으로 취급하지 않는다.

### 4. Camera recoil과 weapon translation/rotation을 임의로 합치지 않는다.

### 5. Spring을 Euler 방식으로 대체하지 않는다.

### 6. Attachment modifier를 순차적으로 적용하지 않는다.

각 indexPath별로 modifier 종류를 모아서 제공된 계산식을 적용한다.

### 7. `indexPath`의 Lua 1-based indexing을 유지한다.

### 8. Attachment 조합 최적화보다 먼저 단일 attachment의 최종 WeaponData를 검증한다.

---

# 23. MVP 완료 조건

다음 조건을 모두 만족하면 MVP의 핵심 기능이 완성된 것으로 본다.

```text
[ ] C25.json을 읽을 수 있다.

[ ] Attachment JSON을 읽을 수 있다.

[ ] Attachment modifier를 indexPath에 따라 적용할 수 있다.

[ ] Setter / Adder / trueMultiplier / relativeMultiplier 계산이 정확하다.

[ ] C25 + Attachment의 최종 recoil data를 출력할 수 있다.

[ ] RecoilSpring을 재현할 수 있다.

[ ] Vector3Spring / Spring의 analytic calculation을 재현한다.

[ ] firerate와 shot timing을 반영한다.

[ ] recoil delay를 반영한다.

[ ] 여러 발의 recoil state를 계산할 수 있다.

[ ] 최종 CFrame으로 shot direction을 계산할 수 있다.

[ ] 3D impact point를 계산할 수 있다.

[ ] 동일한 weapon/attachment를 여러 번 Monte Carlo simulation할 수 있다.

[ ] shot-to-shot / horizontal / vertical / overall variance를 계산할 수 있다.
```

---

# 24. 개발 철학

이 프로젝트의 핵심은 "그럴듯한 반동 시뮬레이터"가 아니다.

**Phantom Forces의 실제 recoil 시스템을 재현하는 것**이다.

따라서 정확성 검증이 기능 추가보다 우선한다.

구현 중 PF 소스와 simulator의 결과가 다르면:

```text
PF source
    >
simulator assumption
```

의 우선순위를 가진다.

소스에서 확인할 수 없는 부분은 추측하지 않고 TODO로 남긴다.

MVP에서는 기능의 양보다 **C25 한 정 + 실제 Attachment modifier 한 개가 정확하게 계산되는 것**을 가장 중요한 성공 기준으로 한다.