다음 단계로 Phantom Forces의 RecoilSprings 시스템을 구현해라.

중요:
- 이 작업에서는 RecoilSprings만 구현한다.
- FirearmObject의 발사 로직, 카메라 시스템, Three.js 시각화, 탄도/탄낙차는 아직 구현하지 않는다.
- 기존 Spring.ts / Vector3Spring.ts / ModifierEngine.ts / WeaponCompiler.ts의 동작을 불필요하게 수정하지 않는다.
- 구현 전에 반드시 제공된 원본 Lua를 분석하고, 원본과 TypeScript의 대응 관계를 먼저 정리한 뒤 구현한다.
- PF 원본의 동작을 "더 깔끔하게" 바꾸지 말고, 실제 수치 결과가 동일하도록 재현한다.

기준 원본:
- RecoilSprings.lua
- Vector3Spring.lua
- Spring.lua
- 필요하면 ContentUtils.lua / FirearmObject_Recoil.lua의 호출부를 참고한다.

목표 구조:

WeaponData recoil profile
    ↓
RecoilSprings
    ↓
여러 recoil layer
    ↓
각 layer의 Vector3Spring
    ↓
각 Vector3Spring의 x/y/z
    ↓
getP()로 모든 layer의 position 합산

반드시 확인할 내용:

1. RecoilSprings.new()
- 생성 시 어떤 인자를 받는지
- hip / aim 파라미터를 어떻게 저장하는지
- `_vector3Springs`의 실제 구조를 정확히 확인한다.
- 각 recoil layer가 런타임에서 어떻게 Vector3Spring과 대응되는지 확인한다.

2. recoil profile 구조
PF recoil 데이터의 각 layer가:

[damping, speed, impulseMean, impulseVariance]

형태라는 점을 반영한다.

예:
[0.3, 35, -0.7, 0.2]

여기서:
- [1] = damping ratio d
- [2] = natural frequency / speed s
- [3] = impulse mean
- [4] = impulse variance

`[1]`은 recoil layer index이고, `[3]`/`[4]`는 해당 layer의 impulse parameter라는 기존 분석과 일관되게 처리한다.

3. setAim()
원본 Lua의 setAim()을 정확히 분석해서:
- hip/aim 상태 선택
- 각 Vector3Spring의 damping/speed 파라미터 설정
- 파라미터 변경 시 Vector3Spring이 현재 상태를 어떻게 유지하는지
- 기존 상태를 어떻게 보존하는지

를 그대로 재현한다.

특히 Vector3Spring.ts에서 이미 구현한 상태 보존/시간 계산과 충돌하지 않는지 확인한다.

4. applyImpulse()
원본 Lua를 기준으로 정확히 구현한다.

반드시 확인:
- applyImpulse(cframe, multiplier)의 인자 의미
- 각 recoil layer에서 mean/variance를 어떻게 읽는지
- random impulse가 정확히 어떻게 생성되는지

원본 공식:
mean + variance * 2 * math.random() - variance

즉:
mean + uniform(-variance, +variance)

- 생성된 Vector3 impulse가 CFrame에 의해 어떻게 변환되는지
- multiplier가 언제 적용되는지
- 각 layer의 Vector3Spring velocity에 어떻게 더해지는지
- applyImpulse 전에 setAim(currentAimState)가 호출되는지
- `_lastImpulseTime`이 언제 갱신되는지

를 정확히 확인한다.

5. getP()
원본 Lua를 그대로 분석해서 구현한다.

특히:
- `_vector3Springs`의 각 layer position을 어떻게 합산하는지
- 반환값이 Vector3인지
- layer가 여러 개일 때 합산 순서가 결과에 영향을 주는지

를 확인하고 테스트한다.

6. step()
원본의 recovery 처리 로직을 정확히 구현한다.

특히 가장 중요:
- `_lastImpulseTime`
- recoil delay
- layer/axis별 delay
- 정상 damping/speed
- recovery damping/speed
- recovery 파라미터로 전환되는 정확한 조건

