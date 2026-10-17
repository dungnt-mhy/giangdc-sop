# TASKS.md — Backlog

> Mỗi task: mô tả → tiêu chí nghiệm thu (AC) → evidence. Không code khi chưa duyệt kế hoạch task.

## T0 — Dựng khung dự án ✅

Khởi tạo repo + bộ docs theo AGENTS.md. Evidence: cây thư mục + commit đầu.
Hoàn thành 17/10/2026.

## T1 — ADR-001 stack ✅

Chốt TypeScript monorepo. Evidence: `docs/adr/ADR-001-stack.md`.
Hoàn thành 17/10/2026.

## T1.1 — Nền móng + CI (TIẾP THEO)

**Mô tả:** khởi tạo monorepo pnpm workspaces (`apps/web`, `apps/api`,
`packages/domain`, `packages/adapters`); GitHub Actions (lint/typecheck/test/build/security);
pipeline deploy demo Cloudflare.

**Tiêu chí nghiệm thu:**
- CI xanh trên PR mẫu (lint + typecheck + test + build + security checks).
- Deploy demo thủ công thành công; smoke test đăng nhập + tạo lượt đạt (AC-15 mức nền móng).
- Không có secret trong repo/log.

**Phụ thuộc:** OPEN-REPO-01 đã chốt (17/10/2026): repo cá nhân `dungnt-mhy/giangdc-sop`,
public — https://github.com/dungnt-mhy/giangdc-sop. Khung T0+T1 đã đẩy lên nhánh `main`.
Còn chờ OPEN-CF-01 (tài khoản Cloudflare).
Nếu chưa có Cloudflare: làm phần code monorepo + CI trước, đấu nối sau.

## T1.2 — Xác thực và phân quyền

**Mô tả:** đăng nhập nội bộ một lớp (D-02), session server-side, permission kiểm tra
phía server theo scope (SRS §5, §9.7, BR-013).

**Tiêu chí nghiệm thu:** AC-06 (scope), AC-11 (đăng nhập/trang chủ theo vai trò),
AC-16 (phần auth của "Việc của tôi").

## T2 — Process Catalog + Authoring & Governance

PRC-001..011, GOV-001..009. AC-01, AC-02, AC-12.

## T3 — Execution engine + step lifecycle

EXE-001..013, BR-008/009/014. AC-03, AC-04, AC-07, AC-09, AC-16, AC-18.

## T4 — Evidence & upload

EVD-001..013, BR-016. AC-03, AC-13, AC-14, AC-17, AC-20.

## T5 — Exception & rework lifecycle

EXP-001..006. AC-05, AC-05A..AC-05F, AC-08.

## T6 — Reporting/KPI/export + notification

RPT-001..006. AC-10, AC-19.

## T7 — Admin & onboarding

ADM-001..006, ONB-001..011. AC-06, AC-11.
