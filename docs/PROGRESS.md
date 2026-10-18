# PROGRESS.md — Trạng thái dự án (nguồn sự thật)

Cập nhật: 18/10/2026 (D-16 hoàn thành).

## Đã verified

- **D-16: bước tuần tự + Báo/Xác nhận hoàn thành — HOÀN THÀNH 18/10/2026 (subagent, user duyệt "Ok").**
  - Domain (`packages/domain/src/execution.ts`): mới `canStartStepByOrder(steps, targetSortOrder)` —
    bước chỉ mở khi mọi bước có sortOrder nhỏ hơn đều DONE (áp dụng cả bước tùy chọn);
    TRANSITIONS thêm `IN_PROGRESS → PENDING_APPROVAL` (báo hoàn thành) và
    `PENDING_APPROVAL → IN_PROGRESS` (hủy báo/từ chối) — test fail-first, **93/93 đạt**
    (85 cũ + 8 mới).
  - API (`apps/api/src/executions.ts`): XÓA endpoint POST `/executions/:id/complete`;
    `/submit` đổi thành "Báo hoàn thành" — nhận IN_PROGRESS (giữ COMPLETED tương thích)
    → PENDING_APPROVAL, chuyển logic allRequiredStepsDone sang đây (thiếu → 400
    STEPS_INCOMPLETE, giữ message cũ); `/cancel-submit` và `/reject` đổi về
    PENDING_APPROVAL → IN_PROGRESS (giữ lý do bắt buộc); text thông báo: submit →
    "Lượt … đã báo hoàn thành", approve → "… đã được xác nhận hoàn thành",
    reject → "… bị từ chối xác nhận: {lý do}".
    Step start: chỉ cho khi lượt IN_PROGRESS (bỏ CREATED + bỏ auto-transition
    CREATED→IN_PROGRESS); kiểm tra tuần tự qua `getExecutionSteps` + `canStartStepByOrder`
    → 409 `STEP_OUT_OF_ORDER` 'Phải hoàn thành các bước trước theo thứ tự.'
    OpenAPI mới: `docs/openapi-d16.yaml`.
  - Web (`apps/web/src/executions.tsx`): EXEC_STATE_LABEL — PENDING_APPROVAL='Chờ xác nhận'
    (cũ 'Chờ duyệt'), APPROVED='Hoàn thành' (cũ 'Đã duyệt'); `StepWorkCard` thêm prop
    `blockedByOrder` — bước bị khóa: ẩn nút "Bắt đầu"/"Bắt đầu bước", hiện gợi ý
    "🔒 Hoàn thành các bước trước để mở bước này." (vẫn hiện "👥 Phân công" để gán trước);
    ExecutionDetail tính `blockedByOrder` từ `sortOrder`. Nút lượt: Đang thực hiện bỏ
    "✓ Hoàn thành lượt" → thêm "📤 Báo hoàn thành" (gọi submit, giữ disable khi còn
    bước bắt buộc dở); xóa section nút state COMPLETED (không còn đường vào UI);
    Chờ xác nhận: "↩ Hủy báo hoàn thành" (người báo), "✓ Xác nhận hoàn thành"/"✕ Từ chối"
    (người duyệt = supervisor hoặc senior); vết duyệt đổi text tương ứng.
  - Build: `tsc --noEmit` ✓ (0 lỗi), `pnpm test` **93/93**.
  - Chưa deploy/commit/push (parent tự làm); kiểm thử trình duyệt chờ parent agent.

