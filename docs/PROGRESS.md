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
  - **Test trình duyệt end-to-end 17/10 (6/6 bước đạt)** trên URL preview:
    phát hiện & sửa 2 lỗi: (1) CORS chặn origin preview (`*.pages.dev` — mỗi lần
    deploy sinh URL hash mới) → cho phép `*.pages.dev` ở demo; (2) cookie session
    `SameSite=Lax` không được gửi trong fetch cross-site (web pages.dev vs API
    workers.dev) → đổi `SameSite=None; Secure` ở demo (production cùng origin sẽ
    dùng lại Lax).

## Đang dở

- Chưa có.

## Hạ tầng đã có

- GitHub: `dungnt-mhy/giangdc-sop` (public) — https://github.com/dungnt-mhy/giangdc-sop.
  OPEN-REPO-01 đã chốt.
- Cloudflare: account của user; tài nguyên demo tên `giangdc-sop-demo*`.
  OPEN-CF-01 đã chốt.
- **Lưu ý:** Pages project `giangdc-sop-demo` đang nối GitHub repo
  `ntdung-tds/sop-web-giangdc` (auto-deploy nhánh main) → production
  https://giangdc-sop-demo.pages.dev đang chạy app PA-01 fixture của repo đó,
  KHÔNG phải bản monorepo này. Bản monorepo deploy thủ công ra URL preview
  (vd: https://f54a1129.giangdc-sop-demo.pages.dev). Chờ user quyết: tạo Pages
  project riêng cho monorepo hay gộp pipeline.
- **GitHub Pages (17/10):** user yêu cầu link github.io → đã dựng workflow
  `.github/workflows/deploy-pages.yml` (build apps/web với base `/giangdc-sop/`,
  auto-deploy khi push main), bật Pages (build_type=workflow), thêm origin
  `https://dungnt-mhy.github.io` vào CORS API. Site live tại
  https://dungnt-mhy.github.io/giangdc-sop/ — test trình duyệt end-to-end 6/6
  bước đạt (đăng nhập sai/đúng, 26 quyền, đăng xuất).
- **Rebuild theo yêu cầu user — repo đúng là giangdc-sop (17/10 chiều):**
  - Tạo Pages project production riêng `giangdc-sop-app` (direct upload, không nối
    GitHub) → https://giangdc-sop-app.pages.dev. Test trình duyệt 6/6 bước đạt.
  - ĐÃ XÓA Pages project `giangdc-sop-demo` (chạy nhầm app của `ntdung-tds/sop-web-giangdc`).
  - Giao diện build lại: login 2 cột (brand gradient + thẻ login + tài khoản demo),
    dashboard Tổng quan (3 thẻ Vai trò/Đơn vị/Số quyền, 11 nhóm quyền, bảng phân hệ
    T2–T6), responsive mobile.
  - Base path qua `VITE_BASE_PATH` (github.io: /giangdc-sop/, Cloudflare: /).

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
