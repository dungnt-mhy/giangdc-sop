# PLAN.md — Kế hoạch triển khai

## Phase 0 — Dựng khung dự án ✅ (17/10/2026)

Khởi tạo repo theo cẩm nang §4 + SRS §13: AGENTS.md, README.md, docs/
(SPEC/PLAN/TASKS/PROGRESS/DECISIONS/HANDOFF/CHANGELOG), src/, tests/, scripts/.
Chưa code nghiệp vụ. Trạng thái: HOÀN THÀNH.

## Phase 1 — ADR kiến trúc ✅ (17/10/2026)

ADR-001: chốt stack TypeScript monorepo (xem `docs/adr/ADR-001-stack.md`).
Trạng thái: HOÀN THÀNH.

## Phase 2 — Task 1.1: Nền móng + CI (tiếp theo)

- Khởi tạo monorepo (pnpm workspaces): `apps/web`, `apps/api`, `packages/domain`, `packages/adapters`.
- GitHub Actions: lint / typecheck / test / build / security checks.
- Pipeline deploy demo Cloudflare (cần OPEN-CF-01: tài khoản Cloudflare).
- Cần OPEN-REPO-01: org/repo GitHub (chặn G0).
- Tiêu chí nghiệm thu: CI xanh trên PR mẫu; deploy demo thủ công thành công;
  smoke test đăng nhập + tạo lượt đạt (AC-15 ở mức nền móng).

## Phase 3 — Task 1.2: Xác thực và phân quyền

Theo SRS §5, §9.7, BR-013. Đăng nhập nội bộ một lớp (D-02), session server,
permission kiểm tra phía server theo scope. AC-06, AC-11, AC-16 (phần auth).

## Phase 4 — Các module nghiệp vụ (theo SRS §20.4)

1. Process Catalog + Authoring & Governance (PRC-001..011, GOV-001..009) — AC-01, AC-02, AC-12.
2. Execution engine + step lifecycle (EXE-001..013, BR-008/009/014) — AC-03, AC-04, AC-07, AC-09, AC-16, AC-18.
3. Evidence & upload (EVD-001..013, BR-016) — AC-03, AC-13, AC-14, AC-17, AC-20.
4. Exception & rework lifecycle (EXP-001..006) — AC-05, AC-05A..F, AC-08.
5. Reporting/KPI/export + notification (RPT-001..006) — AC-10, AC-19.
6. Admin & onboarding (ADM-001..006, ONB-001..011) — AC-06, AC-11.

Mỗi module: contract/schema trước → test thất bại trước → migration → domain → API → UI
→ evidence → PR theo mẫu AGENTS.md.

## Lưu ý gate

- G0 cần OPEN-REPO-01 (GitHub org/repo).
- G1 cần OPEN-SOD-01, OPEN-DATA-01, OPEN-SCOPE-01 (scope/role/state machine/dữ liệu chung).
- G2 khóa OpenAPI, data model, auth, upload, adapter D1/PostgreSQL + R2/S3.
- Chi tiết OPEN xem SRS §21.
