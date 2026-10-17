# CHANGELOG.md — Lịch sử thay đổi dự án

## 17/10/2026 — Khởi tạo dự án

- Dựng khung repo theo cẩm nang §4 + SRS §13: AGENTS.md, README.md,
  docs/{SPEC,PLAN,TASKS,PROGRESS,DECISIONS,HANDOFF,CHANGELOG}.md, src/, tests/, scripts/.
- Ghi nhận quyết định D-01..D-07 (từ Cẩm nang AI Agent v1.1).
- ADR-001: chốt stack TypeScript monorepo (Accepted).
- Baseline: SRS v1.6 LEAN BASELINE SYNC REV9 — đã rà soát, ĐẠT.
- GitHub: tạo repo `dungnt-mhy/giangdc-sop` (public), đẩy khung T0+T1 lên nhánh `main`.
  OPEN-REPO-01 chốt.
- Cloudflare: tạo D1 `giangdc-sop-demo`, R2 bucket `giangdc-sop-demo`,
  Worker `giangdc-sop-demo-api`, Pages project `giangdc-sop-demo`.
  OPEN-CF-01 chốt (dùng account của user, tài nguyên demo tách production).
- T1.2: domain auth (27 permission, 7 role, SOD, scope, PBKDF2 — 19 test);
  D1 migration 0001 + seed demo; API login/logout/me/check-scope;
  Web login + trang chủ theo vai trò. OPEN-SOD-01/DATA-01/SCOPE-01 chốt.