- **D-15: bằng chứng mở rộng + trạng thái lượt + thông báo 2 chiều — HOÀN THÀNH 18/10/2026 (subagent, user duyệt "Đồng ý").**
  - Migration 0009 (`apps/api/migrations/0009_execution_approval.sql`): `executions` thêm
    `approval_requested_by/at`, `approved_by/at`, `approval_note`; bảng mới `notifications`
    (+ index user/is_read/created_at) — đã apply D1 demo.
  - Domain (`packages/domain/src/execution.ts`): `ExecutionState` thêm PENDING_APPROVAL,
    APPROVED; TRANSITIONS mới (COMPLETED→PENDING_APPROVAL→APPROVED/COMPLETED; APPROVED
    terminal) — test fail-first, **85/85 đạt** (78 cũ + 7 mới).
  - Contract (`packages/contracts/src/execution.ts`): `ExecutionDto` thêm trường duyệt
    (+ tên hiển thị); mới `NotificationDto`, `NotificationType`, `RejectApprovalBody`;
    `ExecutionState` đồng bộ 8 trạng thái.
  - API (`apps/api/src/executions.ts`, `executionDb.ts`, mới `notifications.ts`):
    - Evidence: giới hạn 10MB→**5MB**; kind=FILE mở MIME PDF/Word/Excel
      (PHOTO giữ ảnh); ext theo loại file.
    - MỚI 7 endpoint trạng thái (Idempotency-Key đúng tên + audit):
      POST /executions/:id/start|pause|resume (execution.operate),
      /submit (COMPLETED→PENDING_APPROVAL; người tạo hoặc execution.operate),
      /cancel-submit (chỉ người đã gửi hoặc senior),
      /approve (supervisor của lượt hoặc senior_approver),
      /reject (lý do bắt buộc, cùng quyền approve).
    - Thông báo 2 chiều: helper `createNotification`; submit→báo người duyệt
      (supervisor, không có → senior); approve/reject→báo người gửi;
      assign bước→báo người được gán. MỚI: GET /notifications,
      GET /notifications/unread-count, POST /notifications/:id/read,
      GET /executions/pending-approval-count.
    - OpenAPI: `docs/openapi-d15.yaml` mới.
  - Web (`apps/web/src/executions.tsx`, `App.tsx`):
    - `EvidenceUpload` thay PhotoCapture: 3 nút "📷 Chụp" + "+ Ảnh" + "+ Tệp";
      nén ảnh client (canvas 1920px, JPEG 0.82); >5MB sau nén → lỗi;
      tệp >5MB → lỗi.
    - Chi tiết lượt: nút theo trạng thái — Mới tạo [▶ Bắt đầu]; Đang thực hiện
      [⏸ Tạm dừng] [✓ Hoàn thành lượt] [Hủy lượt]; Tạm dừng [▶ Tiếp tục] [Hủy lượt];
      Hoàn thành [📤 Gửi duyệt]; Chờ duyệt: người gửi [↩ Hủy duyệt], người duyệt
      [✓ Duyệt] [✕ Từ chối] (dialog lý do bắt buộc); Đã duyệt: chip only.
      Hiện vết duyệt (người gửi/người duyệt/thời điểm/lý do).
    - Chuông 🔔 (sidebar + mobile topbar): badge chưa đọc (poll 60s), panel dropdown,
      bấm → đánh dấu đã đọc + nhảy tới chi tiết lượt. Badge số chờ duyệt trên menu
      "Lượt Thực hiện" (chỉ hiện khi > 0).
  - Build: `tsc --noEmit` ✓, `pnpm test` **85/85**; SQL mới verify trực tiếp trên D1 demo.
  - Chưa deploy/commit/push (parent tự làm); kiểm thử trình duyệt chờ parent agent.

