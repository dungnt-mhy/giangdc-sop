# T2 — Process Catalog + Authoring & Governance — KẾ HOẠCH NHÁP

> **Trạng thái: NHÁP — chưa duyệt, chưa áp dụng.** Do research chuẩn bị ngày
> 17/10/2026 từ SRS v1.6 (không phải từ v1.5 Rev.2). Chưa ghi vào TASKS.md.
> Chờ chủ sản phẩm duyệt mới triển khai (AGENTS.md §1).

## 1. Phạm vi (khóa theo SRS v1.6)

| Nhóm | Mã | Mức |
|---|---|---|
| Catalog & soạn thảo | PRC-001..009 | MUST |
| Catalog & soạn thảo | PRC-010 (xem trước mobile + sơ đồ tuyến tính), PRC-011 (thư viện bước/mẫu biểu dùng chung) | SHOULD |
| Quản trị phiên bản | GOV-001..007 | MUST |
| Quản trị phiên bản | GOV-008 (nhắc xem xét), GOV-009 (phân loại thay đổi nhỏ/lớn) | SHOULD |
| Quy tắc nghiệp vụ | BR-002 (không xóa vật lý), BR-003 (change_summary bắt buộc; thay đổi lớn cần đánh giá tác động), BR-004 (phiên bản mới không di chuyển lượt đang chạy) | MUST |
| Nghiệm thu | AC-01 (nhiều quy trình độc lập), AC-02 (phiên bản & dependency bất biến), AC-12 (desktop đầy đủ ≥1024px) | — |

**Ngoài phạm vi:** PRC-012 (canvas BPMN, DEFERRED); `effective_to` tự retire
(không có trong MVP, SRS §7.1).

## 2. Ràng buộc đã chốt (không đảo ngược)

- **D-01 + AC-12:** bố cục desktop đầy đủ; mobile ưu tiên thao tác hiện trường.
- **D-03:** soạn bằng form + sắp xếp danh sách (PRC-004: kéo lên/xuống hoặc
  drag reorder danh sách) — không designer kéo-thả (đó là PRC-012, đã loại).
- **D-04:** nhiều quy trình, mỗi quy trình nhiều phiên bản.
- **OPEN-SOD-01 (ghi đè GOV-004):** người phê duyệt phiên bản =
  `người phê duyệt` + `admin` + `quản lý`; 4 mắt mặc định; admin/quản lý được
  tự duyệt nhưng bắt buộc lưu vết audit + hệ thống gắn cờ.
- **Máy trạng thái phiên bản (SRS §7.1, §7.5 — INVARIANT/CONTRACT):**
  `DRAFT → IN_REVIEW → APPROVED → ACTIVE` (qua `SCHEDULED` nếu
  `effective_from` ở tương lai) `→ SUPERSEDED → RETIRED`; trả sửa về `DRAFT`.
  Mỗi Process tối đa **một ACTIVE + một SCHEDULED chưa kích hoạt**; kích hoạt
  phiên bản mới phải chuyển ACTIVE cũ → SUPERSEDED **trong cùng transaction**;
  activation idempotent (AC-02: retry không tạo nhiều ACTIVE/event).
- **Bất biến nội dung:** từ IN_REVIEW trở đi khóa sửa (GOV-001); version đã
  phát hành không được sửa (AC-02, BR-002); form/document được version
  IN_REVIEW+ tham chiếu thì sửa phải tạo version mới (AC-02); copy từ thư viện
  dùng chung phải tạo snapshot (PRC-011).
- **§11.2:** schema JSON version hóa trong contract của implementation, có test
  tương thích; không lưu mã thực thi tùy ý trong cấu hình.

## 3. Chia task (theo AGENTS.md §2: domain → API → web; test thất bại trước cho bất biến)

### T2.1 — Domain: entity + máy trạng thái phiên bản
- Entity: Process, ProcessVersion, ProcessStep (+ ReviewComment, ApprovalRecord).
- State machine 7 trạng thái + transition hợp lệ; invariant: 1 ACTIVE/Process,
  atomic supersede, khóa sửa từ IN_REVIEW, BR-002/003/004.
- Unit test viết trước cho mọi invariant (fail-first).
- **AC:** AC-02 (mức domain). **Evidence:** test suite đạt.

### T2.2 — Persistence: migration + seed mẫu
- D1 migration 0002: các bảng T2.1 + partial unique index cưỡng chế 1 ACTIVE
  (SRS §7.1: "unique/partial index hoặc cơ chế nguyên tử tương đương").
- Seed demo (SAMPLE): 1 quy trình mẫu 11 bước "Xuất hàng đến đại lý"
  (từ Shipping.pdf — đã xác minh 11 bước ngày 17/10).
- **Evidence:** migration apply sạch trên D1 demo; data-quality test đạt.

### T2.3 — API: catalog + vòng đời phiên bản
- CRUD/tìm kiếm/lọc quy trình (PRC-001/002); tạo version bằng copy (PRC-003).
- Step CRUD + reorder (PRC-004/005); cấu hình completion/skip/failure
  (PRC-006/007/008 — failure chỉ: dừng/làm lại/chuyển giám sát/hủy).
