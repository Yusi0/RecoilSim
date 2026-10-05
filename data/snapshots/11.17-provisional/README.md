# PF 11.17 Provisional Snapshot (PROVISIONAL)

## 1. 개요
- **상태**: `PROVISIONAL (잠정 데이터 - 미검증)`
- **데이터 소스**:
  - API 원본: `data/raw/11.17weapons.json` (424 Weapons, 36.9 MB)
  - 패치노트 대조 소스: `11.17.0.txt` (Fall 2026 Update)
  - 분석 리포트: `11_17_DATA_MIGRATION_REPORT.md`
  - 마이그레이션 메타데이터: `data/snapshots/11.17-provisional/migration_analysis.json`

## 2. 데이터 제약 및 거버넌스 원칙
- **11.17 ProductionContent Place 파일 미확보 상태**:
  - 현재 시점에서는 11.17 API만 확보되었으며, 11.17 실제 인게임 Place 파일(Studio ProductionContent)은 확보되지 않음.
  - 따라서 11.17 API ↔ 11.17 In-game의 직접 검증은 기술적으로 불가능함.
- **캐노니컬 승격 금지 (Do Not Promote to Canonical)**:
  - 11.17 실제 Place 파일이 확보되어 전수 대조되기 전까지, RecoilSim의 캐노니컬 데이터베이스(`src/`, `data/in-game-modules/`, `data/normalized/`)를 본 데이터로 덮어쓰지 않음.
  - 본 스냅샷은 11.17 변경점 분석 및 분류 목적으로만 격리 보관됨.
