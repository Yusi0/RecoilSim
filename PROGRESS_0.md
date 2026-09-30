# RecoilSim 프로젝트 진행 보고서 (Progress Report)

## 1. 개요 및 목적
Phantom Forces 무기 수치 및 반동(Recoil) 시뮬레이션을 위한 데이터 파이프라인 수집, 파싱, 검증 및 원본 데이터소스(Authoritative Raw Data Source) 확충 진행 경과를 정리합니다.

---

## 2. 완료된 진행 내역 (Milestones Completed)

### Phase 1: Raw Data 분석 & Parser 구현 (`data/raw/weapons.json`)
- **weapons.json 분석**: `weapons.json` 파일 내 416개 무기 및 attachment / attachmentModifiers 구조 분석 완료.
- **WeaponData & AttachmentData Parser 개발**:
  - [WeaponsParser.ts](file:///c:/Users/choez/OneDrive/바탕 화면/RecoilSim/src/core/parser/WeaponsParser.ts) 구현 완료.
  - 특정 무기에 하드코딩되지 않는 구조로 설계하여 전체 416개 무기의 기본 스탯(damage, range, rpm, magsize 등)과 attachments, attachmentModifiers, indexPath 수집.
- **Normalized Weapon 데이터 추출**:
  - `weapons.json` (4.45MB)에서 416개 NormalizedWeapon 및 Attachment Variant 데이터 추출 및 정형화.

### Phase 2: Normalized Parser 검증 테스트 구축 (`WeaponsParser.test.ts`)
- **무기 수 검증**: Raw 전체 416개와 Normalized 416개 1:1 일치, 카테고리별 개수 일치 검증.
- **무기 Identity 검증**: `name`, `displayName`, `category` 일치 및 중복 ID 유무 검사 완료.
- **기본 스탯 검증**: C25 및 무작위 샘플링 무기들에 대해 raw 스탯과 normalized 스탯 100% 일치 확인.
- **Attachment Variant 검증**: 카테고리 공용 및 무기 전용 attachment modifier 구조 검증 완료.

### Phase 3: Recoil Source 탐색 & PFX API 연동
- **런타임 역추적**: `weapons.json`에 recoil 객체가 없는 원인을 분석하고 PFX API 경로 역추적.
- **PFX API 접근 검증**:
  - `GET /api/loadouts/meta/weapons` (전체 무기 메타 목록)
  - `GET /api/weapons/detail/{weaponName}` (무기 상세 정보 및 `recoil` 객체 authoritative source)
- **Authenticated Browser Context 활용**: Discord 로그인된 Chrome 브라우저 CDP(Chrome DevTools Protocol) 세션을 활용해 HTTP 401 문제 해결 및 세션 보안 지침(파일 저장 금지) 준수.

### Phase 4: 416개 전체 Raw Weapon Detail 데이터 확보 (`data/raw/weapon-details/`)
- **샘플 검증 (10개)**: C25를 포함한 10개 샘플 무기의 recoil 필드 및 기존 `C25.json`과 1:1 일치 검증 완료.
- **전체 416개 수집 완료**:
  - Rate limit (HTTP 429) 백오프 처리 및 특수문자(`MP5/10`, `CS/LR-3` 등 `%2F` URL Encoding) 이슈 해결.
  - **416개 전수 수집 성공 (성공률 100%)**.

---

## 3. PFX Raw Data 수집 통계 (Final Data Collection Stats)

| 항목 | 수치 | 상세 설명 |
| :--- | :--- | :--- |
| **총 요청 무기 수** | **416개** | `/api/loadouts/meta/weapons` 기준 메타 목록 전체 |
| **수집 성공 (200 OK)** | **416개** | `data/raw/weapon-details/{weaponId}.json`으로 raw 저장 완료 |
| **수집 실패 수** | **0개** | 실패 무기 없음 |
| **Recoil 객체 보유 무기** | **292개** | 실제 총기류 (Firearms) 전원 보유 |
| **Recoil 미보유 무기** | **124개** | 근접 무기(Melee) 107개 + 투척물/폭발물(Grenades) 17개 |
| **Meta ↔ Detail ID 불일치** | **1개** | Meta: `"E GUN"` ↔ Detail: `"E SHOTGUN"` |
| **C25 Recoil 재검증** | **PASS** | 기존 `data/C25.json`과 100% 1:1 완전 일치 |

---

## 4. Recoil 미보유 124개 무기 카테고리 분석 (No-Recoil Category Breakdown)

Recoil source가 없는 124개 무기는 모두 반동 개념이 없는 **근접 무기 (107개)** 및 **투척/폭발물 (17개)**로 확인되었습니다.

### 1) 근접 무기 (Melee Weapons - 총 107개)
- **ONE HAND BLADE (37개)**: BALISONG, CLASSIC KNIFE, CLEAVER, COOKIE CUTTER 등
- **ONE HAND BLUNT (33개)**: ASP BATON, BARE FISTS, BLOXY, BOTTLE, ARM CANNON 등
- **TWO HAND BLUNT (22개)**: BASEBALL BAT, BAN HAMMER, BANJO, CLEMENTINE, CRANE 등
- **TWO HAND BLADE (15개)**: FIRE AXE, HATTORI, ICEMOURNE, CHOSEN ONE, HARVESTER 등

### 2) 투척/폭발물 (Grenades & Explosives - 총 17개)
- **FRAGMENTATION (8개)**: FRAG, M24 STICK, M26 FRAG, MK 2 FRAG, M560 MINI 등
- **HIGH EXPLOSIVE (6개)**: BUNDLE CHARGE, DYNAMITE, DYNAMITE-3, PB GRENADE, RGD-5 HE 등
- **IMPACT (3개)**: RGN UDZS, RGO UDZS, T-13 IMPACT

> **참고**: 모든 총기류 카테고리(Assault Rifle, Battle Rifle, Carbine, DMR, LMG, Machine Pistols, PDW, Pistols, Revolvers, Shotgun, Sniper Rifle, Other 등 12개 범주 292개 무기)는 100% 완전한 `recoil` 데이터를 보유하고 있습니다.

---

## 5. 향후 과제 (Next Steps)
- **Modifier Engine 구현**: 무기 + Attachment 선택 시 스탯 및 recoil 변화 계산 엔진 구축.
- **WeaponCompiler 구현**: raw 데이터와 normalized 데이터를 결합하여 시뮬레이션용 최종 통합 무기 객체 컴파일.
- **Recoil Simulator Core**: 사용자 조준/반동 패턴 및 그래프 렌더링 시뮬레이션 개발.