- Validate bản nháp → danh sách lỗi theo bước/trường (PRC-009).
- Luồng quản trị: submit (khóa sửa) → comment → return → approve (theo
  OPEN-SOD-01) → release ngay/theo lịch → supersede nguyên tử → retire
  (GOV-001..007); `change_summary` bắt buộc (BR-003).
- Idempotency cho mutation (bảng §12.4); lỗi chuẩn {code,message,requestId};
  cập nhật OpenAPI; **contract/schema trước UI** (AGENTS.md §2).
- **Evidence:** integration test đạt; OpenAPI render đúng.

### T2.4 — Web: danh sách + trình soạn + màn hình duyệt
- Danh sách/tìm kiếm quy trình; form soạn bước đủ 12 trường PRC-005;
  cấu hình PRC-006/007/008; hiển thị lỗi validate theo bước/trường.
- Màn hình thẩm định/phê duyệt/phát hành + timeline phiên bản.
- Bố cục desktop đầy đủ AC-12/D-01 (bảng rộng cuộn trong vùng bảng;
  chọn tệp khi không có camera).
- **AC:** AC-12. **Evidence:** E2E thao tác chính đạt.

### T2.5 — E2E + demo
- Luồng đầy đủ trên demo: tạo → soạn → validate → thẩm định → phê duyệt →
  phát hành → bản mới supersede bản cũ (giữ AC-02: execution cũ tái hiện
  đúng version 1).
- **AC:** AC-01, AC-02, AC-12. **Evidence:** CI xanh + ảnh chụp luồng.

## 4. Điểm cần chủ sản phẩm chốt (chưa quyết — không tự suy diễn)

1. **4 mục SHOULD** (PRC-010, PRC-011, GOV-008, GOV-009): làm trong T2 hay
   dời sang task sau? Lưu ý: BR-003 (MUST) đã bắt `change_summary` + đánh giá
   tác động cho thay đổi lớn, nên phần MUST của GOV-009 coi như đã có.
2. **Ánh xạ severity → cấp phê duyệt** (OPEN-SOD-01 bổ sung) có áp dụng cho
   phê duyệt *phiên bản quy trình* (GOV-004) không, hay chỉ cho phê duyệt
   ngoại lệ? Đề xuất: áp cùng mapping (bản thay đổi lớn/HIGH → quản lý trở lên).
