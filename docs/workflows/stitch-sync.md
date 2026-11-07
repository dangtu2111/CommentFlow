# Quy trình tải thiết kế Stitch (qua MCP)

Dự án Stitch: `15298527895734533184` (https://stitch.withgoogle.com/projects/15298527895734533184)

Mục tiêu: đưa thiết kế vào repo **một lần** để các phiên sau đọc file trong `design/stitch/`, không gọi Stitch nữa.

1. Tìm MCP server Stitch đã cấu hình trong phiên này và liệt kê các tool của nó. Dùng đúng tên tool có thật; không đoán. Không thấy server Stitch → dừng, báo người dùng kiểm tra `/mcp`.
2. Đọc `design/stitch/manifest.json` nếu có (danh sách màn hình đã tải + thời điểm/phiên bản). Lấy danh sách màn hình của dự án từ MCP.
3. Chọn màn hình cần tải:
   - Người dùng chỉ định màn hình → chỉ màn hình đó.
   - Không có → màn hình chưa có trong manifest hoặc có thời điểm/phiên bản mới hơn. Màn hình không đổi → bỏ qua.
4. Với mỗi màn hình cần tải: lấy code HTML (Tailwind) và ảnh chụp; ghi thẳng ra file, **không in nội dung HTML vào hội thoại**:
   - Nhiều màn hình (> 3) → làm tuần tự từng màn, ghi file ra đĩa ngay, chỉ giữ trong hội thoại danh sách file đã ghi + lỗi (không dùng subagent).
   - Giải mã base64/JSON bằng Python (`python -c` hoặc script tạm trong thư mục tạm), **không dùng `jq`** (Windows thường không có).
   - Tên file theo slug tiếng Anh của trang trong `docs/CommentFlow_UI_Design_Prompt.md` / `docs/CommentFlow_Admin_Design_Prompt.md` (ví dụ `comments`, `messages`, `knowledge-base`, `posts`, `automation`, `admin-overview`); không khớp được thì dùng tên màn hình Stitch đã chuyển thành slug và ghi "chưa khớp" trong bảng.
   - `design/stitch/<slug>.html`, `design/stitch/<slug>.png`.
   - Nếu MCP cung cấp DESIGN.md / design system → `design/stitch/DESIGN.md`.
5. Ghi/cập nhật `design/stitch/manifest.json`: `{ "project_id", "synced_at", "screens": [{ "stitch_id", "name", "slug", "updated", "files": [...] }] }`.
6. Cập nhật bảng **Bảng màn hình** trong `design/stitch/README.md` (màn hình, file, mục prompt tương ứng). Chỉ ghi cột "Trạng thái đã vẽ / Còn thiếu" nếu nhìn ảnh thấy rõ; không chắc thì để trống.
7. Nếu có DESIGN.md: so màu chính/chữ với `docs/08_UI_UX_Specification.md` §2 và ghi khác biệt vào bảng **Khác biệt với bảng thương hiệu**; không tự sửa token.
8. Báo cáo tối đa 8 dòng: số màn hình đã tải / bỏ qua / lỗi, màn hình chưa khớp với prompt, khác biệt màu cần chủ dự án chốt. Đề xuất commit `chore(design): sync Stitch screens`.
