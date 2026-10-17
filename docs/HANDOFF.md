# HANDOFF.md — Bàn giao phiên

## Phiên 17/10/2026 (D-10 — vai trò ứng dụng mở rộng, subagent)

### Đã làm

1. **Contract** (`packages/contracts/src/process.ts`, single source): thêm `RoleDto{id,code,name,seniorApprover}`,
   `CreateRoleBody{code,name,seniorApprover?}`.
2. **Migration 0005** (`apps/api/migrations/0005_app_roles.sql`): bảng `roles` + `role_permissions`
   + `user_roles` (+FK); seed 4 vai trò (Quản trị viên 27 quyền senior=1; Quản lý 18 quyền senior=1;
   Người phê duyệt 8 quyền; Người thực hiện 11 quyền) = 63 dòng role_permissions; gán 4 user demo
   theo username; DROP TABLE `user_system_roles`. Đã apply D1 `giangdc-sop-demo`.
   (Lưu ý kỹ thuật: D1 không hiểu `SELECT x, value FROM (VALUES...)` — phải dùng `column1`.)
3. **Domain** (thứ tự AGENTS.md §2, test fail-first): `roles.ts` viết lại (RoleRecord/RoleWithPermissions,
   xóa 7 role cứng); `permissions.ts` (bỏ ROLE_PERMISSIONS cứng, `effectivePermissions`/`hasPermission`
   tính từ tập quyền DB); `sod.ts` viết lại (D-10: canApprove = có `process.approve`;
   HIGH/BLOCKING cần senior; self-approve chỉ senior + gắn cờ); `process.ts`
   `checkVersionApproval` input mới (candidatePermissions + candidateSenior).
4. **API**: `db.ts` (`getUserRoles`→DbRole[], `getUserPermissions`, `getUserPositions`,
   `listRoles`, `unknownRoleCodes`); `middleware.ts`/`env.ts` (context: roles, permissions,
   seniorApprover); `auth.ts` (`/auth/me` + `/auth/login` trả roles[]/positions[]/permissions[]);
   `processes.ts`: approve/return dùng predicate mới + ghi approver_role = mã vai trò;
   GET `/roles` mới; `skip.allowedRoles` validate động theo bảng roles (400 UNKNOWN_ROLE);
   POST `/positions` chuyển sang kiểm tra senior_approver (giữ nguyên tắc "admin/manager cũ").
   OpenAPI `docs/openapi-t2.yaml` cập nhật.
5. **Web**: `App.tsx` (MeResponse mới; user chip + Tổng quan hiện 2 mục rõ ràng
   "Vai trò ứng dụng"/"Chức vụ"; xóa ROLE_LABEL 7 cứng); `processes.tsx` (hook `useAppRoles`,
   skip multi-select + StepDetail tra cứu tên vai trò động từ GET /roles).
6. **Evidence:** lint ✓, `tsc --noEmit` ✓ (0 lỗi), **56/56 test đạt**; build web sạch;
   deploy Worker `giangdc-sop-demo-api` + Pages `giangdc-sop-app` (branch main) xong;
   push GitHub (sau).
   Smoke test API đạt: 4 user login đúng gói (admin 26/26 quyền; quanly 18; pheduyet 8;
   nhanvien 11); pheduyet duyệt MEDIUM cho version của admin → APPROVED (4 mắt);
   pheduyet duyệt HIGH → 403 INSUFFICIENT_APPROVER_LEVEL; quanly duyệt HIGH → APPROVED;
   admin tự duyệt → APPROVED + selfApproved=1, flagged=1, role=ADMIN; GET /roles → 4 vai trò.
   Dữ liệu demo nguyên vẹn (SAMPLE-SHIPPING, TEST-E2E-17-10, positions); quy trình test
   SMK-D10 đã archive.
7. Docs: `docs/PROGRESS.md`, `docs/HANDOFF.md` (file này), `docs/CHANGELOG.md`,
   traceability `docs/T2_PLAN_DRAFT.md` §5 (dòng D-10); DECISIONS.md đã có D-10 (không ghi đè).

### Chưa làm / chờ

