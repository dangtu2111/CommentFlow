# Handoff feat-ui-knowledge-posts (claude, làn d)

**Đã làm:** QUKP1 — `/app/kb` + `KbFrame` (bọc products/import, try-ai, readiness), tab nền tảng + phân trang số + breadcrumb ở `/app/posts`, route dev `/dev/ui/kb-posts` [MẪU], nav key `kb`, CSS `styles/kb-posts.css`, i18n `kb.*` + `posts.*` mới.

**Rút ra:** web cần `.env` để chạy thật nên không chụp được ảnh trước/sau; posts chưa trả `media_url` (ảnh bài) và số đếm theo nền tảng (gap POSTS-LIST-LINK-FILTER).

**Còn lại:** panel Cấu hình bài viết & AI thật (cần action gắn sản phẩm/ghi chú/chế độ AI), banner "chưa gắn", nút gắn hàng loạt, các mục KB chưa có tính năng, ảnh so sánh khi chụp được; `kb-gaps`/`kb-publish`/`kb-testset` chưa bọc `KbFrame`.
