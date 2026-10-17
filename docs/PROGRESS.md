# PROGRESS.md — Trạng thái dự án (nguồn sự thật)

Cập nhật: 17/10/2026 (phiên khởi tạo).

## Đã verified

- T0: khung repo + bộ docs (AGENTS.md, README.md, docs/SPEC/PLAN/TASKS/PROGRESS/DECISIONS/HANDOFF/CHANGELOG, docs/adr). Commit đầu local.
- T1: ADR-001 chốt stack TypeScript monorepo.
- Rà soát SRS v1.6: ĐẠT làm baseline (5 điểm nhỏ không chặn, xem HANDOFF.md).

## Đang dở

- Chưa có.

## Hạ tầng đã có

- GitHub: `dungnt-mhy/giangdc-sop` (public) — https://github.com/dungnt-mhy/giangdc-sop.
  OPEN-REPO-01 đã chốt (repo cá nhân, public). Khung T0+T1 đã đẩy lên nhánh `main`.
- Cloudflare: chưa có (OPEN-CF-01 vẫn mở).

## Tiếp theo

- **T1.1 — Nền móng + CI.** Chờ chủ sản phẩm chốt:
  - OPEN-REPO-01: org/repo GitHub (private/public, review rule) — chặn G0.
  - OPEN-CF-01: tài khoản Cloudflare, tên Pages/Worker/D1/R2 — cần cho pipeline demo.
  - Nếu chưa chốt: triển khai phần code monorepo + CI trước, đấu nối sau.

## Rủi ro / chờ quyết định

- Thiếu file SRS v1.5 FINAL Rev.9 (Technical Reference) — v1.6 tự đủ để triển khai,
  nhưng đối chiếu sâu implementation thì thiếu.
- Các OPEN chặn G1 (OPEN-SOD-01, OPEN-DATA-01, OPEN-SCOPE-01) cần chốt trước khi
  làm module nghiệp vụ.
