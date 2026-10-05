# Phantom Forces 11.17 Canonical Reconstruction & RecoilSim Integration Guide

**문서 파일명**: `11_17_CANONICAL_DATASET_GUIDE.md`  
**버전**: PF 11.16 (VERIFIED) ↔ PF 11.17 (PROVISIONAL)  
**작성 일시**: 2026-10-05  

---

## 1. 개요 및 파이프라인 아키텍처

본 문서는 Phantom Forces 11.17 업데이트(Fall 2026 Update)에 대응하여, 현재 확보된 증거(11.17 API, 공식 패치노트, 11.16 인게임 덤프)만을 엄격하게 교차검증하여 **증거 기반 복원(Evidence-based Reconstruction)**을 수행하고, 이를 RecoilSim에서 즉시 시뮬레이션할 수 있는 **Canonical Dataset**으로 변환한 전체 내역을 기술합니다.

```text
[Raw / API]
  - data/raw/weapons.json (11.16 API)
  - data/raw/11.17weapons.json (11.17 API)
  - 11.17.0.txt (공식 패치노트)
  - data/in-game-modules/ (11.16 In-game Dump)
       ↓
[Evidence-based Reconstruction] (scripts/build_canonical_datasets.js)
  - SAFE_TO_MIGRATE (28개 화기 + 8개 신규 화기 + 26개 부착물)
  - HOLD_FOR_VERIFICATION (반동 스프링, 기동성 스탯)
  - API_ONLY_RESTORATION (37개 부착물 + 212개 설명문 복구)
       ↓
[Canonical Datasets]
  - data/canonical/11.16/ (100% VERIFIED Baseline)
  - data/canonical/11.17-provisional/ (PROVISIONAL Dataset)
       ↓
[RecoilSim Simulation & Regression]
  - 11.16 Regression Pass (217/217 Checks 100% Pass)
  - 11.17 Provisional Simulation (K2 TTK 219.5ms → 160.0ms 등)
       ↓
[Future Re-Verification Engine] (scripts/verify_against_future_dump.js)
  - 향후 11.17 Place Dump 확보 시 자동 MATCH / CONFLICT 판별
```

---

## 2. 16대 최종 산출물 내역

### [Part 1: Reconstruction]

