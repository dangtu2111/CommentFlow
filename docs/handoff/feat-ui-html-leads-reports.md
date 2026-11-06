# Handoff feat-ui-html-leads-reports (claude)

**Đã làm:** hai trang thật chỉ đọc `/app/leads` (Kanban) và `/app/reports`; Nhật ký thành `DataTable`; kit `DataTable`; CSS tách `leads.css`/`reports.css`/`activity.css` (`.log-*` rút khỏi `globals.css`); xóa `auto-leads.css`, khối báo cáo trong `reports-legal.css`; trang mẫu dev `/dev/ui/{leads,reports}` dùng đúng component thật; thêm Khách tiềm năng + Báo cáo vào thanh bên.
**Đã đọc, rút ra:** lead chỉ có `phoneLast4`/`hasEmail` (không tên kênh/sản phẩm/giá); `buildReport` chỉ trả `userId` cho nhân viên (hiện "Thành viên N"); thẻ trong lưới `.stack` cần `min-width: 0` kẻo bảng làm tràn trang; i18n ở `packages/shared/src/i18n/messages/{vi,en}.json`; `i18next/no-literal-string` cấm chuỗi trong thuộc tính (dùng hằng).
**Chưa kiểm bằng ảnh:** máy chủ xem trước :3103 giữ bản dịch cũ (hiện khóa thô), nên chưa có `so-bbox.json`/ảnh. Sau khi khởi động lại: `node e2e/support/measure-leads-reports.mjs`, kiểm `overflow390` của `reports` (lỗi tràn thấy lúc đo do nhãn khóa thô dài ở trục giờ).
**Còn lại:** xem hàng `UI-HTML-LEADS-REPORTS` trong gap matrix.