- **D-14: thiết kế lại luồng tạo lượt thực hiện — HOÀN THÀNH 18/10/2026 (subagent, user duyệt "Đồng ý").**
  - Migration 0008 (`apps/api/migrations/0008_execution_extras.sql`): `executions` thêm
    `title`, `execution_date`, `execution_time`, `shift`, `main_performer_id`,
    `supervisor_id` (nullable) — đã apply D1 demo (6 ALTER OK).
  - Contract (`packages/contracts/src/execution.ts`): `CreateExecutionBody` thêm 7 trường
    D-14, `assignments` thành optional; mới `AssignStepBody`, `ExecutionShift`;
    `ExecutionDto` thêm title/executionDate/executionTime/shift/mainPerformer(Id/Name)/supervisor(Id/Name).
  - Domain (`packages/domain/src/execution.ts`): `normalizeExecutionCreate`
    (default ngày=hôm nay, người tạo=người gọi; validate YYYY-MM-DD/HH:MM/enum ca),
    `checkStepAssignees`, `isValidShift` — test fail-first, **77/77 đạt** (65 cũ + 12 mới).
  - API (`apps/api/src/executions.ts`, `executionDb.ts`): POST /executions nhận trường mới,
    validate user tồn tại, assignments optional → bước thiếu gán = NULL ("chưa phân công");
    MỚI POST /executions/:id/steps/:stepId/assign (quyền execution.operate,
    tái kiểm tra chức vụ như lúc tạo, chặn khi bước DONE/lượt COMPLETED/CANCELLED,
    Idempotency-Key bắt buộc đúng tên); `toExecutionDto` JOIN tên người mới.
    OpenAPI bổ sung: `docs/openapi-t3-d14.yaml`.
  - Web (`apps/web/src/executions.tsx`): form tạo lượt viết lại đơn giản
    (Quy trình* chỉ bản ACTIVE + Tiêu đề + Ngày* + Giờ + Ca + Người tạo* + Người thực hiện
    chính + Người giám sát → Tạo → tự chuyển sang chi tiết); chi tiết lượt hiện trường mới;
    mỗi bước PENDING có nút "Bắt đầu" + "👥 Phân công"; dialog phân công hiện
    "Tên — Chức vụ", lọc theo vai trò bước; bước chưa phân công: bấm Bắt đầu tự gán
    cho người bấm nếu chức vụ khớp. Giữ nguyên chụp ảnh/bằng chứng.
  - Build: `tsc --noEmit` ✓, eslint ✓, web build ✓ (chưa deploy — parent tự deploy sau verify).
  - Kiểm thử trình duyệt: chờ parent agent (subagent không có live browser).

- **T3: Lượt thực hiện + Chụp ảnh bằng chứng — HOÀN THÀNH 18/10/2026 (D-12).**
  - Contract: `packages/contracts/src/execution.ts` (ExecutionDto, ExecutionStepDto,
    EvidenceDto, CreateExecutionBody).
  - Migration 0007: `executions`, `execution_steps` (snapshot bước), `evidence` — đã apply D1 demo.
  - Domain: step lifecycle PENDING→IN_PROGRESS→DONE, `allRequiredStepsDone`,
    `photoRequired` (PRC-006), `assigneeMatchesPositions` (D-09/D-12),
    `generateExecutionCode` (TH-YYYYMMDD-XXXX) — test fail-first, 65/65 đạt.
  - API (`apps/api/src/executions.ts` + `executionDb.ts`): 10 endpoint
    (tạo lượt idempotent, danh sách/lọc scope/mine, chi tiết, start/complete bước,
    kết thúc/hủy lượt, upload ảnh multipart→R2 10MB, tải ảnh từ R2, assignable-users).
    Gate: execution.create/view/operate + assignee-only (403 + audit) + scope.
  - Web (`apps/web/src/executions.tsx`): menu "Lượt Thực hiện" — danh sách (Của tôi/Tất cả),
    chi tiết lượt + tiến độ, form tạo lượt (gán người theo chức vụ), nút "Chụp ảnh"
    (camera trên mobile), preview + tải ảnh, hoàn thành bước.
  - Smoke test API đạt toàn bộ: tạo lượt 11 bước → start → upload ảnh → DONE;
    người không được gán → 403; bước yêu cầu PHOTO mà chưa có ảnh → 400;
    gán sai chức vụ → 400; kết thúc khi còn bước dở → 400.
  - Lượt demo: **TH-20261017-B4NE** (SAMPLE-SHIPPING, 11 bước gán nhanvien, B01 đã DONE).
  - OpenAPI: `docs/openapi-t3.yaml`.



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

