# DECISIONS.md — Quyết định đã chốt

> Agent KHÔNG được tự đảo ngược các quyết định dưới đây. Muốn đổi phải có
> phê duyệt bằng văn bản của chủ sản phẩm và ghi ADR mới thay thế.

## Quyết định dự án (OPEN đã chốt)

| Mã | Quyết định | Ngày | Nguồn |
|---|---|---|---|
| OPEN-REPO-01 | Repo cá nhân `dungnt-mhy/giangdc-sop`, public. | 17/10/2026 | User |
| OPEN-CF-01 | Dùng tài khoản Cloudflare của user; tài nguyên demo đặt tên `giangdc-sop-demo*`, tách khỏi production. | 17/10/2026 | User |
| OPEN-SOD-01 | **Vai trò được phê duyệt:** `người phê duyệt` (role riêng), `admin`, `quản lý`. **Nguyên tắc 4 mắt mặc định:** người yêu cầu không được tự chọn mình làm người phê duyệt (quản lý A gửi quản lý B, admin A gửi admin B được phép). **Ngoại lệ:** admin/quản lý được tự phê duyệt khi cần thiết nhưng BẮT BUỘC lưu vết audit đầy đủ (actor, thời gian, lý do) và hệ thống gắn cờ các lượt tự phê duyệt trong báo cáo. Ghi đè DEFAULT của SRS (cấm tự phê duyệt) theo thứ tự ưu tiên §1 (quyết định của chủ sản phẩm). | 17/10/2026 | User |
| OPEN-SOD-01 bổ sung | **Ánh xạ mức nghiêm trọng → cấp phê duyệt:** LOW/MEDIUM → 1 người trong 3 role (trong scope); HIGH → 1 người cấp quản lý trở lên; BLOCKING → quản lý hoặc admin + bắt buộc ghi lý do, tự duyệt ở mức này bị gắn cờ đỏ trong audit. | 17/10/2026 | Đề xuất, user duyệt |
| OPEN-DATA-01 | **9 trường chung của Lượt thực hiện:** mã lượt (duy nhất), quy trình + phiên bản nguồn, trạng thái, người tạo, thời gian tạo, đơn vị/kho, người được giao hiện tại, hạn hoàn thành, ghi chú. Dữ liệu riêng theo quy trình đi qua mẫu biểu đã version hóa, không nhét vào trường chung. | 17/10/2026 | Đề xuất, user duyệt |
| OPEN-SCOPE-01 | **Cây 2 cấp:** 1 org root → các đơn vị/kho (thuộc tính loại OFFICE/WAREHOUSE, không tách entity kho riêng). Mỗi lượt thuộc đúng 1 đơn vị; quyền giới hạn theo đơn vị được gán; admin cross-scope được nhưng mọi truy cập đều audit. Prototype: 1 org + 2 đơn vị mẫu. | 17/10/2026 | Đề xuất, user duyệt |
| D-08 (T2) | **Kế hoạch T2 được duyệt 17/10/2026:** phạm vi PRC-001..009 + GOV-001..007 (MUST) + BR-002/003/004; 4 mục SHOULD (PRC-010, PRC-011, GOV-008, GOV-009) dời sang task sau. **Ánh xạ severity → cấp phê duyệt** (OPEN-SOD-01) áp dụng cho cả phê duyệt phiên bản quy trình (GOV-004), đồng nhất với phê duyệt ngoại lệ. | 17/10/2026 | Đề xuất, user duyệt |
| D-09 (mô hình chức vụ) | **Phân biệt Vai trò hệ thống vs Chức vụ (user làm rõ 17/10/2026):** 7 vai trò hệ thống (admin/quản lý/phê duyệt/...) chỉ dùng phân quyền hệ thống, gán ở Quản trị người dùng (UI checkbox thuộc T7). **Chức vụ** (thủ kho, thủ quỹ, lễ tân...) là khái niệm riêng: bảng `positions` + `user_positions`; mỗi **bước** gắn `Chức vụ thực hiện[]` + `Chức vụ giám sát[]` (giữ cả hai: đúng thực tế + gắn PRC-008 "Chuyển giám sát"). Khi chạy lượt (T3) gán người cụ thể: "Nguyễn Văn A – Thủ kho". Migration 0004 thay sạch model vai trò-hệ-thống ở bước (dọn cột 0003 khi còn demo). | 17/10/2026 | User làm rõ, đề xuất, user duyệt |
| D-10 (vai trò ứng dụng mở rộng) | **Thay 7 vai trò cứng bằng bảng vai trò mở rộng (user duyệt 17/10/2026):** bảng `roles` (thêm tùy ý) + `role_permissions` (27 mã quyền giữ nguyên làm vốn từ vựng, UI checkbox thuộc T7) + `user_roles` (gán nhiều vai trò). **Vai trò ứng dụng = chức năng trong app** (Quản trị viên, Quản lý, Người phê duyệt, Người thực hiện) — KHÔNG gắn kho/đơn vị vào tên vai trò; phạm vi dữ liệu do scope quyết định. **4 mắt sửa đổi:** người duyệt = user khác có vai trò chứa quyền `process.approve`; cờ `senior_approver` ở vai trò cho HIGH/BLOCKING; nguyên tắc người tạo ≠ người duyệt giữ nguyên. Seed 4 vai trò demo (admin→Quản trị viên, quanly→Quản lý, pheduyet→Người phê duyệt, nhanvien→Người thực hiện). Thay thế phần vai trò của OPEN-SOD-01 và D-08. | 17/10/2026 | User đề xuất, duyệt |
| D-11 (nhãn vai trò ở bước) | **Đổi nhãn hiển thị** "Chức vụ thực hiện"/"Chức vụ giám sát" → **"Vai trò thực hiện"/"Vai trò giám sát"** trong form bước và chi tiết bước (user yêu cầu 18/10/2026). Chỉ đổi nhãn UI — mô hình dữ liệu giữ nguyên là position (chức vụ) theo D-09, để không lẫn với "Vai trò ứng dụng" (D-10). Nhãn "Chức vụ được bỏ qua" (PRC-007) và mục "Chức vụ" ở user chip giữ nguyên. | 18/10/2026 | User yêu cầu |
| D-12 (phê duyệt phạm vi T3) | **User duyệt triển khai T3** (18/10/2026) với phạm vi: (1) tạo lượt thực hiện từ bản ACTIVE + gán người theo vai trò ở bước; (2) chạy bước + nút **"Chụp ảnh"** (camera trên mobile, chọn file trên desktop) upload lên R2; (3) bước cấu hình PRC-006 loại Ảnh chụp thì bắt buộc có ảnh mới hoàn thành; (4) chỉ người được gán mới thao tác bước của mình, giám sát xem được. Ngoài phạm vi: exception/rework (T5), báo cáo/KPI (T6), thông báo. | 18/10/2026 | Đề xuất, user duyệt |
| D-13 (tên trạng thái thẻ quy trình) | **Thẻ quy trình hiện trạng thái theo bản thực tế** (user yêu cầu chuẩn hóa tên 18/10/2026): có bản ACTIVE → **"Đang dùng · vN"** (xanh) — đúng nghĩa "đã có bản phát hành để dùng, không chờ"; có bản SCHEDULED → "Chờ hiệu lực" (vàng); bản mới nhất APPROVED → "Chờ phát hành"; IN_REVIEW → "Chờ thẩm định"; còn lại → "Soạn thảo"; ARCHIVED → "Đã lưu trữ" (xám). API bổ sung `activeVersionNo`/`hasScheduledVersion`/`latestVersionState` vào ProcessDto (subquery). Badge trạng thái bản giữ nguyên. | 18/10/2026 | Đề xuất, user duyệt |

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
