# Kế hoạch `feat-ui-html-kb-posts` — Dựng lại Cơ sở kiến thức và Bài viết từ HTML Stitch

## Việc

Mã gap matrix: `UI-HTML-KB-POSTS` · quy trình UI HTML-first (chủ dự án chốt 06/11/2026).

**Tóm tắt:** Dựng lại trang Cơ sở kiến thức (thanh lệnh + độ đầy đủ, cột cấu trúc 224px, thẻ nội dung) và Bài viết (đường dẫn 3 cấp, thanh lọc, danh sách có vạch nhấn) theo `design/stitch/knowledge-base.html` và `posts.html`, bằng kit `components/ui`. Cột menu KB thành thành phần kit `RailNav` (hai nhóm, đúng số đo Stitch); các tab con Lỗ hổng / Xuất bản / Bộ kiểm thử (đang đứng ngoài khung) được bọc chung khung với Thử AI, Độ sẵn sàng, Nhập Excel. CSS KB/Bài viết tách khỏi `globals.css`/`kb-posts.css` thành file theo thành phần. Rủi ro: lệch nhẹ pixel; số liệu/nút minh họa của thiết kế (RAG v12.4, 3 kênh, Diff, "Gắn sản phẩm hàng loạt", AI gợi ý gắn…) chưa có dữ liệu thật → bỏ (Q-UKPH1).

## Điểm chưa rõ

Không có (đã tự chọn phương án an toàn, ghi `docs/plans/quyet-dinh/q-ukph1.md`).

## Tiêu chí nghiệm thu

1. `RailNav` (kit) hiển thị nhóm + mục, đúng một mục `aria-current="page"`, nhãn nhóm là tiêu đề — kiểm bằng `rail-nav.test.tsx`.
2. Cả 6 tab con KB (Thử AI, Độ sẵn sàng, Lỗ hổng, Xuất bản, Bộ kiểm thử, Nhập Excel) dùng `KbFrame`; không hiện số liệu giả — kiểm bằng grep `KbFrame` + test `kb-structure`.
3. CSS `.kb-*` và `.posts-*` không còn trong `globals.css`/`kb-posts.css`, nằm ở `components/kb/kb.css`, `components/posts/posts.css`, `components/ui/rail-nav.css` — kiểm bằng grep + số dòng trước/sau.
4. Số đo khớp Stitch (cột rail 224px, mục rail cao ~36px/radius 8px, thanh độ đầy đủ cao 8px, thẻ radius 12px) — script Playwright `e2e/tools/ui-compare-kb-posts.mjs` so với file HTML Stitch, kết quả ở `docs/plans/ui-fidelity/ui-html-kb-posts/so-sanh.md` (ghi rõ nếu không chạy được vì thiếu mạng cho Tailwind CDN).
5. Phông Be Vietnam Pro phục vụ từ ứng dụng (`@fontsource`, gói npm cục bộ), không nạp từ máy chủ ngoài — kiểm bằng grep không có `fonts.googleapis` trong `apps/web/src`.
6. `pnpm precheck`, lint, lint:i18n, typecheck, depcruise, test web xanh.

## File sẽ đọc

`design/stitch/knowledge-base.html`, `posts.html`; `components/kb/kb-frame.tsx`; `components/posts/*`; `components/ui/{tabs,split-layout,page-header,chip}`; `lib/kb-structure.ts`; `styles/{globals,kb-posts}.css` (khối posts/kb); các trang `kb-gaps`, `kb-testset`, `kb-publish` (chỉ đầu/cuối `main`).

## File sẽ sửa / tạo

Tạo: `components/ui/rail-nav.{tsx,css}` + `rail-nav.test.tsx`, `components/kb/kb.css`, `components/posts/posts.css`, `e2e/tools/ui-compare-kb-posts.mjs`, `docs/plans/ui-fidelity/ui-html-kb-posts/so-sanh.md`. Sửa: `kb-frame.tsx` (dùng RailNav + thanh lệnh), `kb/page.tsx`, trang `kb-gaps`/`kb-testset`/`kb-publish` (bọc KbFrame), `posts/page.tsx`, `posts-list.tsx`, `page-header.tsx` (Breadcrumb nhiều cấp), `globals.css` + `kb-posts.css` (xóa khối đã tách), `app/layout.tsx` (import CSS), i18n vi/en. Docs: `docs/codemap.d/`, `docs/plans/quyet-dinh/q-ukph1.md`, gap-matrix, MASTER, handoff.

## Migration

Không có.

## Test viết trước

`rail-nav.test.tsx` (nhóm/mục, aria-current duy nhất, nhãn nhóm); `kit.test.tsx` thêm ca Breadcrumb nhiều cấp.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/components/ui src/lib/kb-structure.test.ts`

## Cần kiểm chứng độc lập không?

Không (chỉ giao diện; không đổi logic quyền — trang con giữ `requireAppUser({role:'owner'})`).

## Rủi ro / câu hỏi cho chủ dự án

Thiết kế có nội dung minh họa không có thật → bỏ (Q-UKPH1). Phông: giữ `@fontsource` (đã tự phục vụ, CSP `font-src 'self'`), không dùng `next/font/google` vì cần mạng lúc build.

## Đề xuất thay đổi

Không đổi `docs/01–16`.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: quyết định theo chỉ dẫn chủ dự án 06/11/2026; không có thẻ chưa rõ).
