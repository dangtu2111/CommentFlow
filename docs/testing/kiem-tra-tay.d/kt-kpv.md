## KT-KPV — Phiên bản kiến thức: xuất bản / khôi phục (KB-PUBLISH-VERSION, FR-054, UF-8, feat-kb-publish-version)

> Cần worker đang chạy và hàng đợi `kb-publish` đã cài (`pnpm --filter @flow/worker queue:install`); cần ít nhất một đoạn nháp trong `cf.kb_chunks` (lập chỉ mục FAQ/chính sách). / Needs the worker running and the `kb-publish` queue installed.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Owner → menu **Phiên bản kiến thức** (`/app/kb-publish`); Staff gõ thẳng URL | Owner thấy trang; Staff nhận 404 và không có mục menu |
| 2 | Chưa có nháp | "Bản nháp không có thay đổi…", không có nút Xuất bản |
| 3 | Có nháp FAQ mới → nhập ghi chú → **Xuất bản** | Báo "Đã gửi yêu cầu"; tải lại: có Phiên bản 1 (đang chạy) kèm số đoạn, nhóm FAQ, ghi chú |
| 4 | Nháp có đoạn Chính sách/Sản phẩm đổi | Chỉ xuất bản được khi tick ô xác nhận; không tick → báo "Hãy tick ô xác nhận" |
| 5 | Bấm Xuất bản hai lần liên tiếp | Chỉ tạo một phiên bản (lần sau "không có gì thay đổi") |
| 6 | Sửa FAQ, xuất bản lại → Phiên bản 2; bấm **Khôi phục** ở Phiên bản 1 (tick xác nhận) | Xuất hiện Phiên bản 3 (nội dung như bản 1, đang chạy); bản 1 và 2 giữ nguyên |
| 7 | Đoạn bị nghi cài lệnh trong nháp | Có dòng cảnh báo số đoạn bị chặn; các đoạn đó không có trong phiên bản mới |
| 8 | Đổi sang English | Mọi chữ trên trang đổi sang tiếng Anh |
