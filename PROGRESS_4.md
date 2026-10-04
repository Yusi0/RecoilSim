# RecoilSim 프로젝트 진행 보고서 (PROGRESS_4.md)

**작성 일시**: 2026-10-04  
**프로젝트**: RecoilSim Recommendation System & Weapon Gameplay Profile Verification  
**분석 원칙**: Production 코드 수정 0건 (분석 및 물리 메커니즘 검증 전용)  
**참조 소스**: `weapons.json`, `ContentUtils.ts`, `FirearmObject_Full.lua`, `Spring.lua`, `PlayerStatusClient.lua`  

---

## 1. 개요 및 연구 배경

기존 RecoilSim 추천 시스템은 Monte Carlo 시뮬레이션 기반 반동 최적화에 집중되어 있어, Romanian Grip이나 Muffler처럼 심각한 핸들링/기동성/연사력 패널티를 가진 부착물이 단순 반동 개선율만으로 추천되는 실전성 왜곡 문제가 존재했습니다.

본 단계에서는 임의의 가중합(Composite Score)이나 근거 없는 패널티 티어링을 지양하고, **"부착물 패널티가 실제 총기의 게임플레이 스탯(시간 ms, 속도 studs/s, TTK ms)에 얼마나 치명적인 영향을 미치는가?"**를 Phantom Forces 클라이언트 물리 엔진 수준에서 엄밀히 규명하고 8개 대표 무기로 검증을 완료했습니다.

---

## 2. PF 소스 코드 기반 물리 변환 메커니즘 확립

Phantom Forces의 스프링 물리 엔진(`Spring.lua`)과 총기 객체(`FirearmObject_Full.lua`)의 임계 감쇠 스프링($d=1$) 공식을 추적하여, JSON modifier를 실시간 게임플레이 물리량으로 변환하는 수식을 도출했습니다.

1. **ADS 정착 시간 ($t_{\text{ADS}}$)**:
   - 스프링 속도 $s = \text{aimspeed}$. 95% 정착 기준:
     $$t_{\text{ADS}} \approx \frac{4743.9}{\text{aimspeed}}\text{ (ms)}$$
2. **무기 교체 스왑 시간 ($t_{\text{equip}}$)**:
   - 스프링 속도 $s = \text{equipspeed}$:
     $$t_{\text{equip}} \approx \frac{4743.9}{\text{equipspeed}}\text{ (ms)}$$
3. **스프린트 탈출 사격 지연 ($t_{\text{sprint}}$)**:
   - 스프링 속도 $s = \text{sprintspeed}$:
     $$t_{\text{sprint}} \approx \frac{4743.9}{\text{sprintspeed}}\text{ (ms)}$$
4. **조준 횡이동 회피 속도 ($v_{\text{aim\_walk}}$)**:
   $$v_{\text{aim\_walk}} = \text{walkspeed} \times \text{aimwalkspeedmult}\text{ (studs/s)}$$
5. **발사 간격 및 살상 시간 ($\Delta t_{\text{shot}}$, $\text{TTK}$)**:
   $$\Delta t_{\text{shot}} = \frac{60000}{\text{RPM}}\text{ (ms)}, \quad \text{TTK} = (\text{BTK} - 1) \times \Delta t_{\text{shot}}\text{ (ms)}$$
6. **지속 사격 가능 시간 ($T_{\text{dump}}$)**:
   $$T_{\text{dump}} = \frac{\text{magsize}}{\text{RPM}} \times 60\text{ (sec)}$$

---

## 3. 핵심 발견: "Modifier %"와 "실제 체감 스탯"의 비선형 왜곡

동일한 백분율 패널티라도 총기의 기본 베이스 스탯에 따라 실제 체감 피해가 극단적으로 갈림을 실측했습니다.

1. **연사력 패널티의 역수 왜곡 (Muffler -10% RPM)**:
   - **AK-105 (600 RPM)**: 발사 간격 **+11.1 ms 지연**, 4-Shot TTK **+33.3 ms 지연 (2프레임 손실)** $\rightarrow$ 살상력 치명적 파괴.
   - **M231 (1225 RPM)**: 발사 간격 **+5.4 ms 지연**, 4-Shot TTK **+16.3 ms 지연 (1프레임 미만)** $\rightarrow$ 감수 가능한 수준.
   - **결론**: 저연사 총기일수록 RPM 감소 패널티의 실전 피해가 2배 이상 큼.
2. **조준 지연의 기저 스탯 누적 왜곡 (Romanian -10% aimspeed)**:
   - **M16A3 (base 15.0)**: ADS 시간 **+31.6 ms 지연** ($316 \rightarrow 348\text{ ms}$).
   - **AK-105 (base 18.0)**: ADS 시간 **+26.4 ms 지연** ($263 \rightarrow 290\text{ ms}$).
   - 기동성이 이미 둔중한 총기에 조준 패널티를 장착하면 절대 지연 시간이 가중됨.
