# DECISIONS.md — Quyết định đã chốt

> Agent KHÔNG được tự đảo ngược các quyết định dưới đây. Muốn đổi phải có
> phê duyệt bằng văn bản của chủ sản phẩm và ghi ADR mới thay thế.

## Quyết định sản phẩm (từ Cẩm nang AI Agent v1.1, đồng bộ SRS v1.6)

| Mã | Quyết định đã chốt | Ngày |
|---|---|---|
| D-01 | Website responsive PWA: bố cục desktop đầy đủ + mobile ưu tiên thao tác hiện trường; chưa làm app native hoặc Zalo Mini App. | 17/10/2026 |
| D-02 | Đăng nhập nội bộ; không SSO, không xác thực hai lớp ở MVP. | 17/10/2026 |
| D-03 | Soạn quy trình bằng form, sắp xếp và xem trước; không làm designer kéo-thả ở MVP. | 17/10/2026 |
| D-04/D-05 | Nhiều quy trình có phiên bản; giao diện desktop đầy đủ. | 17/10/2026 |
| D-06/D-07 | Nén ảnh phía client; demo Cloudflare, source GitHub, production VPS. | 17/10/2026 |

## Architecture Decision Records

| ADR | Tiêu đề | Trạng thái | Ngày |
|---|---|---|---|
| ADR-001 | Stack TypeScript monorepo | Accepted | 17/10/2026 |

Chi tiết xem `docs/adr/`.