- **Kiểm thử trình duyệt D-10** (cần parent agent — subagent không có live browser):
  https://giangdc-sop-app.pages.dev, login admin/Admin@123 → Tổng quan hiện 2 mục
  "Vai trò ứng dụng" (Quản trị viên) + "Chức vụ" (—); Danh mục Quy trình → Sửa bước:
  ô "Vai trò được bỏ qua (D-10)" load 4 vai trò từ API; luồng submit→duyệt vẫn đúng.
- UI checkbox Vai trò (role_permissions) + Chức vụ ở Quản trị người dùng thuộc **T7**
  (bảng đã sẵn sàng).
- T3 (Execution engine): kế hoạch chưa trình/chưa duyệt.

## Phiên 17/10/2026 (D-09 — mô hình Chức vụ, subagent)

### Đã làm

1. **Contract** (`packages/contracts/src/process.ts`, single source): thêm `PositionDto{id,code,name}`,
   `CreatePositionBody{code,name}`; `UpsertStepBody` dùng `performerPositionIds[]`/`supervisorPositionIds[]`;
   `ProcessStepDto` dùng `performerPositions`/`supervisorPositions: PositionDto[]`; XÓA sạch
   `role`/`roles`/`supervisorRoles` (clean break theo D-09).
2. **Migration 0004** (`apps/api/migrations/0004_positions.sql`): bảng `positions` + `user_positions`;
   rebuild `process_steps` (bỏ cột `role`/`roles_json`/`supervisor_roles_json`, thêm 2 cột
   `performer_position_ids_json`/`supervisor_position_ids_json`); giữ PK/FK/UNIQUE(version_id,code)/
   index. Đã apply D1 `giangdc-sop-demo` (24 bước giữ nguyên).
   Seed `scripts/seed-positions.mjs`: 5 chức vụ (Thủ kho, Thủ quỹ, Quản lý kho, Lễ tân, Giám sát)
   + gán (nhanvien→Thủ kho, quanly→Quản lý kho, pheduyet→Giám sát) — đã apply.
3. **Domain**: validate mảng id chức vụ (trim/dedupe/≤20; mã POSITION_ID_EMPTY/
   POSITION_IDS_TOO_MANY/POSITION_IDS_NOT_ARRAY) — test fail-first 4 case mới.
4. **API**: `processDb.ts` (`listPositions`, `unknownPositionIds`, `toStepDto` resolve id→{id,code,name});
   `stepBodyToColumns` cột mới; POST/PATCH step trả 400 UNKNOWN_POSITION khi id lạ;
   GET /positions (đã login), POST /positions (chỉ admin/manager, 409 khi trùng mã);
   copy version (PRC-003) giữ nguyên position ids. OpenAPI `docs/openapi-t2.yaml` cập nhật.
5. **Web**: StepForm 2 PositionMultiSelect ("Chức vụ thực hiện"/"Chức vụ giám sát", load từ
   GET /positions, hint mobile); StepDetail hiện tên chức vụ; giữ prefill mã bước, validate
   trong modal, loại bằng chứng PRC-006, collapsible. `ROLE_LABEL` giữ cho skip.allowedRoles
   (chưa đổi — follow-up).
6. **Evidence:** lint ✓, typecheck ✓, **56/56 test đạt**; build web sạch; deploy Worker
   `giangdc-sop-demo-api` + Pages `giangdc-sop-app` xong; push GitHub (sau).
   Smoke test API: tạo step position ids → GET đúng tên (THU_KHO→Thủ kho...); id lạ → 400
   UNKNOWN_POSITION; POST /positions tạo "Kế toán" → 201 (đã xóa dọn); bước cũ 11 bước
   SAMPLE-SHIPPING → mảng rỗng, không crash; quy trình test SMK-POS-01 đã archive.

### Chưa làm / chờ
- Kiểm thử trình duyệt 5 điểm D-09 (cần parent agent — subagent không có live browser).
- Follow-up (chờ ý kiến chủ sản phẩm): `skip.allowedRoles` có nên đổi sang chức vụ không?
- UI checkbox Vai trò + Chức vụ ở Quản trị người dùng thuộc T7.

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
