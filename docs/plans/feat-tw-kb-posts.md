# Kế hoạch `feat-tw-kb-posts` — Dựng Cơ sở kiến thức + Bài viết bằng Tailwind

Mã gap matrix: `UI-FIDELITY-KB-POSTS` (dựng lại theo ADR 013) · Spec: `docs/08` §2, `design/stitch/knowledge-base.html`, `design/stitch/posts.html`.

**Tóm tắt:** Dựng lại hai màn "Cơ sở kiến thức" (gồm 6 tab con dùng chung khung) và "Bài viết" bằng class Tailwind chép từ HTML Stitch (bọc `<div className="tw">`), thay CSS riêng cũ. Chỉ đổi giao diện: không đổi logic, không migration. Phần thiết kế chưa có chức năng/dữ liệu thật (Shopify, nguồn URL, panel cấu hình bài, banner "chưa gắn") dựng đủ ở route `/dev/ui/kb-posts` và `/dev/ui/kb` bằng dữ liệu mẫu `[MẪU]`; ở route thật các nút tương ứng hiện vô hiệu kèm chú thích "Sắp có". Rủi ro: lệch giao diện trang cũ — kiểm bằng ảnh và `pnpm ui:fidelity`.

## Điểm chưa rõ

Không có. (Quyết định tự chọn ghi ở Q-TWKP1.)

## Tiêu chí nghiệm thu

1. `/app/kb` và 6 tab con, `/app/posts` vẫn hoạt động, hiển thị bằng Tailwind (không còn dùng `kb.css`, `posts.css`, `rail-nav.css`) — kiểm bằng: typecheck + test render + ảnh chụp.
2. Mọi thành phần của hai HTML Stitch có mặt ở `/dev/ui/kb` và `/dev/ui/kb-posts` (mẫu `[MẪU]` hoặc vô hiệu "Sắp có") — kiểm bằng: `pnpm ui:fidelity knowledge-base /dev/ui/kb`, `pnpm ui:fidelity posts /dev/ui/kb-posts` ≥ 95% chữ khớp, lệch ≤ 2px ở 1440 và 1920.
3. Không bịa số liệu/huy hiệu ở route thật — kiểm bằng: đọc diff, test render route thật không chứa `[MẪU]`.
4. Phân trang, bộ lọc GET, tab nền tảng giữ nguyên hành vi — kiểm bằng: test `posts-pagination`, test render danh sách.
5. `pnpm lint`, `lint:i18n`, `typecheck`, `depcruise`, `check:plans`, `precheck` xanh.

## File sẽ đọc

`design/stitch/{knowledge-base,posts}.html`, `components/kb/kb-frame.tsx`, `components/posts/*`, `components/ui/{rail-nav,chip,icon}.tsx`, các page trong `app/app/(guarded)/{kb,posts}`, `app/dev/ui/{kb,kb-posts}`, messages vi/en mục `kb`, `posts`.

## File sẽ sửa / tạo

- Tạo `components/ui/pill.tsx` (cva): viên nhãn dùng ở cả hai màn.
- Sửa `components/ui/rail-nav.tsx`: class Tailwind; xóa `rail-nav.css`.
- Sửa `components/kb/kb-frame.tsx` + tạo `kb-frame-view.tsx` (trình bày thuần, dùng cho cả route thật và dev); xóa `kb.css`.
- Tạo `components/kb/kb-sample-stage.tsx` (các khối Shopify/URL/sản phẩm/Playground, chỉ dev).
- Sửa `components/posts/{posts-list,posts-tabs,posts-toolbar}.tsx`; tạo `post-card.tsx`, `posts-header.tsx`, `post-config-panel.tsx`; xóa `posts.css`.
- Sửa các page `kb`, `posts`, `dev/ui/kb`, `dev/ui/kb-posts`; test mới; messages vi/en (chữ "Sắp có", nhãn mới).
- Docs: quyết định, codemap, gap-matrix, handoff, ảnh `docs/plans/ui-fidelity/tw-kb-posts/`.

## Migration

Không có.

## Test viết trước

Test render (`renderToStaticMarkup`): `PostCard`, `RailNav` giữ `aria-current`, `Pill`; test route thật không chứa `[MẪU]`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/components`

## Cần kiểm chứng độc lập không?

Không (chỉ giao diện).

## Rủi ro / câu hỏi cho chủ dự án

Ảnh bài viết (`media_url`) chưa có trong truy vấn: ô ảnh hiện khung trống trên route thật.

## Đề xuất thay đổi

Không có.

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

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong ADR 013 và chỉ dẫn UI-first; không có thẻ chưa rõ).