3. **M231에서의 MB + Romanian 실측**:
   - MB 단독 대비 Romanian이 추가하는 순수 이득: Overall R95 **겨우 2.5%p 추가 개선 (0.14 studs)**.
   - Romanian이 추가하는 순수 비용: ADS **+27.9 ms**, Sprint **+71.2 ms 지연 (4.3프레임 동안 사격 불가)**.
   - **결론**: 한계 효용(Marginal Utility) 평가 시 MB + Romanian은 체계적으로 탈락되어야 마땅함.

---

## 4. 8개 대표 무기 확장 검증 결과

무기 분류(SMG/AR/LMG 등) 라벨을 일체 배제하고, 순수 Weapon Stats 조합만으로 8개 무기(`C25, AK-105, M16A3, M231, MP5K, UMP45, M249, PKP`)의 특성이 분리됨을 입증했습니다.

| 무기명 | ADS (ms) | Sprint (ms) | 조준이동 (s/s) | 근거리 TTK | 지속사격 (s) | 빈탄장전 (s) | Base R95 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MP5K** | 279.1 | 316.3 | **12.00** | 200.0 ms | 2.00 | 2.60 | 1.84 |
| **UMP45** | 296.5 | 338.9 | **12.00** | 200.0 ms | 2.50 | 3.00 | **1.48** |
| **M231** | 279.1 | 338.9 | 10.50 | **98.0 ms** | **1.47** | 4.20 | **5.68** |
| **C25** | 287.5 | 338.9 | 9.80 | 225.0 ms | 2.25 | 2.80 | 2.06 |
| **AK-105** | **263.5** | 338.9 | 10.15 | 300.0 ms | 3.00 | 3.10 | 1.94 |
| **M16A3** | 316.3 | 338.9 | 9.80 | 225.0 ms | 2.25 | 3.00 | 2.08 |
| **M249** | 412.5 | 395.3 | 7.80 | 225.0 ms | **7.50** | 7.90 | 2.89 |
| **PKP** | **431.3** | **431.3** | **6.00** | 218.2 ms | **10.91** | **10.20** | 4.12 |

- **신규 발견 축**: 기존 4개 무기에서는 드러나지 않던 **Sustained Fire($T_{\text{dump}}$)**와 **Vulnerability($t_{\text{reload}}$)**가 LMG(M249, PKP)의 포함으로 필수적인 독립 차원임이 입증됨.

---

## 5. Feature 관계 분석 및 3대 그룹 분류

14개 후보 feature에 대해 물리적 독립성과 중복성을 검증하여 A, B, C 그룹으로 최종 정립했습니다.

### [그룹 A: 반드시 독립적으로 유지 (10개 필수 물리 Feature)]
1. `ADS Latency` ($t_{\text{ADS}}$ ms)
2. `Sprint Latency` ($t_{\text{sprint}}$ ms)
3. `Aim-walk Speed` ($v_{\text{aim\_walk}}$ studs/s)
4. `Close TTK` ($t_{\text{close}}$ ms)
5. `Long TTK` ($t_{\text{long}}$ ms)
6. `Sustained Fire` ($T_{\text{dump}}$ sec)
7. `Empty Reload` ($t_{\text{reload\_empty}}$ sec)
8. `Base R95 Recoil` (studs)
9. `Vertical Recoil Rise Y` (studs)
10. `Horizontal Recoil Width X` (studs)

### [그룹 B: 다른 Feature의 파생값으로 충분 (4개 Redundant Feature)]
- `BTK close / long`: 데미지 수치로부터 $\lceil 100/\text{damage}\rceil$로 완전 도출됨.
- `Tactical Reload`: Empty Reload와 $r=0.994$로 선형 비례하므로 Empty Reload로 대표 가능.
- `Base Walkspeed`: Aim-walk speed와 결합되어 이미 흡수됨.

### [그룹 C: 현재 데이터만으로 판단 불가 (엔진 외부 요인)]
- `교전 거리별 실제 가중치`: 맵별 교전 거리 분포 데이터 필요.
- `인간 반동 제어 보정비`: 플레이어의 마우스 하향 드래그 보정 능력에 따른 수직/수평 상대 가치.

---

## 6. 결론 및 향후 아키텍처 원칙

1. **임의의 Composite Score 전면 배제**: 단일 점수로 가중합산하지 않고, 다차원 독립 제약(Multi-Axis Independent Hurdle)을 유지.
2. **동적 물리 실현치 기반 평가**: Modifier %가 아닌, 무기 베이스 스탯과 결합하여 실제로 발생한 절대 밀리초($\Delta t\text{ ms}$)와 프레임 지연을 기준으로 비용을 산정.
3. **한계 효용(Marginal Benefit) 원칙 적용**: 조합 부착물은 이전 단계 대비 순수 추가 패널티와 순수 추가 반동 개선량을 비교하여 미세 개선을 위해 핸들링을 낭비하는 조합을 원천 배제.
