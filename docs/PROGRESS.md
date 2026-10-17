# PROGRESS.md — Trạng thái dự án (nguồn sự thật)

Cập nhật: 17/10/2026 (T1.2 hoàn thành).

## Đã verified

- T0: khung repo + bộ docs (AGENTS.md, README.md, docs/SPEC/PLAN/TASKS/PROGRESS/DECISIONS/HANDOFF/CHANGELOG, docs/adr).
- T1: ADR-001 chốt stack TypeScript monorepo.
- Rà soát SRS v1.6: ĐẠT làm baseline (5 điểm nhỏ không chặn, xem HANDOFF.md).
- **T1.1: nền móng + CI — HOÀN THÀNH.**
  - Monorepo pnpm workspaces: apps/web (Vite React), apps/api (Hono Worker),
    packages/domain (Execution state machine + 6 unit test), packages/adapters,
    packages/contracts.
  - CI GitHub Actions xanh: lint + typecheck + test + build + audit (0 vulnerability).
  - Demo Cloudflare: Worker `giangdc-sop-demo-api`
    (https://giangdc-sop-demo-api.iaict-platform.workers.dev),
    Pages `giangdc-sop-demo` (https://giangdc-sop-demo.pages.dev),
    D1 `giangdc-sop-demo`, R2 bucket `giangdc-sop-demo`.
  - Không có secret trong repo/log (token chỉ trong vault).
- **T1.2: xác thực + phân quyền — HOÀN THÀNH.**
  - Domain: 27 permission code, 7 system role, SOD policy (OPEN-SOD-01),
    scope model (OPEN-SCOPE-01), PBKDF2 — 19 unit test đạt.
  - D1 migration 0001 (6 bảng) đã apply lên demo; seed 4 user demo (SAMPLE).
  - API: POST /auth/login, POST /auth/logout, GET /auth/me, GET /auth/check-scope;
    middleware request-id/auth/permission; lỗi chuẩn {code, message, requestId}.
  - Web: trang giới thiệu + đăng nhập, trang chủ theo vai trò (AC-11).
  - Smoke test trên demo đạt: login sai → 401, login đúng → 200 + cookie,
    /auth/me trả permissions/scopes, ngoài scope → 403 + audit, logout → 401.
    (AC-06, AC-11, AC-16 phần auth).

## Đang dở

- Chưa có.

## Hạ tầng đã có

- GitHub: `dungnt-mhy/giangdc-sop` (public) — https://github.com/dungnt-mhy/giangdc-sop.
  OPEN-REPO-01 đã chốt.
- Cloudflare: account của user; tài nguyên demo tên `giangdc-sop-demo*`.
  OPEN-CF-01 đã chốt.

## Quyết định đã chốt (G1)

- OPEN-SOD-01: vai trò phê duyệt = người phê duyệt + admin + quản lý; 4 mắt mặc định;
  admin/quản lý tự duyệt có lưu vết + gắn cờ; ánh xạ severity → cấp phê duyệt.
- OPEN-DATA-01: 9 trường chung của Lượt thực hiện.
- OPEN-SCOPE-01: cây 2 cấp (org root → đơn vị/kho OFFICE/WAREHOUSE).

## Tiếp theo

- **T2 — Process Catalog + Authoring & Governance** (PRC-001..011, GOV-001..009).
  AC-01, AC-02, AC-12.

## Rủi ro / chờ quyết định

- Thiếu file SRS v1.5 FINAL Rev.9 (Technical Reference).
- Deploy tự động GitHub Actions → Cloudflare chưa dựng (cần user tự thêm
  CLOUDFLARE_API_TOKEN vào repo secret). Hiện deploy demo thủ công từ máy dev.