#### 1. 11.17 Provisional Dataset
- **저장 위치**: [data/canonical/11.17-provisional/](file:///c:/Users/choez/OneDrive/바탕%20화면/RecoilSim/data/canonical/11.17-provisional/)
  - `weapons.json`: 424개 화기 정규화 정의
  - `attachments.json`: 4,710개 부착물 변체 정규화 정의
  - `weapon_details/`: 424개 화기별 물리 스탯 및 16개 반동 스프링 (출처 태그 부착)
  - `metadata.json`: 마이그레이션 메타데이터 및 분류 통계

#### 2. 변경/신설된 파일 목록
- **빌더 엔진**: `scripts/build_canonical_datasets.js`
- **회귀 검증기**: `scripts/verify_11_16_canonical_regression.js`
- **시뮬레이션 비교기**: `scripts/verify_11_17_provisional_simulation.js`
- **매핑 커버리지 리포트**: `MAPPING_COVERAGE_REPORT.md`
- **향후 재검증 엔진**: `scripts/verify_against_future_dump.js`
- **11.16 스냅샷**: `data/snapshots/11.16/` 및 `data/canonical/11.16/`
- **11.17 스냅샷**: `data/snapshots/11.17-provisional/` 및 `data/canonical/11.17-provisional/`

#### 3. 실제로 증거로 확정 가능한 11.17 변경사항 (`CONFIRMED`)
1. **신규 화기 8종**: `REGULATOR` (DMR), `SPEAR LT` (AR), `MCX VIRTUS` (Carbine), `MCX RATTLER` (PDW), `CUTLASS` (Melee), `HK416A5` (Rialag 헌정), `ORIGIN 12`, `TITANIUM FAL`.
2. **밸런스 재조정 화기 28종**:
   - `K2`: 데미지0 32→34, 데미지1 20→23, 사거리0 90→50, 사거리1 150→140, RPM 820→750.
   - `JURY`: 360 RPM 더블액션 모드, 사거리0 35→45, 헤드배수 x2.0.
   - `HARDBALLER`: RPM 500→560 버프.
   - `G36 패밀리`: AR36, AR36K, AR36C, IAR36 명칭 및 데미지/사거리 전면 개편.
   - `SPAS-12`: 장탄수 8→7, 펌프액션 부착물 제거.
   - `KAC SRR`, `MCX SPEAR`, `KRISS VECTOR`, `BEOWULF ECR` 등 28종 전수.
3. **핵심 부착물 26종**:
   - `Stubby Grip`: 조준속도 페널티 삭제, 숄더킥 -20%, 회전난수 -8%, 캠바디 -15%.
   - `Angled Grip`: 조준속도 +5% 가속, 질주전환 +8%.
   - `Green Laser`: 수직/수평 회복 버프 (+5%/+10%), 스왑속도 -3.5% 페널티.
   - `Retract Stock / Extend Stock`: 수평 반동 페널티 삭제.
   - `XM155 'Silent'`, `Flechette`, `Birdshot` 등.

#### 4. 11.16에서 복구된 API 누락 데이터 (`API_ONLY_RESTORATION`)
- `C8NLD`의 광학 조준경 29종 모디파이어 (11.16 In-game과 100% 동일 복구).
- `KAC SRR` Ballistics Tracker, `SA58 SPR` 레이저 모디파이어 8종 복구.
- 212개 부착물의 파편화된 `infolist` 배열 → 온전한 `info` 문자열 복구.

#### 5. 11.17 API에만 존재하고 실제 게임에서 미검증된 데이터
- 커뮤니티 패치노트 요약본에 기재되지 않은 154개 미세 부착물 모디파이어 변동 (예: `Long Barrel (DMR)`, `AR 20 Tact Conversion` 등).

#### 6. 11.17에서 현재 알 수 없는 데이터 (`UNCONFIRMED`)
- **292개 화기 전체의 16개 반동 스프링 상수**: 11.17 API에 100% 누락.
- **화기 기본 기동성 5종 세트 (`sprintspeed`, `equipspeed`, `aimspeed` 등)**.
- **글로벌 상속 부착물(C25 등)**의 11.17 인게임 전역 변경 여부.

#### 7. 3대 분류 결과 집계
- `SAFE_TO_MIGRATE`: 화기 36종 (신규 8 + 조정 28), 부착물 26종.
- `HOLD_FOR_VERIFICATION`: 반동 스프링 292개 화기, 기동성 스탯, 글로벌 상속 부착물 633종.
- `API_ONLY_RESTORATION`: 37건의 API 덤프 버그 복구 부착물.

---

### [Part 2: RecoilSim Integration]

#### 8. 11.16 Canonical RecoilSim Dataset
- **위치**: [data/canonical/11.16/](file:///c:/Users/choez/OneDrive/바탕%20화면/RecoilSim/data/canonical/11.16/)
- 416개 화기 (292개 반동 화기 포함), 3,971개 부착물, 100% VERIFIED Baseline.

#### 9. 11.17 Provisional RecoilSim Dataset
- **위치**: [data/canonical/11.17-provisional/](file:///c:/Users/choez/OneDrive/바탕%20화면/RecoilSim/data/canonical/11.17-provisional/)
- 424개 화기, 4,710개 부착물.
- 반동 스프링: 기존 292개 화기는 11.16 검증값 fallback 상속(`INHERITED_FROM_11_16`), 신규 8개 화기는 `null`(`UNVERIFIED_11_17`) 처리하여 **0개의 임의 추정값도 생성하지 않음**.

#### 10. Source → RecoilSim Field Mapping
- 전체 51개 필드에 대해 `MAPPED`, `TRANSFORMED`, `DERIVED`, `IGNORED`, `MISSING`, `UNVERIFIED`로 100% 분류 완료.

#### 11. Normalization / Transformation Script
- `scripts/build_canonical_datasets.js` (멱등성 보장, 단일 명령으로 11.16 및 11.17 동시 생성).

#### 12. Mapping Coverage Report
- [MAPPING_COVERAGE_REPORT.md](file:///c:/Users/choez/OneDrive/바탕%20화면/RecoilSim/MAPPING_COVERAGE_REPORT.md) 생성 완료 (누락/침묵 폐기 필드 0건).

#### 13. 11.16 Regression Comparison Report
- `scripts/verify_11_16_canonical_regression.js` 실행 결과: **217 / 217 Checks 100% Pass** (기존 RecoilSim 물리 시뮬레이션 결과와 100% 오차 0.000ms 일치).

#### 14. 11.17 Provisional Simulation Data Report
- `scripts/verify_11_17_provisional_simulation.js` 실행 결과:
  - `K2`: 데미지0 32→34 버프로 근거리 BTK 4→3발 감소, **TTK 219.51ms → 160.00ms (-59.51ms) 대폭 단축**.
  - `HARDBALLER`: RPM 500→560 버프로 **TTK 240.00ms → 214.29ms 단축**.
  - `JURY`: 360 RPM 더블액션으로 **TTK 200.00ms → 166.67ms 단축**.
  - `REGULATOR`: 신규 DMR (데미지 44, 사거리 50-200, RPM 650, TTK 184.62ms).
  - `SPEAR LT`: 신규 AR (데미지 38, 사거리 50-155, RPM 850, TTK 141.18ms).

---

### [Part 3: Future Verification]

#### 15. 향후 11.17 Place Dump 확보 시 자동 재검증 항목
1. 신규 8개 화기의 16개 반동 스프링 및 기동성 스탯
2. M7 NGSW, VSS VINTOREZ 등 패치노트 언급 화기의 반동 스프링 변경분
3. 글로벌 `AttachmentDatabase` 상속 부착물(Stubby/Angled Grip)의 전역 수치
4. 미복구 컨버전 4종(AR 7.62x39, AUG 9MM, Saiga 545, SVK12E 7.62)

#### 16. Provisional → Verified / Conflicted 자동 판별 엔진
- **실행 스크립트**: `scripts/verify_against_future_dump.js`
- **구동 명령**:
  ```bash
  node scripts/verify_against_future_dump.js --weapon-dump ./future_11_17_weapons.json --attachment-dump ./future_11_17_attachments.json
  ```
- **판별 원리**:
  - `MATCH` → 자동으로 `VERIFIED_11_17` 승격
  - `CONFLICT` → 차이점 JSON 패치 생성 및 `CONFLICTED_REQUIRES_PATCH` 보고
