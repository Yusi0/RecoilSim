# RecoilSim 프로젝트 진행 보고서 (PROGRESS_4.5.md)

**작성 일시**: 2026-10-05  
**프로젝트**: RecoilSim Recommendation System & Practicality Guard Full Audit  
**원칙**: Production 코드 동결 (100% 스크래치 시뮬레이션 및 데이터 감사)  
**참조 소스**: `WeaponsParser`, `WeaponCompiler`, `ModifierEngine`, `RecommendationEngine`, `Spring.lua`, `FirearmObject_Full.lua`, 292개 화기 JSON  

---

## 1. 개요 및 요약

`PROGRESS_4.md` 이후, 본 단계에서는 Phantom Forces의 물리 스프링 상수를 정밀 추적하고, 단순 반동 중심의 추천에서 발생하는 "실전성 파괴(Troll Build)" 문제를 해결하기 위한 **Practicality Guard (Balanced Hurdle)**, **Recoil ↔ Penalty Trade-off 분석**, **3대 추천 정책(Policy A, B, C) 비교**, **전체 292개 화기 전수 감사**, 그리고 **Conversion(컨버전) 아키텍처 감사**를 완주했습니다.

모든 분석은 프로덕션 코드를 수정하지 않고 스크래치 스크립트(`scripts/`)를 통해 수행되었으며, hard numerical data에 근거하여 의사결정 체계를 정립했습니다.

---

## 2. PF 소스 기반 스프링 감쇠비 및 시간 공식 확정

Roblox Studio 소스 감사(`Spring.lua`, `FirearmObject_Full.lua`)를 통해 각 스프링의 감쇠비($d$)와 95% 안착 시간 계수를 규명했습니다.

1. **ADS 조준 안착 시간 ($t_{\text{ADS}}$)**:
   - `sightaimspring`: $d = 1.0$ (임계 감쇠, Critically Damped)
   - 공식: $$t_{\text{ADS}} = \frac{4743.8645}{\text{aimspeed}}\text{ (ms)}$$
2. **스프린트 탈출 사격 지연 ($t_{\text{sprint}}$)**:
   - `sprintspring`: $d = 0.90$ (저감쇠, Underdamped, $u_{0.05} \approx 4.015$)
   - 공식: $$t_{\text{sprint}} = \frac{4015.0}{\text{sprintspeed}}\text{ (ms)}$$
3. **무기 스왑 시간 ($t_{\text{equip}}$)**:
   - `equipspring`: $d = 0.75$ (저감쇠, $u_{0.05} \approx 3.126$)
   - 공식: $$t_{\text{equip}} = \frac{3126.0}{\text{equipspeed}}\text{ (ms)}$$
4. **조준 보행 속도 ($v_{\text{aim\_walk}}$)**:
   - 공식: $$v_{\text{aim\_walk}} = \text{walkspeed} \times \text{aimwalkspeedmult}\text{ (studs/s)}$$
5. **살상 시간 ($\text{TTK}$)**:
   - 공식: $$\text{TTK} = (\lceil 100 / \text{damage0}\rceil - 1) \times \frac{60000}{\text{RPM}}\text{ (ms)}$$

---

## 3. Practicality Guard (Balanced Hurdle) 민감도 및 문턱 검증

### A. Threshold 설정
- **$\Delta\text{TTK} < 20.0\text{ ms}$** (60Hz 기준 1.2프레임: TTK 1프레임 초과 지연 차단)
- **$\Delta\text{ADS} < 35.0\text{ ms}$** (조준선 2프레임 초과 지연 차단)
- **$\Delta\text{Sprint} < 45.0\text{ ms}$** (스프린트 반응 2.7프레임 초과 지연 차단)
- **$\Delta\text{AimWalk} < 1.10\text{ studs/s}$** (조준 기동성 급감 차단)

