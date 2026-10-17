# T3 — Execution engine + step lifecycle — KẾ HOẠCH NHÁP

> **Trạng thái: NHÁP — chưa duyệt, chưa áp dụng.** Do research chuẩn bị ngày
> 17/10/2026 từ SRS v1.6 (không phải từ v1.5 Rev.2). Chưa ghi chi tiết vào TASKS.md.
> Chờ chủ sản phẩm duyệt mới triển khai (AGENTS.md §1).

## 1. Phạm vi (khóa theo SRS v1.6)

| Nhóm | Mã | Mức |
|---|---|---|
| Khởi tạo và thực hiện công việc | EXE-001..009, EXE-011..013 | MUST |
| Giao lại công việc | EXE-010 (giao lại có lý do + audit; không đổi người đã thực hiện bước cũ) | SHOULD |
| Quy tắc nghiệp vụ | BR-008 (retry không tạo kết quả trùng), BR-009 (dữ liệu chưa server-xác-nhận hiển thị "chưa đồng bộ"), BR-013 (backend trả allowed actions; client không tự suy quyền), BR-014 (endpoint REQUIRED dùng Idempotency-Key) | MUST |
| Nghiệm thu | AC-03 (điều kiện hoàn thành bước), AC-04 (thứ tự bắt buộc), AC-07 (retry an toàn), AC-09 (mobile + đồng bộ), AC-16 (Việc của tôi + allowed actions), AC-18 (reopen an toàn) | — |

**Ngoài phạm vi:** exception/rework lifecycle (T5: EXP-001..006, AC-05/05A..05F);
evidence upload (T4: EVD-001..013) — T3 kiểm tra yêu cầu bắt buộc theo *contract*
bản ghi evidence, upload thật do T4 làm (xem mục 4, điểm 2).

## 2. Ràng buộc đã chốt (không đảo ngược)

- **Máy trạng thái Execution (SRS §7.2–§7.5 — INVARIANT/CONTRACT):**
  `CREATED → IN_PROGRESS ⇄ PAUSED → BLOCKED → IN_PROGRESS → COMPLETED / CANCELLED`.
  `CANCELLED` là terminal; hủy là một use-case thống nhất (quyền + lý do bắt buộc +
  concurrency). Reopen `COMPLETED → IN_PROGRESS` chỉ khi feature/policy cho phép (AC-18).
- **Hai predicate blocker (§7.4 — INVARIANT):** tính riêng, recompute trong cùng
  transaction sau mọi command/decision. `BLOCKED → IN_PROGRESS` chỉ khi
  progress_blocker_count = 0; chỉ COMPLETED khi completion_blocker_count = 0.
  Trong MVP chỉ ExceptionCase severity BLOCKING tạo blocker — ExceptionCase thuộc T5;
  T3 dựng hook tính toán, T5 cung cấp nguồn blocker.
- **Step lifecycle:** `NOT_STARTED/REOPENED → start → …`; **cấm** direct
  start/complete/fail/skip/reopen (§7.3). Chế độ tuần tự: chặn bước sau khi bước
  trước chưa đạt (EXE-006); AC-04: bước 1 chưa PASSED/SKIPPED hợp lệ → start bước 2
  trả `PREVIOUS_STEP_INCOMPLETE`, không tạo attempt.
- **Snapshot (EXE-002, EXE-012, BR-004/011/012/015):** mã lượt duy nhất; snapshot
  bước/yêu cầu/vai trò tại lúc tạo; người tạo + thời gian máy chủ; execution tham
  chiếu `version_id` bất biến (BR-004 đã có từ T2); chi tiết lượt trả đủ snapshot để
  tái hiện đúng version (steps, current step, attempts, requirements, form/document
  binding, instruction media, evidence/exception theo quyền, progress, allowed actions);
  evidence/dữ liệu biểu mẫu gắn đúng attempt, không ghi đè attempt cũ khi làm lại;
  không snapshot signed URL — chỉ object reference, URL cấp ngắn hạn sau kiểm quyền.
- **Dữ liệu & scope (OPEN-DATA-01, OPEN-SCOPE-01):** 9 trường chung của Execution;
  mỗi lượt thuộc đúng 1 đơn vị/kho; `scope=mine` theo direct assignment hoặc
  eligibility BusinessRole + permission trong đúng scope (EXE-003, AC-16).
- **Quyền & phê duyệt (OPEN-SOD-01, EXE-008):** pause/resume/cancel/reopen theo quyền;
  hủy và reopen bắt buộc có lý do; reopen cần khóa idempotency, tạo revision mới,
  ghi audit + sự kiện, giữ lịch sử hoàn thành trước (AC-18).
- **Idempotency (BR-008/014, §12.2):** mutation retry không tạo kết quả trùng;
  Idempotency-Key REQUIRED cho: tạo lượt, start/complete bước, pause/resume/cancel,
  reopen (AC-07, AC-18). Cùng key + cùng fingerprint → kết quả tương thích; cùng key
  + payload khác → `IDEMPOTENCY_CONFLICT`. Tái dùng pattern `apps/api/src/idempotency.ts` (T2).
- **Draft & đồng bộ (EXE-013, BR-009, AC-09):** lưu nháp server-side có revision/ETag;
  draft local chưa đồng bộ chỉ là cache, hiển thị rõ "chưa đồng bộ"; mất mạng không
  báo thành công giả; conflict (server revision đã đổi) → conflict flow, không ghi đè
  âm thầm; tiếp tục trên thiết bị khác sau khi server xác nhận. Mobile 360px: không
  cuộn ngang, bàn phím không che hành động chính.