을 확인한다.

"delay가 지나면 그냥 일정 시간 후 원점으로 돌아간다"처럼 단순화하지 말고,
원본이 실제로 damping/speed를 어떻게 전환하는지 그대로 재현한다.

7. setSingleAxisParameters / setVectorParameters
원본에 존재한다면 각각의 역할과:
- damping
- speed
- mean
- variance
등 어떤 값을 변경하는지 정확히 확인한다.

특히 축별 파라미터와 Vector3Spring 전체 파라미터를 혼동하지 않는다.

8. CFrame 처리
applyImpulse의 cframe 변환을 확인한다.

현재 FirearmObject의 recoil 호출부에서는 identity CFrame(nil)이 들어오는 경로가 확인되어 있지만,
RecoilSprings 자체는 원본 API 의미를 보존해야 한다.

따라서:
- nil/identity 처리
- CFrame × Vector3 변환
- multiplier 적용 순서

를 원본 기준으로 구현한다.

9. 랜덤성
Math.random()을 직접 사용하는 대신 RecoilSprings 내부에서 RNG를 주입할 수 있는 구조를 고려한다.

목표:
- production mode에서는 random RNG 사용 가능
- test에서는 seeded/deterministic RNG 사용 가능

단, 이것 때문에 PF의 실제 계산 순서를 변경하지 않는다.

10. 테스트
기존 테스트처럼 독립 reference 검증을 만든다.

`ModifierEngine.ts`처럼 구현 코드를 그대로 이용해서 expected 값을 생성하지 않는다.

새로운:
`scripts/generate_recoilsprings_reference.js`

를 만들어 원본 Lua 알고리즘을 기준으로 독립 reference를 생성한다.

최소한 다음을 검증한다.

A. 단일 layer 생성
- C25의 실제 recoil profile 사용

B. 다중 layer
- C25 `aimCameraBody.x`처럼 2개 이상의 layer를 사용하는 실제 데이터 사용

C. applyImpulse
- deterministic RNG를 사용해서 mean/variance 결과 검증
- velocity 변화 검증

D. getP
- 여러 layer의 position 합산 검증

E. setAim
- hip → aim
- aim → hip
- damping/speed 변경 후 상태 연속성 검증

F. recovery delay
- delay 이전에는 recovery parameter로 전환되지 않음
- delay 이후에는 원본대로 recovery parameter가 적용되는지 검증

G. 여러 번의 impulse
- 빠르게 연속 impulse가 들어오는 경우 여러 layer의 spring 상태가 어떻게 누적되는지 검증

H. Vector3
- x/y/z가 각각 독립적으로 계산되면서 동일 layer의 Vector3Spring으로 묶이는 구조를 검증

중요:
테스트에서는 `RecoilSprings.ts`의 결과를 그대로 expected 값으로 사용하지 않는다.
반드시 독립적으로 계산한 reference와 비교한다.

11. PF Source 주석
새 파일 상단에 다음과 같은 형태로 원본 출처를 명시한다.

```ts
// PF Source:
// ClientModules.Weapons.RecoilSprings.lua
// SharedModules.Math.Vector3Spring.lua
```

각 핵심 함수에도 가능하면 원본 함수명을 주석으로 남긴다.

12. 완료 후 보고 형식

작업 완료 후 다음을 보고한다.

- RecoilSprings.lua의 핵심 동작 요약
- TypeScript 구현 파일 목록
- 원본 Lua 함수 ↔ TypeScript 함수 대응표
- layer ↔ Vector3Spring 구조 설명
- applyImpulse 동작
- setAim 동작
- step/recovery 동작
- 독립 reference 생성 방식
- 테스트 개수와 결과
- 원본과 아직 확정하지 못한 부분이 있다면 반드시 별도로 표시

특히 "구현 완료"라고만 하지 말고,
원본 Lua에서 직접 확인한 사실 / 구현상 해석 / 아직 미확인인 부분을 구분해서 보고해라.