### B. $\pm 10\%$ 문턱 취약성(Threshold Fragility) 감사
- 177개 후보 풀 중 $\pm 10\%$ 경계선에 걸린 후보는 **단 2개**(`M231 R2/T-Brake + Romanian`).
- 두 후보 모두 $\Delta\text{Sprint}$에서 이미 기준치를 $+15\sim +30\text{ ms}$ 초과하여 탈락이 확정되어 있었음.
- **결론: 문턱 미세 변동으로 합불이 뒤바뀌는 경계선 취약 후보(Fragile Edge Case)는 0개임이 검증됨.**

### C. 25개 탈락 후보 전수 감사
- C25 Muffler (7개): $\Delta\text{TTK} = +25.0\text{ ms}$ (1.5프레임 지연으로 100% 컷)
- M16A3 Muffler (7개): $\Delta\text{TTK} = +25.0\text{ ms}$ (100% 컷)
- M231 Oil Filter (6개): $\Delta\text{Sprint} = 55.8\sim 122.7\text{ ms}$ (3~7프레임 지연으로 100% 컷)
- M231 Romanian (5개): $\Delta\text{Sprint} = 60.2\sim 74.6\text{ ms}$ (100% 컷)
- 주력 부착물(Compensator, Muzzle Brake, T-Brake, Stubby, Angled, Folding)은 **단독 장착 시 탈락률 0%**.

---

## 4. Recoil Improvement vs Penalty Trade-off 및 Pareto 구조 규명

32-trial CRN Monte Carlo raw statistics ($R_{95}, \text{centered}R_{95}, \sigma_X, \sigma_Y$) 분석 결과:

1. **C25 Muffler의 수학적 지배(Dominated)**:
   - Muzzle Brake: $\Delta R_{95} = -0.59$, 페널티 0ms
   - Muffler: $\Delta R_{95} = -0.22$, $\Delta\text{TTK} = +25.0\text{ ms}$
   - **Muffler는 반동 개선량조차 Muzzle Brake의 절반 이하이므로, 페널티를 감수할 가치가 전혀 없는 완전 지배(Strictly Dominated) 후보임**.
2. **M231 `Muzzle Brake + Romanian Grip`의 한계 효용**:
   - `MB + Romanian`은 $\Delta R_{95} = -1.77$로 전체 1위 (5D Pareto Frontier 진입).
   - 그러나 `MB 단독`($\Delta R_{95} = -1.58$) 대비 추가 개선은 **불과 $0.19\text{ studs}$ ($1.7\%$)**.
   - 반면 치러야 하는 대가는 **스프린트 반응속도 $+60.2\text{ ms}$ (3.6프레임) 지연**.
   - **결론: Pareto Frontier에는 존재하나, $1.7\%$ 반동을 위해 3.6프레임 반응을 버리는 극단적 비대칭 거래임**.

---

## 5. 3대 추천 정책 (Policy A / B / C) 비교 결과

- **Policy A (Balanced Hurdle)**: 실전 페널티 가드 적용 후 Role Selection.
- **Policy B (Pareto Only)**: Hard Hurdle 없이 다차원 비지배 후보만으로 Role Selection.
- **Policy C (Pareto + Extreme Penalty Guard)**: Dominated 후보 선별 제거 $\rightarrow$ 실전 파괴 극단치 가드 $\rightarrow$ Pareto 속성 보존 및 플래그 추적.

| 총기 | Policy A (Balanced Hurdle) | Policy B (Pareto Only) | Policy C (Pareto + Guard) | 핵심 관찰 |
| :--- | :--- | :--- | :--- | :--- |
| **C25** | MB / MB+Angled / T-Brake | MB / MB+Angled / T-Brake | MB / MB+Angled / T-Brake | 세 정책 100% 동일 (Muffler 지배 탈락) |
| **AK-105** | MB / MB+Angled / Compensator | MB / MB+Angled / Compensator | MB / MB+Angled / Compensator | 세 정책 100% 동일 (페널티 부착물 없음) |
| **M16A3** | MB / MB+Angled / T-Brake | MB / MB+Angled / T-Brake | MB / MB+Angled / T-Brake | 세 정책 100% 동일 (T-Brake 압도) |
| **M231** | **MB / MB+Angled / Compensator** | **MB+Romanian / None / OilFilter+Romanian** ⚠️ | **MB / MB+Angled / Compensator** | Policy B에서 트롤 빌드가 1위 점령, Policy C에서 완벽 복원 |

