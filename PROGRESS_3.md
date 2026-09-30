# RecoilSim 프로젝트 진행 보고서 (PROGRESS_3.md)

**작성 일시**: 2026-10-01  
**프로젝트**: RecoilSim 3D Interactive Simulator & Spatial Alignment Verification  
**테스트 상태**: 18개 Vitest 테스트 스위트 / 109개 테스트 100% 통과 (PASS)  
**빌드 상태**: TypeScript `tsc --noEmit` PASS / Vitest Test Suite PASS  

---

## 1. 개요 및 최근 주요 성과

본 단계에서는 **Phantom Forces (PF) 원본 시스템 스터드 단위 검증**, **AdvancedStats Recoil Simulator 투영 좌표계 및 시각화 스케일 소스코드 Audit**, **탄창 단위 동적 색상 시각화 시스템 구축**, 그리고 **다중 무기 프리셋 확장(C25, AK-105, M231, M16A3)**을 완료했습니다.

기존 검증된 `SimulationEngine` 물리 코어(결정론적 스프링 연산 및 가상시간 이벤트 루프)를 100% 보존하면서, 렌더링/시각화 영역의 스케일 수식을 엄격히 산출하고 사용자 경험(UX)을 확장했습니다.

---

## 2. PF 단위 및 렌더링 투영 파이프라인 Audit 결과

### 1) PF Studs 거리 단위 소스 코드 검증
- **소스 확인 (`HudKillfeedInterface.lua` L77)**:
  ```lua
  TextKillfeed.TextDistance.Text = "Dist: " .. v10.oneDecimal(p3.direction.Magnitude) .. " studs"
  ```
- **결론**: PF 킬로그 및 3D 공간 거리 계산에 사용되는 1 Stud는 로블록스 엔진 기본 3D 공간 단위(`Vector3.Magnitude`)와 **1:1로 완전히 동일**합니다.
- **현실 단위 환산 기준**:
  - $1\text{ stud} = 0.28\text{ m} = 28\text{ cm} \approx 0.9186\text{ ft}$
  - $1\text{ m} \approx 3.571\text{ studs}$

### 2) AdvancedStats Viewport & Projection Pipeline Audit
- **소스 확인 (`PageLoadoutMenuDisplayWeaponAdvancedStats.lua`)**:
  - **Camera**: ViewportFrame 전용 독립 `Camera` (`CameraType = Scriptable`, `FOV = 90°` default).
  - **Dynamic FOV 수식**: $\text{FOV}_{\text{deg}} = 2 \cdot \arctan\left(\frac{1}{e^{v43.p}}\right) \cdot \frac{180}{\pi}$ (ADS Zoom 시 $\text{zoom}$에 맞춰 동적 조절).
  - **$Z=10$ Target Plane 및 `* 80` 오프셋의 정체**:
    - 총기 위치 오프셋 $p = (0, -0.5, -1.2)$에서 전방 $10\text{ studs}$ 거리의 $Z=10$ Target Plane에 사격 교차점을 산출.
    - `* 80`은 Viewport Size나 FOV에서 유도된 값이 아니며, $Z=10$ 평면상의 $1\text{ stud}$ 이탈량을 2D UI 픽셀로 변환하기 위해 하드코딩된 **고정 시각화 스케일 팩터 ($80\text{ px / stud}$)**임.

### 3) RecoilSim Three.js Projection과의 수학적 비교
- **초점 거리 스케일 상율 비교**:
  - AdvancedStats 고정 스케일: $K_{\text{AS}} = 80 \times (10 - (-1.2)) = \mathbf{896\text{ pixels}}$
  - RecoilSim Three.js 원근 카메라 ($H = 1080\text{ px}$, ADS FOV $48^\circ$): $K_{\text{RS}} = \frac{1080}{2 \cdot \tan(24^\circ)} \approx \mathbf{1212.86\text{ pixels}}$
- **수학적 판정 (Conclusion A)**:
  - 두 시각화 방식 모두 3D 방향 유닛 벡터 $\vec{D}$를 평면에 투영하는 **선형 평면 투영(Linear Planar Projection)**으로 대상 물리량이 100% 동일함.
  - Scale Ratio ($\frac{\text{RecoilSim}}{\text{AdvancedStats}} = \frac{K_{\text{RS}}}{K_{\text{AS}}} \approx 1.35365$)는 모든 반동 각도에 대해 **100% 일정하며 비선형 왜곡이 없음**을 수학적으로 증명 완료.

---

## 3. 신규 구현 기능 상세

| 카테고리 | 구현 기능 및 설명 |
| :--- | :--- |
| **Magazine-Based Coloring** | 사격 오프셋 `shot.fireCount` 및 동적 `magsize` 기반 탄창 인덱스 $\left\lfloor \frac{\text{fireCount}}{\text{magsize}} \right\rfloor$ 동적 산출. 동일 탄창 사격 시 일시정지 후 재개하더라도 같은 색상 유지. |
| **Dynamic Magsize** | 하드코딩된 수치(30 등) 제거. 컴파일된 무기 데이터의 `compiledWeaponData.magsize`를 직접 참조하여 모든 무기 용량에 유연하게 대응. |
| **Multi-Weapon Presets** | C25외 주요 PF 총기 프리셋 4종 동적 로더 및 Selector 추가 (`C25`, `AK-105`, `M231`, `M16A3`). |
| **UI Selector** | `ControlPanel.tsx` 내 버튼 원클릭으로 총기 변경 및 연사력(RPM), 탄창 용량(Magsize) 실시간 로딩. |
| **Memory Cleanup** | `FPSCanvas.tsx` 언마운트 cleanup 로직 보완으로 THREE.js 지오메트리 및 메티리얼 자원 안전 해제. |

---

## 4. 등록 및 컴파일 완료된 예시 총기 목록

1. **C25** (800 RPM, 30발, 카빈)
2. **AK-105** (600 RPM, 30발, 카빈/돌격소총)
3. **M231** (1225 RPM, 30발, 고연사 FPW)
4. **M16A3** (800 RPM, 30발, 저반동 돌격소총)

---

## 5. 빌드 및 테스트 검증 결과

### 1) Vitest 단위 테스트 수트 (`npx vitest run --globals`)
- **결과**: `18 Test Files passed`, `109 Tests passed` (100% 통과)
- **검증 범위**: Spring, Vector3Spring, RecoilSprings, FirearmObject, MainCameraObject, SimulationEngine, ModifierEngine, WeaponCompiler, WeaponsParser, C25 Golden Simulation, Three.js Renderer Diagnostic 등 전체 수트 통과.

### 2) 개발 서버 런타임 (`npm run dev`)
- **결과**: Vite 개발 서버 오류 0건, 브라우저 3D Viewport 및 탄창 단위 시각화 반응형 정상 작동.

---

## 6. 향후 과제 (Roadmap)

1. **2D 탄착군 캔버스 히트맵 (2D Target Dispersion Map)**: $Z=10\text{m} / 50\text{m}$ 표적지 2D 캔버스 그래픽 렌더링.
2. **총기 파츠(Attachment) 실시간 세팅 및 반동 오차 비교기**: 부품 장착 전/후 반동 시뮬레이션 비교.
