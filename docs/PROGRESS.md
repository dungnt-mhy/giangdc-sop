# PROGRESS.md — Trạng thái dự án (nguồn sự thật)

Cập nhật: 17/10/2026 (phiên khởi tạo).

## Đã verified

- T0: khung repo + bộ docs (AGENTS.md, README.md, docs/SPEC/PLAN/TASKS/PROGRESS/DECISIONS/HANDOFF/CHANGELOG, docs/adr). Commit đầu local.
- T1: ADR-001 chốt stack TypeScript monorepo.
- Rà soát SRS v1.6: ĐẠT làm baseline (5 điểm nhỏ không chặn, xem HANDOFF.md).
- **T1.1: nền móng + CI — HOÀN THÀNH (17/10/2026).**
  - Monorepo pnpm workspaces: apps/web (Vite React), apps/api (Hono Worker),
    packages/domain (Execution state machine + 6 unit test), packages/adapters
    (interface), packages/contracts (API_CONTRACT_VERSION).
  - CI GitHub Actions xanh: lint + typecheck + test + build + audit (0 vulnerability).
  - Demo Cloudflare: Worker `giangdc-sop-demo-api` (https://giangdc-sop-demo-api.iaict-platform.workers.dev),
    Pages `giangdc-sop-demo` (https://giangdc-sop-demo.pages.dev),
    D1 `giangdc-sop-demo`, R2 bucket `giangdc-sop-demo`.
  - Smoke test đạt: GET /health → 200 `{status:'ok'}`; web → 200.
  - Không có secret trong repo/log (token chỉ trong vault).

## Đang dở

- Chưa có.

## Hạ tầng đã có

- GitHub: `dungnt-mhy/giangdc-sop` (public) — https://github.com/dungnt-mhy/giangdc-sop.
  OPEN-REPO-01 đã chốt (repo cá nhân, public). Khung T0+T1 đã đẩy lên nhánh `main`.
- Cloudflare: chưa có (OPEN-CF-01 vẫn mở).

## Tiếp theo

- **T1.2 — Xác thực và phân quyền** (SRS §5, §9.7, BR-013): đăng nhập nội bộ một lớp
  (D-02), session server-side, permission kiểm tra phía server theo scope.
  AC-06, AC-11, AC-16 (phần auth).
- Các OPEN chặn G1 cần chốt trước module nghiệp vụ: OPEN-SOD-01, OPEN-DATA-01, OPEN-SCOPE-01.

## Rủi ro / chờ quyết định

- Thiếu file SRS v1.5 FINAL Rev.9 (Technical Reference) — v1.6 tự đủ để triển khai,
  nhưng đối chiếu sâu implementation thì thiếu.
- Deploy tự động từ GitHub Actions sang Cloudflare chưa dựng (cần CLOUDFLARE_API_TOKEN
  làm repo secret — token thật không đọc được từ vault, cần user tự thêm).
  Hiện tại deploy demo làm thủ công từ máy dev.
