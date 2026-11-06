# Bàn giao `feat-ui-html-kb-posts` (claude, làn d)

## Đã làm
- Kit: `components/ui/rail-nav.{tsx,css,test}` (RailNav), `Breadcrumb` nhận `parents` (nhiều cấp).
- KB: `KbFrame` có thanh lệnh (độ đầy đủ thật khi truyền `completeness`) + RailNav; bọc thêm `kb-gaps`, `kb-testset`, `kb-publish`; CSS ở `components/kb/kb.css`; route mẫu `/dev/ui/kb`.
- Bài viết: header dùng Breadcrumb/Chip/Card của kit, thẻ bài có vạch nhấn; CSS ở `components/posts/posts.css`; xóa `styles/kb-posts.css` và khối posts trong `globals.css`.
- Phông: giữ `@fontsource/be-vietnam-pro` (tự phục vụ, không máy chủ ngoài) — xem Q-UKPH1.
- Đo: `e2e/tools/ui-compare-kb-posts.mjs`, kết quả ở `docs/plans/ui-fidelity/ui-html-kb-posts/so-sanh.md`.

## Đã đọc + rút ra
Stitch KB: rail 224px, mục 40px/bo 8; thanh lệnh + thanh độ đầy đủ. Các thẻ Shopify/URL/Playground/Diff không có dữ liệu thật → bỏ.

## Còn lại
Số đếm tab bài viết (`POSTS-LIST-LINK-FILTER`), banner "chưa gắn sản phẩm", ảnh bài, cột cấu hình bài (`POSTS-LINK-PRODUCT-UI`). Chưa chụp ảnh trước/sau 390px.
