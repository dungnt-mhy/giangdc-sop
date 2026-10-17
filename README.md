# Hệ thống Quản lý Quy trình (SOP)

Hệ thống cho phép doanh nghiệp quản lý nhiều quy trình độc lập, thay đổi có kiểm soát
theo phiên bản, áp dụng đúng phiên bản cho từng lượt công việc, thu giấy tờ/bằng chứng
theo từng bước, xử lý ngoại lệ và truy vết đầy đủ.

## Baseline đặc tả

- **SRS v1.6 LEAN BASELINE SYNC REV9** (17/10/2026) — nguồn chuẩn quyết định hệ thống
  phải làm gì. File: `~/workspace/user/files/SOP_SPEC_v1.6_LEAN_BASELINE_SYNC_REV9.docx`
- Triết lý: khóa **hành vi** (phạm vi, invariant, state machine, security, AC,
  requirement ID), mở **implementation** (tên bảng/field, route, framework do ADR quyết).
- Technical Reference: SRS v1.5 FINAL Rev.9 (không bắt sao chép nguyên tên field/route/code).
- Quy trình mẫu UAT: `~/workspace/user/files/Shipping.pdf` — "Xuất hàng đến đại lý", 11 bước.

## Cấu trúc repo

```
AGENTS.md            Quy tắc làm việc với AI agent (đọc đầu tiên)
README.md            File này
docs/
  SPEC.md            Trỏ tới SRS + tóm tắt baseline
  PLAN.md            Kế hoạch các phase
  TASKS.md           Backlog task + tiêu chí nghiệm thu
  PROGRESS.md        Trạng thái hiện tại (nguồn sự thật)
  DECISIONS.md       Quyết định đã chốt D-01..D-07 + ADR
  HANDOFF.md         Bàn giao giữa các phiên
  CHANGELOG.md       Lịch sử thay đổi
  adr/               Architecture Decision Records
src/                 Mã nguồn (khởi tạo ở Phase 2)
tests/               Test
scripts/             Script tiện ích
```

## Kiến trúc mục tiêu (ADR-001)

- TypeScript monorepo, modular monolith.
- Demo: Cloudflare Pages/Workers + D1 + R2.
- Production: VPS + Docker Compose + PostgreSQL + object storage S3-compatible.
- Một codebase cho cả hai môi trường; persistence/storage qua adapter,
  cùng một bộ contract test chạy trên cả hai.

## Bắt đầu phiên làm việc

Đọc theo thứ tự trong `AGENTS.md` mục 1, rồi tóm tắt trạng thái trước khi làm tiếp.
