# Kế hoạch `feat-ui-knowledge-posts` — UI-FIDELITY nhóm 5 (Cơ sở kiến thức + Bài viết)

Mã gap matrix: `UI-FIDELITY-KB-POSTS` (mới) · Spec: `docs/08` §2, §7; thiết kế `design/stitch/knowledge-base.png`, `posts.png`.

**Tóm tắt:** Làm giao diện hai màn khớp thiết kế Stitch, không đổi logic. Màn Bài viết: đường dẫn, tiêu đề + chip số bài, tab nền tảng, thẻ bài có huy hiệu màu, phân trang theo số. Màn Cơ sở kiến thức: thêm trang trung tâm `/app/kb` có thanh độ đầy đủ (từ độ sẵn sàng AI thật) và menu cấu trúc kiến thức nối các trang đã có (Nhập Excel, Thử AI, Độ sẵn sàng, Câu hỏi chưa trả lời, Câu kiểm thử, Phiên bản). Khối chưa có dữ liệu thật chỉ hiện ở trang mẫu dev, gắn nhãn [MẪU]. Rủi ro thấp (chỉ giao diện).

## Điểm chưa rõ

Không có (xem QUKP1).

## Tiêu chí nghiệm thu

1. `kbSubnavFor` trả đúng nhóm/đường dẫn, mọi mục có trong nav Owner — kiểm bằng `kb-structure.test.ts`.
2. `postsPageWindow` trả cửa sổ số trang có dấu "…" đúng — kiểm bằng `posts-pagination.test.ts`.
3. `/app/kb` chỉ Owner, hiện % thật từ `loadReadiness`; không số liệu bịa — đọc code + test nav.
4. Trang `/dev/ui/kb-posts` 404 khi production, mọi khối mẫu có "[MẪU]" — kiểm bằng đọc code + ảnh.
5. i18n vi/en đủ khóa (`pnpm lint:i18n`), typecheck/lint/depcruise xanh.
6. Ảnh trước/sau ở `docs/plans/ui-fidelity/ui-kb-posts/` (nếu chụp được) + danh sách khớp/chưa khớp ở PR.

## File sẽ đọc / sửa

Đọc: posts page/list/toolbar, app-nav, shell-nav, readiness page/view, try-ai page, dev/ui page, globals.css, vi/en.json.
Sửa/tạo: `lib/kb-structure.ts`(+test), `lib/posts-pagination.ts`(+test), `lib/app-nav.ts`, `components/app/shell-nav.tsx`, `components/kb/kb-frame.tsx`, `app/app/(guarded)/kb/page.tsx`, try-ai + readiness pages (bọc khung), `components/posts/*`, `posts/page.tsx`, `app/dev/ui/kb-posts/page.tsx`, `styles/kb-posts.css`, i18n, docs.

## Migration

Không có.

## Test viết trước

`kb-structure.test.ts`, `posts-pagination.test.ts`, cập nhật `app-nav.test.ts` nếu có.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/thanh toán; `/app/kb` dùng lại `requireAppUser({role:'owner'})`).

## Rủi ro / câu hỏi cho chủ dự án

Gắn sản phẩm/ghi chú/chế độ AI theo bài (panel phải) cần action + loader — chưa làm (gap `POSTS-LINK-PRODUCT-UI`). Thiết kế còn thiếu màn "Nhập Excel" riêng: không bịa (xem `ui-thieu-thiet-ke.md`).

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

**Đã duyệt** (tự duyệt: mọi quyết định đã có ở QUKP1).