- **T2 mở rộng — form bước + danh sách bước (17/10/2026, theo 5 yêu cầu chủ sản phẩm).**
  - Contract: `UpsertStepBody`/`ProcessStepDto` thêm `roles[]` + `supervisorRoles[]`
    (`role` deprecated, tương thích đọc/ghi 2 chiều); `ProcessDto.createdByName`.
  - Migration 0003 (`roles_json`, `supervisor_roles_json` + backfill từ `role` cũ) đã apply D1 demo.
  - Domain: validate mảng vai trò (trim/dedupe/≤20) — 3 test mới, **55/55 test đạt**.
  - API: INSERT/UPDATE/copy bước ghi 2 cột JSON; list/detail process JOIN users → createdByName.
  - Web: StepForm multi-select vai trò thực hiện + giám sát; validate client + lỗi server
    hiện trong modal (`.form-error`); danh sách bước collapsible ("Chi tiết ▾", mặc định gọn);
    fix `.step-main{min-width:0}` (bóp chữ mobile); danh sách + chi tiết quy trình hiện
    "Người tạo · Ngày tạo".
  - Smoke test API đạt: tạo step roles=[manager,supervisor]/supervisor=[admin,manager] → GET đúng;
    legacy `role:"author"` → roles=["author"]; dedupe OK; createdByName="Admin Hệ thống".
  - Deploy Worker + Pages production xong. Kiểm thử trình duyệt web chờ parent agent.

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
- **UI pro + remember me (17/10 chiều, theo yêu cầu user):**
  - Logo chữ S từ node quy trình (tự gen bằng media pipeline, `apps/web/public/logo.webp`),
    gắn ở trang đăng nhập, sidebar, màn hình loading và favicon.
  - Font Be Vietnam Pro; form login thêm checkbox "Ghi nhớ đăng nhập (30 ngày)"
    (mặc định tích) + nút Hiện/Ẩn mật khẩu.
  - API `POST /auth/login` nhận `rememberMe` → session 30 ngày (không tích: 8 giờ).
  - Dashboard thành app-shell sidebar: menu phân hệ (5 mục T2–T6 disabled "sắp ra mắt"),
    thẻ người dùng + đăng xuất.
  - Test trình duyệt 6/6 bước đạt trên production (reload giữ đăng nhập, logout sạch).
- **Header/footer + mobile (17/10 chiều, theo góp ý user):**
  - Trang login có footer `.site-footer` (© 2026 SOP Platform · bản demo T1.2);
    dùng flex column nên trên mobile footer luôn nằm ngay dưới form, hết cụt ngủn.
  - Dashboard có header `.topbar` (breadcrumb Trang chủ/Tổng quan, tiêu đề, ngày
    tiếng Việt tự động, badge DEMO) + footer `.app-footer`.
  - Test desktop đạt; mobile kiểm tra qua CSS build.
  - Tinh chỉnh thêm mobile: sidebar gọn (menu cuộn ngang), brand panel gọn
    (ẩn đoạn dài, tới form nhanh), theme-color #0c1a38, bảng demo cuộn ngang.

## Quyết định đã chốt (G1)

- OPEN-SOD-01: vai trò phê duyệt = người phê duyệt + admin + quản lý; 4 mắt mặc định;
  admin/quản lý tự duyệt có lưu vết + gắn cờ; ánh xạ severity → cấp phê duyệt.
- OPEN-DATA-01: 9 trường chung của Lượt thực hiện.
- OPEN-SCOPE-01: cây 2 cấp (org root → đơn vị/kho OFFICE/WAREHOUSE).

## Tiếp theo

- **T3 — Execution engine + step lifecycle** (EXE-001..013, BR-008/009/014).
  AC-03, AC-04, AC-07, AC-09, AC-16, AC-18. Kế hoạch chờ duyệt.

## T2 hoàn thành (17/10/2026 chiều)

- **T2.1 Domain** (`packages/domain/src/process.ts`): máy trạng thái phiên bản 7 trạng thái
  (SRS §7.1/§7.5), khóa sửa từ IN_REVIEW, resolveActivation (1 ACTIVE + 1 SCHEDULED,
  supersede nguyên tử, retry idempotent), validateVersionForSubmit (PRC-009 + BR-003),
  checkVersionApproval (GOV-004 + OPEN-SOD-01 + D-08). Test fail-first: 33 test mới,
  tổng 52/52 đạt.
