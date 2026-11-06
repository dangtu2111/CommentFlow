# Handoff `feat-tw-kb-posts` (claude)

**Đã làm:** dựng lại Cơ sở kiến thức (khung + 6 tab con dùng chung `KbFrame`) và Bài viết bằng Tailwind; route mẫu `/dev/ui/kb`, `/dev/ui/kb-posts` đủ thành phần [MẪU]; xóa `kb.css`, `posts.css`, `rail-nav.css`. Plan `docs/plans/feat-tw-kb-posts.md`, Q-TWKP1.

**Điều rút ra:**
- `important: '.tw'` chỉ áp class cho phần tử CON của `.tw`; reset `.tw` đè CSS cũ → nội dung tab con (CSS cũ) phải nằm NGOÀI `.tw` (`kb-frame.css`, gỡ khi tab con được port).
- `cn()` (tailwind-merge) nuốt `text-label-sm` khi đi cùng `text-<màu>`; `Pill` ghép chuỗi thẳng. Nên cấu hình `extendTailwindMerge` cho cỡ chữ Stitch (việc chung).
- Icon `spark` trong posts.html không tồn tại → dùng `auto_awesome`.
- `ui:fidelity`: chữ 97,1% / 96,6%; landmark header/thanh bên lệch vì route dev không có app shell (không phải lỗi của trang).

**Còn lại:** tab con (try-ai, readiness, kb-gaps, kb-testset, kb-publish, products/import) còn CSS cũ; `e2e/tools/ui-compare-kb-posts.mjs`, `e2e/support/measure-posts-cards.mjs` còn selector class cũ; ảnh bài/đếm tab/lọc gắn (gap `POSTS-LIST-LINK-FILTER`), panel cấu hình bài thật (`POSTS-LINK-PRODUCT-UI`).
