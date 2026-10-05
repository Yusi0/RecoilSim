# PF 11.16 Baseline Snapshot (VERIFIED)

## 1. 개요
- **상태**: `VERIFIED (Authoritative Ground Truth)`
- **데이터 소스**:
  - API 원본: `data/raw/weapons.json` (Stylis Studios Web API Export, 416 Weapons)
  - 인게임 원본: `data/in-game-modules/weapon_database.json` (416 Weapons, 19 Categories, Roblox Studio Place File Dump via MCP)
  - 부착물 인게임 원본: `data/in-game-modules/attachment_database.json` (730 Global Attachments)
  - 검증 완료 리포트: `data/weapon_verification.json`, `data/attachment_verification.json`

## 2. 데이터 무결성 보증
- 11.16 In-game ProductionContent Place 파일을 전수 덤프하여 물리 엔진의 16개 반동 스프링 파라미터 및 기동성 스탯(`sprintspeed`, `equipspeed`, `aimspeed`, `aimwalkspeedmult` 등)을 완벽하게 확보함.
- C25 골든 시뮬레이션 및 292개 화기 추천 엔진은 11.16 In-game 데이터를 기준으로 검증됨.
- 본 스냅샷의 모든 파일은 불변(Immutable) 상태로 유지됨.