3. **URL evidence cho T2.5 — ĐÃ CHỐT (17/10/2026):** dùng Pages project
   production riêng `giangdc-sop-app` (https://giangdc-sop-app.pages.dev);
   project `giangdc-sop-demo` đã xóa; site github.io
   (https://dungnt-mhy.github.io/giangdc-sop/) đồng bộ qua workflow
   deploy-pages.

## 5. Khung truy vết (điền khi triển khai, theo §20.5)

> Hoàn thành 17/10/2026. Evidence: 52 unit test domain đạt (`pnpm --workspace-concurrency=1 -r test`);
> smoke test API live trên demo (21 endpoint) đạt — xem chi tiết trong HANDOFF.

| Requirement ID | Code path | Test | Evidence |
|---|---|---|---|
| PRC-001 | `apps/api/src/processes.ts` POST /processes (+migration 0002) | smoke 1: tạo process + draft v1 → 201 | curl demo đạt |
| PRC-002 | `apps/api/src/processDb.ts` listProcesses; GET /processes | smoke: `?q=` lọc đúng | curl demo đạt |
| PRC-003 | POST /processes/:id/versions (copy steps) | smoke 12: v2 copy đủ 2 bước | curl demo đạt |
| PRC-004 | POST/PATCH/DELETE steps, POST reorder | smoke 5: thêm/sửa/xóa/sắp xếp | curl demo đạt |
| PRC-005 | `packages/domain/src/process.ts` blankStep (12 trường); StepForm web | unit: blankStep đủ 12 trường | 52/52 test đạt |
| PRC-006 | completion_json (contract §11.2); StepForm nhập yêu cầu | unit validate COMPLETION_LABEL_REQUIRED | 52/52 test đạt |
| PRC-007 | skip_json; validate SKIP_ROLES_REQUIRED | unit + smoke | 52/52 test đạt |
| PRC-008 | failure_policy CHECK (STOP/RETRY/ESCALATE/CANCEL) | smoke: tạo bước RETRY | curl demo đạt |
| PRC-009 | `validateVersionForSubmit`; POST /versions/:id/validate | unit 6 case; smoke 4/6: lỗi theo bước/trường | 52/52 + curl đạt |
| GOV-001 | submit DRAFT→IN_REVIEW; isEditableState | unit khóa sửa; smoke 7/8: VERSION_LOCKED | 52/52 + curl đạt |
| GOV-002 | review_comments; POST comments | smoke 9: góp ý lưu đúng author | curl demo đạt |
| GOV-003 | POST return IN_REVIEW→DRAFT + approval RETURNED | smoke 16: về DRAFT, giữ lịch sử | curl demo đạt |
| GOV-004 | POST approve + approval_records (người/thời gian/vai trò/quyết định) | unit D-08; smoke 10/14/15 | 52/52 + curl đạt |
| GOV-005 | POST release (ngay/theo lịch) | smoke 11/17b: ACTIVE / SCHEDULED | curl demo đạt |
| GOV-006 | release batch nguyên tử + partial unique index | smoke 12: v1→SUPERSEDED, v2→ACTIVE | curl demo đạt |
| GOV-007 | POST retire SUPERSEDED→RETIRED | smoke 20: RETIRED | curl demo đạt |
| BR-001 | code UNIQUE; (process_id, version_no) UNIQUE; nextVersionNo | unit; smoke 3: mã trùng → 409 | đạt |
| BR-002 | không DELETE vật lý process/version (chỉ ARCHIVED/RETIRE) | — (quy ước code) | review code |
| BR-003 | validateVersionForSubmit: CHANGE_SUMMARY_REQUIRED, IMPACT_ASSESSMENT_REQUIRED | unit 3 case; smoke 6 | 52/52 + curl đạt |
| PRC-005 ext (roles) | ~~contract: `roles[]`, `supervisorRoles[]` (role deprecated); migration 0003~~ — **ĐÃ THAY BẰNG D-09 (xem dòng dưới)** | unit cũ | thay thế 17/10/2026 |
| D-09 (mô hình chức vụ) | contract: `PositionDto`, `CreatePositionBody`; `UpsertStepBody.performerPositionIds[]`/`supervisorPositionIds[]`; `ProcessStepDto.performerPositions`/`supervisorPositions: PositionDto[]`; migration 0004 (bảng `positions` + `user_positions`, rebuild `process_steps` bỏ `role`/`roles_json`/`supervisor_roles_json`); domain validate POSITION_ID_EMPTY/POSITION_IDS_TOO_MANY/POSITION_IDS_NOT_ARRAY; API `stepBodyToColumns` + `unknownPositionIds` (400 UNKNOWN_POSITION) + GET/POST `/positions` (POST chỉ admin/manager); Web StepForm 2 PositionMultiSelect (load từ API) + StepDetail hiện tên chức vụ | unit: 4 case D-09 mới; smoke: tạo step position ids → GET đúng tên; id lạ → 400; POST /positions → 201; bước cũ → mảng rỗng | 56/56 test + curl demo đạt (17/10/2026) |
| YC2 (UX) | StepForm `ferr` + `.form-error`; validate client mã/tiêu đề; `saveStep` throw tiếp lỗi server | kiểm thử trình duyệt (parent agent) | chờ E2E |
| YC3 (UX) | `StepRowView` collapsible (đầu dòng gọn + "Chi tiết ▾"); `.step-main{min-width:0}` fix bóp chữ mobile | kiểm thử trình duyệt (parent agent) | chờ E2E |
| YC4 | `ProcessDto.createdByName` (JOIN users); ProcessList + ProcessDetail hiện "Người tạo · Ngày tạo" | smoke: list/detail → createdByName="Admin Hệ thống" | curl demo đạt (17/10/2026) |
| D-10 (vai trò ứng dụng) | contract: `RoleDto{id,code,name,seniorApprover}`, `CreateRoleBody`; migration 0005 (`roles` + `role_permissions` + `user_roles`, seed 4 vai trò/63 quyền, gán 4 user demo, DROP `user_system_roles`); domain `roles.ts`/`permissions.ts`/`sod.ts` viết lại (quyền từ DB, SOD: process.approve + senior cho HIGH/BLOCKING, self-approve chỉ senior + gắn cờ); `checkVersionApproval` input mới; API `db.ts`/`middleware.ts`/`env.ts`/`auth.ts` (`/auth/me` trả roles[]/positions[]/permissions[]), GET `/roles`, `skip.allowedRoles` validate động (400 UNKNOWN_ROLE), POST `/positions` kiểm tra senior; Web App.tsx 2 mục "Vai trò ứng dụng"/"Chức vụ", processes.tsx vai trò động; OpenAPI cập nhật | unit: SOD/permissions/checkVersionApproval fail-first mới; smoke API: 4 user đúng gói, 4 mắt, HIGH cần senior (403/200), self-approve flagged=1 | 56/56 test + curl demo đạt (17/10/2026) |
| BR-004 | execution tham chiếu version_id bất biến (T3 dùng) | — | hoãn sang T3 |
| BR-008/014 | `apps/api/src/idempotency.ts`; Idempotency-Key REQUIRED 6 mutation | smoke 2/3: replay + CONFLICT | curl demo đạt |
| AC-01 | nhiều process độc lập | smoke: 4 process tạo độc lập | curl demo đạt |
| AC-02 | resolveActivation + partial index + retry alreadyActive | unit 4 case; smoke 12/13/18 | 52/52 + curl đạt |
| AC-12 | UI desktop đầy đủ (bảng cuộn trong vùng, thao tác chuột/bàn phím) | — | kiểm tra trình duyệt (chờ parent) |