- **Allowed actions (BR-013):** mọi màn hình hiển thị tập hành động do backend trả
  theo state + permission + scope; client không tự suy luận quyền (EXE-004, EXE-011).

## 3. Chia task (theo AGENTS.md §2: domain → API → web; test thất bại trước cho bất biến)

### T3.1 — Domain: execution aggregate + step attempts
- Entity: Execution (9 trường OPEN-DATA-01 + `version_id` bất biến), ExecutionStep
  (snapshot bước), StepAttempt, Assignment (lịch sử phân công), StepDraft (revision/ETag).
- State machine Execution + step transitions; hai predicate blocker (recompute cùng
  transaction); guard tuần tự (EXE-006/AC-04); kiểm tra yêu cầu bắt buộc theo từng
  requirement (EXE-007; lỗi theo từng yêu cầu — AC-03); điều kiện hoàn thành lượt
  (EXE-009: required hợp lệ + completion_blocker_count = 0; optional NOT_STARTED
  không chặn).
- Unit test viết trước cho mọi invariant (fail-first).
- **AC:** AC-03, AC-04 (mức domain). **Evidence:** test suite đạt.

### T3.2 — Persistence: migration + seed mẫu
- D1 migration 0004: các bảng T3.1 + unique index mã lượt + index phục vụ "Việc của tôi"
  (assignee/scope/trạng thái/hạn); partial unique cho current attempt nếu cần.
- Seed demo (SAMPLE): 2–3 lượt mẫu từ SAMPLE-SHIPPING v1 ACTIVE (1 lượt IN_PROGRESS
  đang dở, 1 lượt CREATED mới).
- **Evidence:** migration apply sạch trên D1 demo; data-quality test đạt.

### T3.3 — API: vòng đời execution
- `POST /executions` — tạo lượt: chỉ version ACTIVE trong scope người dùng (EXE-001/002).
- `GET /executions/mine` — tìm kiếm/lọc/sắp xếp theo trạng thái, hạn, quy trình, đơn vị,
  current_step; mỗi item có tiến độ + allowed actions (EXE-011, AC-16).
- `GET /executions/:id` — snapshot đầy đủ tái hiện đúng version (EXE-012).
- `POST /executions/:id/steps/:stepKey/start`, `/complete` (EXE-005/006/007; AC-03/04/07);
  `/pause`, `/resume`, `/cancel` (lý do bắt buộc — EXE-008);
  `/reopen` (feature flag + lý do + idempotency key → revision mới — AC-18).
- `PUT /executions/:id/steps/:stepKey/draft` — revision/ETag; conflict → 409 + conflict
  flow (EXE-013, BR-009).
- Idempotency-Key REQUIRED cho các mutation trên (BR-014); lỗi chuẩn
  {code, message, requestId}; cập nhật OpenAPI; **contract/schema trước UI** (AGENTS.md §2).
- **Evidence:** integration test đạt; OpenAPI render đúng.

### T3.4 — Web: Việc của tôi + màn hình thực hiện
- Trang "Việc của tôi": danh sách lượt (lọc trạng thái/hạn/quy trình/đơn vị), tiến độ,
  allowed actions từ backend (AC-16).
- Màn hình thực hiện bước: tên, mã, tiến độ, bước hiện tại, hạn, trạng thái đồng bộ
  hiển thị nhất quán mọi màn hình (EXE-004); start/lưu nháp/hoàn thành từng bước
  (EXE-005); trạng thái "chưa đồng bộ" nhìn thấy được khi offline (BR-009, AC-09);
  mobile 360px không cuộn ngang (AC-09).
- **AC:** AC-09, AC-16. **Evidence:** E2E thao tác chính đạt.

### T3.5 — E2E + demo
- Luồng đầy đủ trên demo: tạo lượt → giao việc → thực hiện từng bước → lưu nháp →
  hoàn thành → pause/resume → cancel có lý do → reopen (flag bật).
- AC-07: gửi lại complete với cùng idempotency key → đúng 1 transition, response
  tương thích. EXE-001: tạo lượt từ version không ACTIVE → bị từ chối.
- **AC:** AC-03, AC-04, AC-07, AC-09, AC-16, AC-18. **Evidence:** CI xanh + ảnh chụp luồng.

## 4. Điểm cần chủ sản phẩm chốt (chưa quyết — không tự suy diễn)

1. **EXE-010 (SHOULD) — giao lại công việc:** làm trong T3 hay dời sang task sau?
2. **Phụ thuộc T4 (evidence upload):** EXE-007/AC-03 cần kiểm tra "yêu cầu bắt buộc đã
   đủ" (vd: 1 ảnh + 1 xác nhận). Đề xuất: T3 dùng contract bản ghi evidence tối thiểu
   (seed tay cho E2E), T4 thay bằng upload thật — hay muốn gộp upload tối thiểu vào T3?
3. **Reopen (AC-18):** feature flag mặc định BẬT hay TẮT trên demo?
4. **Seed demo:** tạo 2–3 lượt mẫu như T3.2, hay để trống để chủ sản phẩm tự tạo?

## 5. Khung truy vết (điền khi triển khai, theo §20.5)

| Requirement ID | Code path | Test | Evidence |
|---|---|---|---|
| (điền khi triển khai) | | | |
