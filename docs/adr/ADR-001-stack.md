# ADR-001: Stack TypeScript monorepo

- Trạng thái: **Accepted** (theo phê duyệt kế hoạch Phase 0+1, 17/10/2026)
- Ngày: 17/10/2026

## Bối cảnh

SRS v1.6 §13.1 yêu cầu: một codebase dùng chung cho demo và production (không fork
business logic theo môi trường); web/PWA tách khỏi domain/application logic;
persistence và object storage đi qua abstraction/adapter để cùng một bộ contract test
chạy trên demo (Cloudflare D1/R2) và production (PostgreSQL/S3-compatible); ưu tiên
modular monolith. SRS **không khóa** ngôn ngữ, framework web/API, ORM, tên package —
các lựa chọn này thuộc ADR.

## Quyết định

Dùng **TypeScript monorepo** (pnpm workspaces) với cấu trúc:

```
apps/web          PWA (desktop đầy đủ + mobile thao tác hiện trường, D-01)
apps/api          API/service layer — chạy được trên Workers (demo) và Node (VPS)
packages/domain   Entity, state machine, invariant, permission policy (không phụ thuộc runtime)
packages/adapters Adapter persistence (D1/PostgreSQL) và object storage (R2/S3-compatible)
packages/contracts OpenAPI/schema/event schema — nguồn duy nhất sinh type
```

## Lý do

- Một ngôn ngữ cho cả web và API; type sharing end-to-end từ contract một nguồn (SRS §20.1).
- Cloudflare Workers hỗ trợ TypeScript tốt; cùng code API chạy trên Node cho VPS production.
- `packages/domain` thuần logic, dễ unit test bất biến miền và state machine (SRS §16).
- Adapter pattern đáp ứng yêu cầu contract test chạy trên cả D1/PostgreSQL và R2/S3-compatible.

## Hoãn lại (ADR-002, ở G2)

Framework web cụ thể, framework API, ORM/query builder, thư viện auth — chốt cùng lúc
với OpenAPI và data model ở G2. Shortlist đề xuất: React (PWA), Hono (chạy cả Workers
lẫn Node), Drizzle (hỗ trợ D1 + PostgreSQL).

## Hệ quả

- Cần Node 20+ cho dev/CI; CI bắt buộc typecheck.
- Mọi thay đổi contract phải cập nhật `packages/contracts` trước khi sửa web/API.
- Đổi quyết định này cần ADR mới thay thế (không tự đảo ngược).
