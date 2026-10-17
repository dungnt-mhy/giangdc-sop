# TASKS.md — Backlog

> Mỗi task: mô tả → tiêu chí nghiệm thu (AC) → evidence. Không code khi chưa duyệt kế hoạch task.

## T0 — Dựng khung dự án ✅

Khởi tạo repo + bộ docs theo AGENTS.md. Evidence: cây thư mục + commit đầu.
Hoàn thành 17/10/2026.

## T1 — ADR-001 stack ✅

Chốt TypeScript monorepo. Evidence: `docs/adr/ADR-001-stack.md`.
Hoàn thành 17/10/2026.

## T1.1 — Nền móng + CI ✅ (TIẾP THEO → HOÀN THÀNH 17/10/2026)

**Mô tả:** khởi tạo monorepo pnpm workspaces (`apps/web`, `apps/api`,
`packages/domain`, `packages/adapters`, `packages/contracts`); GitHub Actions
(lint/typecheck/test/build/audit); pipeline deploy demo Cloudflare.

**Tiêu chí nghiệm thu:**
- ✅ CI xanh trên GitHub (lint + typecheck + test 6 passed + build + audit sạch).
- ✅ Deploy demo thủ công thành công: Worker + Pages + D1 + R2.
- ✅ Smoke test đạt: API /health 200, web 200 (AC-15 ở mức nền móng; smoke
  đăng nhập + tạo lượt đầy đủ sẽ làm ở T1.2/T3 khi có auth và execution engine).
- ✅ Không có secret trong repo/log.

**Ghi chú kỹ thuật:**
- OPEN-REPO-01 đã chốt: repo cá nhân `dungnt-mhy/giangdc-sop`, public.
- OPEN-CF-01 đã chốt: dùng tài khoản Cloudflare của user; tài nguyên demo đặt tên
  `giangdc-sop-demo*` để tách khỏi production.
- Vitest nâng lên ^5 để sạch 4 vulnerability (tinypool).
- pnpm 12 yêu cầu `allowBuilds` trong pnpm-workspace.yaml cho esbuild/workerd.

## T1.2 — Xác thực và phân quyền ✅ HOÀN THÀNH 17/10/2026

**Mô tả:** đăng nhập nội bộ một lớp (D-02), session server-side, permission kiểm tra
phía server theo scope (SRS §5, §9.7, BR-013).

**Đã làm:**
- Domain: permission catalog (27 code), 7 system role, SOD policy (OPEN-SOD-01:
  4 mắt mặc định, admin/manager tự duyệt có lưu vết + gắn cờ, ánh xạ severity),
  scope model (OPEN-SCOPE-01), PBKDF2 hashing — 19 unit test đạt.
- D1 migration 0001: org_units, users, user_system_roles, user_scopes, sessions, audit_events.
- API: POST /auth/login, POST /auth/logout, GET /auth/me (trả permissions + scopes,
  BR-013), GET /auth/check-scope (AC-06); middleware request-id, requireAuth,
  requirePermission; lỗi chuẩn {code, message, requestId}.
- Web: trang giới thiệu + đăng nhập (không tải dữ liệu nội bộ khi chưa login),
  trang chủ theo vai trò (AC-11).
- Seed demo (SAMPLE): 1 org + 2 đơn vị + 4 user (admin/quanly/pheduyet/nhanvien).

**Tiêu chí nghiệm thu:**
- ✅ AC-06: truy cập ngoài scope → 403 FORBIDDEN_SCOPE + ghi audit.
- ✅ AC-11: landing + login + trang chủ theo vai trò.
- ✅ AC-16 (phần auth): /auth/me trả permissions/scopes, client không tự suy quyền.
- ✅ CI xanh, smoke test login/logout đầy đủ trên demo.

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
