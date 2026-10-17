# CHANGELOG.md — Lịch sử thay đổi dự án

## 17/10/2026 — D-09: mô hình Chức vụ thay vai trò hệ thống ở bước

- Phân biệt Vai trò hệ thống (7 role, chỉ phân quyền) với Chức vụ (thủ kho, thủ quỹ...):
  bước dùng `Chức vụ thực hiện[]` + `Chức vụ giám sát[]` (id tham chiếu bảng `positions`).
- Contract: `PositionDto`, `CreatePositionBody`; xóa sạch `role`/`roles`/`supervisorRoles` ở bước.
- Migration 0004: bảng `positions` + `user_positions`; rebuild `process_steps` (dọn cột 0003);
  seed 5 chức vụ + gán user demo; đã apply D1 demo.
- API: GET/POST `/positions` (POST chỉ admin/manager); step validate id chức vụ tồn tại
  (400 UNKNOWN_POSITION); OpenAPI cập nhật.
- Web: form bước dùng 2 multi-select chức vụ (load từ API); chi tiết bước hiện tên chức vụ.
- 56/56 test đạt; lint + typecheck sạch; smoke test API đạt; deploy demo + push GitHub.
- Follow-up: `skip.allowedRoles` chưa đổi sang chức vụ (chờ ý kiến); UI checkbox vai trò +
  chức vụ ở Quản trị người dùng thuộc T7.

## 17/10/2026 — T2 mở rộng: vai trò nhiều chọn + UX form/danh sách bước

- Vai trò thực hiện + giám sát của bước chuyển sang nhiều chọn (`roles[]`, `supervisorRoles[]`);
  `role` cũ deprecated nhưng tương thích 2 chiều; migration 0003 + backfill đã apply D1 demo.
- StepForm: multi-select 7 vai trò hệ thống, validate hiện lỗi ngay trong modal (client + server).
- Danh sách bước collapsible (mặc định gọn, bấm "Chi tiết ▾" mở rộng); fix hiển thị mobile.
- Quy trình hiện người tạo + ngày tạo (danh sách và trang chi tiết).
- 55/55 test đạt; lint + typecheck sạch; smoke test API đạt; deploy demo + push GitHub.

## 17/10/2026 — Khởi tạo dự án

- Dựng khung repo theo cẩm nang §4 + SRS §13: AGENTS.md, README.md,
  docs/{SPEC,PLAN,TASKS,PROGRESS,DECISIONS,HANDOFF,CHANGELOG}.md, src/, tests/, scripts/.
- Ghi nhận quyết định D-01..D-07 (từ Cẩm nang AI Agent v1.1).
- ADR-001: chốt stack TypeScript monorepo (Accepted).
- Baseline: SRS v1.6 LEAN BASELINE SYNC REV9 — đã rà soát, ĐẠT.
- GitHub: tạo repo `dungnt-mhy/giangdc-sop` (public), đẩy khung T0+T1 lên nhánh `main`.
  OPEN-REPO-01 chốt.
- Cloudflare: tạo D1 `giangdc-sop-demo`, R2 bucket `giangdc-sop-demo`,
  Worker `giangdc-sop-demo-api`, Pages project `giangdc-sop-demo`.
  OPEN-CF-01 chốt (dùng account của user, tài nguyên demo tách production).
- T1.2: domain auth (27 permission, 7 role, SOD, scope, PBKDF2 — 19 test);
  D1 migration 0001 + seed demo; API login/logout/me/check-scope;
  Web login + trang chủ theo vai trò. OPEN-SOD-01/DATA-01/SCOPE-01 chốt.

## 17/10/2026 — T2 Process Catalog + Authoring & Governance hoàn thành

- Domain: máy trạng thái phiên bản 7 trạng thái, khóa sửa, activation, validate, phê duyệt D-08 (52/52 test).
- Migration 0002 (6 bảng + partial unique index) + seed SAMPLE-SHIPPING 11 bước.
- API 21 endpoint + idempotency 6 mutation + OpenAPI `docs/openapi-t2.yaml`; smoke test live đạt.
- Web: phân hệ Danh mục Quy trình (danh sách, soạn thảo, thẩm định/phê duyệt/phát hành).
- D-08 (T2): phạm vi MUST (PRC-001..009, GOV-001..007); 4 SHOULD dời task sau;
  severity mapping áp dụng cho phê duyệt phiên bản.
