# HANDOFF.md — Bàn giao phiên

## Phiên 17/10/2026 (T2 mở rộng — 5 yêu cầu chủ sản phẩm, subagent)

### Đã làm

1. **YC1 — Vai trò nhiều chọn (thay đổi data model):**
   - Contract (`packages/contracts/src/process.ts`): `UpsertStepBody`/`ProcessStepDto` thêm
     `roles?: string[]` + `supervisorRoles?: string[]`; `role` deprecated (đọc = roles[0] ?? cột cũ,
     ghi `role` cũ → map vào `roles`).
   - Migration `apps/api/migrations/0003_step_roles.sql`: 2 cột `roles_json`/`supervisor_roles_json`
     + backfill từ `role` (4 dòng) — đã apply lên D1 `giangdc-sop-demo` qua API.
   - Domain: validate mảng (trim/dedupe/≤20, báo ROLE_EMPTY/ROLES_TOO_MANY/ROLES_NOT_ARRAY) — 3 test mới.
   - API (`processDb.ts`, `processes.ts`): đọc/ghi 2 cột JSON; copy version (PRC-003) giữ nguyên roles.
   - Web StepForm: 2 multi-select 7 vai trò hệ thống (thực hiện + giám sát) + giữ giá trị lạ đã lưu.
2. **YC2 — Validate hiện lỗi trong modal:** client check mã/tiêu đề (`ferr` + `.form-error`);
   `saveStep` throw tiếp lỗi server để StepForm hiện.
3. **YC3 — Danh sách bước collapsible + mobile:** component `StepRowView` (đầu dòng gọn:
   số/mã/tiêu đề/chip/“Chi tiết ▾”; mở rộng hiện toàn bộ trường); dùng cho cả editor và
   màn thẩm định; fix `.step-main{min-width:0}` (nguyên nhân bóp chữ từng từ trên mobile);
   nút ↑↓✎× thành hàng ngang dưới tiêu đề.
4. **YC4 — Người tạo + ngày tạo:** `ProcessDto.createdByName` (JOIN users qua
   `processes.created_by`); ProcessList + ProcessDetail hiện "Người tạo · Ngày tạo (dd/mm/yyyy)".
5. **Evidence:** lint + typecheck + test **55/55 đạt**; build web sạch; deploy Worker
   `giangdc-sop-demo-api` + Pages `giangdc-sop-app` xong; push GitHub 6 file.
   Smoke test API đạt toàn bộ (roles[], supervisorRoles[], legacy role mapping, dedupe,
   createdByName list/detail); quy trình test SMK-ROLE-01 đã archive (giữ SAMPLE-SHIPPING,
   TEST-E2E-17-10 nguyên vẹn).

### Chưa làm / chờ

- **Kiểm thử trình duyệt web** cho 5 điểm trên (multi-select lưu được, `ferr` trong modal,
  collapsible đóng/mở, người tạo/ngày tạo, layout mobile) — subagent không có live browser,
  cần parent agent chạy trên https://giangdc-sop-app.pages.dev.
- T3 (Execution engine): chưa trình kế hoạch, chưa code (đúng yêu cầu "không làm tiếp").


## Phiên 17/10/2026 (T2 — Process Catalog + Authoring & Governance, subagent)

### Đã làm (T2 hoàn thành)

1. **T2.1 Domain** (`packages/domain/src/process.ts` + `process.test.ts`): máy trạng thái
   7 trạng thái theo SRS §7.1/§7.5; `isEditableState` (khóa sửa từ IN_REVIEW);
   `resolveActivation` (1 ACTIVE + 1 SCHEDULED, supersede nguyên tử, retry idempotent);
   `validateVersionForSubmit` (PRC-009 lỗi theo bước/trường + BR-003);
   `checkVersionApproval` (GOV-004 + OPEN-SOD-01 + D-08). Fail-first: test viết trước
   (fail do thiếu module), 2 test fail do test sai rồi sửa → **52/52 đạt**.
2. **T2.2 Migration 0002** (`apps/api/migrations/0002_process_catalog.sql`): 6 bảng +
   partial unique index cưỡng chế 1 ACTIVE/1 SCHEDULED. Apply D1 demo OK.
   Seed `scripts/seed-t2-demo.mjs`: SAMPLE-SHIPPING 11 bước từ Shipping.pdf, v1 ACTIVE.
3. **T2.3 API** (`apps/api/src/processes.ts`, `processDb.ts`, `idempotency.ts`):
   21 endpoint; contract trước trong `packages/contracts/src/process.ts`.
   Idempotency-Key bắt buộc 6 mutation (BR-014); optimistic concurrency qua revision;
   lỗi chuẩn {code,message,requestId}. OpenAPI `docs/openapi-t2.yaml`.
   **Smoke test live đạt toàn bộ** (curl): tạo→soạn→validate→submit→approve→release→
   supersede nguyên tử; replay idempotent + IDEMPOTENCY_CONFLICT; VERSION_LOCKED;
   4-mắt; D-08 (approver HIGH → 403, manager HIGH → OK); self-approve admin gắn cờ;
   schedule kép → ACTIVATION_REJECTED (AC-02); retry release → alreadyActive.
   Dữ liệu test T2-* đã dọn, demo chỉ giữ SAMPLE-SHIPPING.