- **T2.2 Migration 0002**: 6 bảng + partial unique index cưỡng chế 1 ACTIVE/1 SCHEDULED (AC-02);
  seed SAMPLE-SHIPPING 11 bước "Xuất hàng đến đại lý" (Shipping.pdf), v1 ACTIVE.
- **T2.3 API** (21 endpoint, `apps/api/src/processes.ts`): CRUD/tìm kiếm, tạo version bằng copy,
  step CRUD + reorder, cấu hình completion/skip/failure, validate, submit→comment→return→
  approve→release→activate→retire; Idempotency-Key bắt buộc 6 mutation (replay/CONFLICT);
  optimistic concurrency; OpenAPI `docs/openapi-t2.yaml`.
  Smoke test live đạt toàn bộ (4-mắt, D-08, supersede nguyên tử, schedule kép bị từ chối).
- **T2.4 Web** (`apps/web/src/processes.tsx`): nav "Danh mục Quy trình" live; danh sách,
  timeline phiên bản, trình soạn (12 trường/PRC-005), thẩm định/phê duyệt/phát hành.
  Deploy Pages production xong. AC-12 chờ kiểm tra trình duyệt.
- **D-09 mô hình Chức vụ** (17/10/2026, subagent): bước chuyển từ vai trò hệ thống sang
  `Chức vụ thực hiện[]` + `Chức vụ giám sát[]` (id → bảng `positions`); migration 0004
  (rebuild `process_steps`, dọn cột 0003) + seed 5 chức vụ đã apply D1 demo; API
  GET/POST `/positions` + validate id tồn tại; web form dùng multi-select chức vụ từ API.
  56/56 test đạt; smoke test API đạt; deploy Worker + Pages xong; kiểm thử trình duyệt chờ.
- **D-10 vai trò ứng dụng mở rộng** (17/10/2026, subagent — đã duyệt): thay 7 vai trò cứng
  bằng bảng `roles` (Quản trị viên/Quản lý/Người phê duyệt/Người thực hiện) +
  `role_permissions` (27 mã quyền giữ nguyên) + `user_roles`; migration 0005 đã apply D1 demo
  (DROP `user_system_roles`); 4 mắt mới: người duyệt = user khác có `process.approve`,
  HIGH/BLOCKING cần cờ `senior_approver`, tự duyệt chỉ senior + gắn cờ.
  Domain viết lại (test fail-first); API `/auth/me` trả roles[]/positions[]/permissions[];
  GET `/roles` mới; `skip.allowedRoles` validate theo mã vai trò động; web hiện 2 mục
  "Vai trò ứng dụng"/"Chức vụ". 56/56 test đạt; smoke test API đạt (4 user đúng gói quyền,
  pheduyet duyệt MEDIUM ok, HIGH→403, quanly HIGH ok, admin tự duyệt flagged=1);
  deploy Worker + Pages xong; kiểm thử trình duyệt chờ (parent agent).

## Rủi ro / chờ quyết định

- **Kiểm thử trình duyệt D-10** (cần parent agent — subagent không có live browser):
  https://giangdc-sop-app.pages.dev, login admin/Admin@123 → Tổng quan hiện 2 mục
  "Vai trò ứng dụng"/"Chức vụ"; Danh mục Quy trình → form bước: ô "Vai trò được bỏ qua"
  load 4 vai trò từ API; luồng duyệt vẫn đúng.
- UI checkbox Vai trò + Chức vụ ở Quản trị người dùng thuộc T7 (bảng đã sẵn sàng).

- Thiếu file SRS v1.5 FINAL Rev.9 (Technical Reference).
- Deploy tự động GitHub Actions → Cloudflare chưa dựng (cần user tự thêm
  CLOUDFLARE_API_TOKEN vào repo secret). Hiện deploy demo thủ công từ máy dev.
