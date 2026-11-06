# Kế hoạch `feat-ui-redo-kb-posts` — làm lại giao diện Cơ sở kiến thức + Bài viết (UI-first, QUKP2)

Mã gap matrix: `UI-FIDELITY-KB-POSTS` (làm lại) · Thiết kế `design/stitch/knowledge-base.png`, `posts.png`.

**Tóm tắt:** Lượt đầu (mô hình nhẹ) chưa sát thiết kế. Lượt này chụp trang ở 1440px/390px, so từng điểm lệch và sửa bằng token/component của repo: nút đầu trang, thanh độ đầy đủ, menu có biểu tượng + mục chọn tô màu nút chính, thẻ lối tắt có biểu tượng; Bài viết: thẻ lọc (tab có chấm màu), thẻ bài riêng có thanh nhấn, huy hiệu nền tảng, phân trang kiểu thiết kế. Bọc thêm khung menu cho Lỗ hổng/Xuất bản/Bộ kiểm thử. Không đổi logic, không migration. Rủi ro thấp.

## Điểm chưa rõ

Không có (xem QUKP2).

## Tiêu chí nghiệm thu

1. Ảnh sau 1440px/390px của `/dev/ui/kb` và `/dev/ui/kb-posts` ở `docs/plans/ui-fidelity/redo-kb-posts/`, danh sách khớp/chưa khớp ở README cùng thư mục — kiểm bằng xem ảnh.
2. Không số liệu/huy hiệu bịa ở trang thật; khối chỉ có trong thiết kế dựng ở route dev kèm nhãn [MẪU] — kiểm bằng đọc code.
3. i18n vi/en đủ khóa — `pnpm lint:i18n`.
4. `pnpm lint`, `typecheck`, `depcruise`, `precheck` xanh; test `src/lib` giữ nguyên xanh.
5. Next dev overlay không báo Issue khi mở hai route dev.

## File sẽ đọc / sửa

Đọc: component kb/posts hiện có, `kb-posts.css`, `globals.css` (đoạn posts/inbox/btn), `dev-shell.tsx`, vi/en.json (khối kb, posts).
Sửa/tạo: `components/kb/{kb-frame,kb-hub-view}.tsx`, `components/posts/{posts-header,posts-tabs,posts-toolbar,posts-list}.tsx`, các trang `kb`, `posts`, `try-ai`, `readiness`, `products/import`, `kb-gaps`, `kb-publish`, `kb-testset`, `app/dev/ui/{kb,kb-posts}/page.tsx`, `styles/kb-posts.css`, i18n, `e2e/support/shot-kb-posts.mjs`, docs.

## Migration

Không có.

## Test viết trước

Không có logic quy tắc mới (chỉ giao diện); test `kb-structure`, `posts-pagination` đã có giữ nguyên.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib` · `pnpm lint:i18n` · `pnpm typecheck`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/thanh toán; quyền Owner giữ nguyên `requireAppUser`).

## Rủi ro / câu hỏi cho chủ dự án

Khối Shopify/crawl/xem trước sản phẩm/Playground và panel Cấu hình bài viết cần tính năng chưa có — không dựng ở trang thật.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định đã có trong QUKP1/Q-UIF1).