4. **T2.4 Web** (`apps/web/src/processes.tsx`, ~934 dòng + CSS): nav "Danh mục Quy trình"
   live; danh sách/tìm kiếm/tạo; timeline phiên bản; trình soạn (form 12 trường PRC-005,
   thêm/sửa/xóa/sắp xếp bước, validate, gửi thẩm định); thẩm định (góp ý, trả sửa,
   phê duyệt theo severity, lịch sử phê duyệt). Deploy Pages production xong.
5. Docs: `docs/T2_PLAN_DRAFT.md` §5 (bảng truy vết), TASKS/PROGRESS/HANDOFF/CHANGELOG.

### Chưa làm / chờ

- **AC-12 (UI desktop)**: subagent không có live browser — cần parent agent chạy kiểm thử
  trình duyệt trên https://giangdc-sop-app.pages.dev (login admin/Admin@123 → menu
  "Danh mục Quy trình" → tạo/soạn/validate/submit/approve/release).
- **T3** (Execution engine): kế hoạch chưa trình/chưa duyệt.
- Job tự kích hoạt SCHEDULED đến hạn: ngoài MVP (có endpoint activate idempotent).
- `process.publish`/`process.deprecate` hiện chỉ admin có (mapping DEFAULT, chốt ở G2).

### Cho phiên tiếp theo

Trình kế hoạch T3 để chủ sản phẩm duyệt (theo AGENTS.md: chưa duyệt thì chưa code).

## Phiên 17/10/2026 (khởi tạo dự án)

### Đã làm (bổ sung — T1.1 hoàn thành)

5. T1.1 nền móng + CI: monorepo pnpm workspaces (apps/web Vite React, apps/api Hono
   Worker, packages/domain với Execution state machine + 6 unit test, packages/adapters,
   packages/contracts); GitHub Actions CI xanh (lint/typecheck/test/build/audit);
   Cloudflare demo: D1 `giangdc-sop-demo` (uuid 1d74db80-…), R2 bucket `giangdc-sop-demo`,
   Worker https://giangdc-sop-demo-api.iaict-platform.workers.dev,
   Pages https://giangdc-sop-demo.pages.dev; smoke test đạt.
   OPEN-REPO-01 và OPEN-CF-01 đã chốt.
6. Bài học kỹ thuật: gh CLI không dùng được token vault (gửi `Authorization: token`,
   placement đăng ký là `bearer_header`) — dùng helper Python `bin/gh_api.py` /
   `bin/cf_api.py` với Bearer surrogate; wrangler chạy được với
   CLOUDFLARE_API_TOKEN=<surrogate>. pnpm 12 cần `allowBuilds` (không phải
   `onlyBuiltDependencies`) trong pnpm-workspace.yaml. Vitest ^5 sạch vulnerability.

### Chưa làm / chờ

- T2 (Process Catalog + Authoring & Governance): chưa bắt đầu. Kế hoạch chờ duyệt.
- Deploy tự động GitHub Actions → Cloudflare: chưa dựng (cần user tự thêm
  CLOUDFLARE_API_TOKEN vào repo secret; token thật không đọc được từ vault).

### Đã làm

1. Đọc toàn văn SRS v1.6 LEAN BASELINE SYNC REV9 (431 đoạn, 21 bảng).
2. Rà soát v1.6 — kết luận **ĐẠT làm baseline triển khai**:
   - Điểm mạnh: hệ thống nhãn + thứ tự ưu tiên (§1); chống khóa cứng implementation (§1.2);
     hai predicate blocker (§7.4); bảng CONTRACT Parent×Step; unified cancellation;
     AC-05A→05F phủ kín rework; fixture 11 bước đúng; seed chỉ demo/UAT gắn SAMPLE;
     changelog 22A minh bạch Rev.6→Rev.9.
   - 5 điểm nhỏ không chặn: (1) tiêu đề §7.4 "Hai vị từ blocker" nên đổi thành
     "Hai predicate blocker"; (2) thiếu bảng chân lý mapping exception state × severity
     → progress/completion blocker; (3) nhãn NORMATIVE không nhất quán hậu tố v1.6
     (§8.1 có, §10.6A/§20.5 không); (4) ExceptionCase thiếu bảng transition đầy đủ —
     yêu cầu ở G2; (5) thiếu file v1.5 FINAL Rev.9 để đối chiếu sâu.
3. Dựng khung repo `~/workspace/sop`: AGENTS.md, README.md, docs/
   (SPEC/PLAN/TASKS/PROGRESS/DECISIONS/HANDOFF/CHANGELOG), docs/adr/ADR-001,
   src/, tests/, scripts/. Commit đầu local (chưa remote).
4. ADR-001: chốt TypeScript monorepo (Accepted theo phê duyệt kế hoạch Phase 0+1).

### Chưa làm / chờ

- T1.1 (nền móng + CI): OPEN-REPO-01 đã chốt (repo `dungnt-mhy/giangdc-sop`, public,
  khung đã đẩy lên `main`); còn chờ OPEN-CF-01 (tài khoản Cloudflare) cho pipeline demo.
- Các OPEN chặn G1: OPEN-SOD-01, OPEN-DATA-01, OPEN-SCOPE-01.

### Cho phiên tiếp theo

Đọc AGENTS.md → HANDOFF.md (file này) → PROGRESS.md → DECISIONS.md → SPEC.md → TASKS.md,
rồi bắt đầu T1.1 sau khi chủ sản phẩm chốt GitHub/Cloudflare (hoặc làm phần code trước).