---

## 6. 전체 292개 화기 / 69,519개 후보 전수 조사 결과

- **전체 화기 수**: 292개
- **전체 Candidate 수**: 69,519개
- **Guard 탈락 수**: **17,734개 (25.51%)** | 통과: **51,785개 (74.49%)**
- **Empty Pool (후보 0개)**: **0개 (0%)**
- **카테고리별 탈락률**:
  - LMG: 30.9% (기본 sprintspeed가 5~7로 낮아 스프린트 가드 민감)
  - DMR: 28.6%
  - PDW: 27.6%
  - BATTLE RIFLE: 25.8%
  - ASSAULT RIFLE: 25.1%
  - CARBINE: 22.9%
  - SNIPER RIFLE: 22.3%
  - SHOTGUN: 22.2%
  - PISTOLS: 15.8%
  - REVOLVERS: 2.2%
- **초고율 탈락 부착물 발견**:
  - `ARS Suppressor`: 90.3% 탈락 (전 무기군 기피)
  - `Osprey Suppressor`: 88.2% 탈락
  - `Oil Filter`: 84.7% 탈락
  - `Romanian Grip`: 72.7% 탈락 (헤비 화기군 장착 시 지연 폭증)

---

## 7. Conversion(컨버전) 지원 구조 및 Baseline 감사

1. **69,519개 풀 판정**: **컨버전은 100% 제외되어 있었음**.
   - 이유: `candidateSlots`가 `['Barrel', 'Underbarrel']`로 한정되어 있어, `Ammo`/`Other`에 있는 컨버전은 탐색 후보로 생성되지 않음.
2. **Context Baseline의 수학적 당위성 증명**:
   - M231 + Heavy Buffer (250 RPM, TTK 720.0ms):
     - **순정 Baseline(`{}`) 적용 시**: Heavy Buffer의 TTK 지연($+573.1\text{ms}$)이 배럴/그립 탓으로 오인되어, **순정 배럴을 포함한 전체 후보가 100% 탈락(Empty Pool)하는 치명적 왜곡 발생**.
     - **Context Baseline(`{ contextAttachments }`) 적용 시**: 컨버전이 만든 스탯이 0점 기준이 되어, 순수 배럴/그립의 영향만 분리 $\rightarrow$ 정상 배럴은 100% 통과하고 루마니안/오일필터만 정확히 차단.
3. **아키텍처 확장 방향**:
   - 컨버전은 배럴/그립과 함께 무차별 조합(Candidate)하지 않고, **유저가 먼저 구경(Context)을 지정한 뒤 해당 상태에서 최적 배럴/그립을 추천하는 2단계 파이프라인(Layer 0 $\rightarrow$ Layer 1/2)**으로 설계해야 함.

---

## 8. 향후 Production 적용 체크리스트

- [ ] `RecommendationEngine`에 Practicality Guard 도입 시 Baseline을 반드시 `contextAttachments`로 설정
- [ ] Policy C 구조(7D Pareto non-dominated 추적 + Practicality Guard 필터링) 반영
- [ ] M231 `MB + Romanian`처럼 Pareto Frontier에 있으나 Guard에 걸린 후보는 `FLAG_HURDLE` 메타데이터로 보존하여 UI 인사이트 뱃지로 노출
- [ ] 점사/단발 듀얼 RPM 총기(Mk12 SPR 등 문자열/배열 RPM)의 안전 파싱 처리
