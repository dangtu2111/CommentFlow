## KT-WSS — Tìm workspace trong bộ chuyển (FR-005-SEARCH)

Điều kiện: tài khoản thật là thành viên của ít nhất 2 workspace có tên khác nhau (ví dụ tạo thêm một workspace ở `/app/onboarding/workspace`). Chạy `pnpm --filter @flow/web dev`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Đăng nhập, bấm nút tên workspace ở thanh trên. | Mở danh sách có ô "Tìm workspace" ở đầu, workspace hiện tại có dấu tick và không bấm được. |
| 2 | Gõ một phần tên workspace kia, bỏ dấu và viết hoa/thường tùy ý (vd "cua hang"). | Chỉ còn workspace có tên khớp; mục "+ Tạo workspace mới" vẫn hiện. |
| 3 | Gõ chuỗi không khớp tên nào. | Hiện "Không tìm thấy workspace". |
| 4 | Xóa ô tìm kiếm rồi bấm vào workspace khác. | Chuyển workspace; tên trên thanh trên đổi. |
| 5 | Chuyển sang tiếng Anh (nút ngôn ngữ) và mở lại danh sách. | Ô hiện "Search workspaces". |

Chưa có "số việc cần xử lý" (gap `FR-005-COUNT`). Nếu hỏng: ghi số bước và ảnh chụp.

---
