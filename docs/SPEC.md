# SPEC.md — Baseline đặc tả

> Nguồn sự thật về "hệ thống phải làm gì" là **SRS v1.6 LEAN BASELINE SYNC REV9**
> (17/10/2026). File này chỉ tóm tắt và trỏ tới SRS, không thay thế SRS.

## Tài liệu gốc

| Tài liệu | Vị trí | Vai trò |
|---|---|---|
| SRS v1.6 LEAN BASELINE SYNC REV9 | `~/workspace/user/files/SOP_SPEC_v1.6_LEAN_BASELINE_SYNC_REV9.docx` | Nguồn chuẩn hành vi (BASELINE/INVARIANT/CONTRACT/AC) |
| SRS v1.5 FINAL Rev.9 | (chưa có file) | Technical Reference — tham khảo, không sao chép nguyên field/route/code |
| Shipping.pdf | `~/workspace/user/files/Shipping.pdf` | Quy trình mẫu "Xuất hàng đến đại lý", 11 bước — nguồn cho fixture UAT |
| Cẩm nang AI Agent v1.1 | `~/workspace/your_files/Huong-dan-lam-viec-voi-AI-Agent-v1.1.docx` | Quy trình làm việc với agent |

## Tóm tắt baseline (để tra nhanh)

- **Phạm vi MVP (§3):** nhiều quy trình độc lập, versioning có kiểm soát, execution
  theo đúng version, evidence theo bước, exception lifecycle, báo cáo/KPI/export,
  thông báo in-app. Ngoài MVP (DEFERRED): BPMN designer kéo-thả (PRC-012),
  luồng song song phức tạp, offline sâu (OPEN-OFFLINE-01), chữ ký số (OPEN-SIGN-01).
- **State machine (§7.5):** ProcessVersion DRAFT→IN_REVIEW→APPROVED→SCHEDULED→ACTIVE→
  SUPERSEDED/RETIRED; Execution CREATED→IN_PROGRESS⇄PAUSED→BLOCKED→IN_PROGRESS→COMPLETED/CANCELLED;
  hai predicate blocker (progress/completion); unified CancelExecution.
- **Quyền (§5):** kiểm tra phía server theo scope; ngưỡng phê duyệt ngoại lệ chốt ở OPEN-SOD-01 (G1).
- **Idempotency (§12.2):** mutation có nguy cơ retry phải idempotent theo actor + operation + key.
- **Dữ liệu (§11):** lịch sử bất biến, snapshot version, audit đầy đủ (actor, thời gian
  server, object, trước/sau, lý do, request ID).
- **AC:** 20 AC chính (AC-01..AC-20) + 6 AC mở rộng rework (AC-05A..AC-05F).
- **Gates:** G0 khởi động → G1 khóa nghiệp vụ → G2 khóa thiết kế → G3 sẵn sàng UAT/demo
  → G4 sẵn sàng production. Chi tiết xem SRS §22.

## Thứ tự ưu tiên khi xung đột (SRS §1)

1. Quyết định mới đã được chủ sản phẩm phê duyệt bằng văn bản.
2. INVARIANT/BASELINE và acceptance criteria trong v1.6.
3. CONTRACT hành vi đã được version hóa giữa các thành phần.
4. DEFAULT kỹ thuật đã được đội dự án chọn.
5. EXAMPLE/Technical Reference.
6. Suy luận của người hoặc agent triển khai.
