## KT-WSD — Xóa workspace nhiều bước (WORKSPACE-DELETE, feat-workspace-delete) — chỉ làm được khi đã nối giao diện

> Hiện chưa có giao diện (nút ở "Dữ liệu & Quyền riêng tư" vẫn "Sắp có"); các bước dưới dành cho lúc đã nối. Kiểm tự động đã phủ phần dữ liệu: `pnpm test:db` (workspace-deletion.int.test.ts).

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Owner ở workspace THỬ bấm "Xóa workspace" (bước 1) | Hiện ô gõ lại mã workspace; chưa xóa gì |
| 2 | Gõ sai mã rồi gửi | Báo mã chưa đúng; yêu cầu vẫn chờ xác nhận |
| 3 | Gõ đúng mã rồi gửi (bước 2) | Báo "sẽ xóa sau 7 ngày", có nút Hủy; workspace vẫn dùng bình thường |
| 4 | Staff mở cùng trang | Không thấy khối xóa; gọi trực tiếp bị từ chối |
| 5 | Một Owner khác bấm Hủy | Yêu cầu bị hủy, có thể yêu cầu lại |
| 6 | (Staging, cờ bật) lùi hạn xóa bằng tay trên DB thử rồi chờ worker | Workspace thử biến mất cùng dữ liệu; dòng nhật ký tối thiểu còn lại |
