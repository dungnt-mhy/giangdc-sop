# AGENTS.md — Quy tắc làm việc với AI agent (dự án SOP)

> Nguồn: Cẩm nang "Hướng dẫn làm việc với AI Agent" v1.1 + SRS v1.6 §20 (Hợp đồng làm việc).
> File này là luật. Agent đọc file này ĐẦU TIÊN mỗi phiên, rồi đọc các file theo thứ tự mục 1.

## 1. Thứ tự đọc khi mở phiên

1. `AGENTS.md` (file này)
2. `docs/HANDOFF.md` — bàn giao phiên trước
3. `docs/PROGRESS.md` — trạng thái hiện tại (nguồn sự thật)
4. `docs/DECISIONS.md` — các quyết định đã chốt (không tự đảo ngược)
5. `docs/SPEC.md` — baseline đặc tả
6. `docs/TASKS.md` — task đang làm + tiêu chí nghiệm thu

Sau đó tóm tắt: trạng thái hiện tại, việc đã verified, việc đang dở, một bước tiếp theo.
**Chưa được sửa code cho đến khi chủ sản phẩm duyệt kế hoạch.**

## 2. Quy tắc giao task

- Mỗi task nhỏ, có tiêu chí nghiệm thu (AC) kiểm chứng được, gắn requirement ID (PRC/GOV/EXE/EVD/EXP/RPT/ADM/ONB/BR/AC).
- Mỗi task xong phải có **bằng chứng**: test chạy đạt, log, ảnh chụp hoặc đoạn ghi hình thao tác.
- "Xong" ≠ "đã kiểm chứng". Không tự tuyên bố hoàn thành khi chưa có evidence.
- Viết hoặc cập nhật ADR nếu chọn kiến trúc chưa có trong đường cơ sở.
- Cập nhật contract/schema TRƯỚC khi viết UI và API; sinh type từ một nguồn duy nhất.
- Viết test thất bại trước cho bất biến miền, quyền và AC liên quan.
- Thứ tự triển khai: migration → domain service → API → UI. Không nhét quy tắc nghiệp vụ chỉ vào component.
- Trong pull request ghi: yêu cầu đã đáp ứng, giả định, migration, ảnh hưởng demo/production, rủi ro, test evidence, rollback/forward-fix.

## 3. Quy tắc chống suy diễn (SRS §20.2)

- Không tạo role, trường biểu mẫu, ngưỡng SLA, thời hạn lưu hoặc tích hợp vì "thường hệ thống sẽ có".
- Không gọi xác nhận điện tử cơ bản là chữ ký số.
- Không dùng dữ liệu sample như dữ liệu sản xuất. Seed chỉ ở demo/UAT, gắn nhãn SAMPLE.
- Không hard-code giá trị mà SRS ghi là DEFAULT/OPEN (ngưỡng, coverage %, retry count...).

## 4. Khi nào phải dừng agent (SRS §20.5)

Dừng phần bị ảnh hưởng khi gặp:
- Xung đột với BASELINE/INVARIANT của đặc tả;
- OPEN chặn gate chưa được chốt;
- Schema hiện tại không đủ giữ bất biến miền;
- Test mức S1/S2 thất bại.

Không "chọn phương án hợp lý nhất" rồi làm tiếp. Báo lại và chờ quyết định.

## 5. Kỷ luật tài liệu và bảo mật

- Mọi thay đổi cập nhật vào `docs/PROGRESS.md` và `docs/HANDOFF.md` cuối phiên.
- Quyết định mới ghi vào `docs/DECISIONS.md`, không đảo ngược quyết định đã chốt.
- Không commit secret, token, file `.env` vào repo. Kiểm tra `.gitignore` trước commit đầu.
- Contract (domain, OpenAPI, persistence schema, event schema, UI contract) mỗi cái có đúng một owner tại một thời điểm; không sửa song song cùng contract.
- Thay đổi contract phải cập nhật traceability + migration/compatibility plan trước khi merge.

## 6. Definition of Done cho một feature (SRS §20.3)

- Có liên kết mã yêu cầu và acceptance criterion.
- Domain invariant và permission được kiểm tra phía server.
- Schema/API/event được version hóa, có lỗi chuẩn và idempotency khi cần.
- Có migration; có test (unit/integration/contract/E2E liên quan) đạt.
- Cập nhật OpenAPI, seed UAT, runbook, ma trận truy vết nếu liên quan.
