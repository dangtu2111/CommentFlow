# Kế hoạch `feat-tw-comments` — Dựng hộp thư Bình luận bằng Tailwind từ HTML Stitch

## Việc

Mã gap matrix: `UI-TW-COMMENTS` · Spec: docs/08 §7.1 · ADR 013 · Nguồn dựng duy nhất: `design/stitch/comments.html`.

**Tóm tắt (2–3 câu):** chuyển trang `/app/comments` từ CSS riêng (`styles/inbox.css`, `inbox-parts.css`, `ui/workbench.css`) sang class Tailwind chép từ HTML Stitch, bọc trong `<div className="tw">` (Tailwind là bộ công cụ CSS dạng "class tiện ích" đã có sẵn trên main). Hành vi, dữ liệu, i18n và Server Action giữ nguyên; chỉ đổi cách tạo giao diện, rồi xóa CSS cũ của trang. Rủi ro: trang khác (Bài viết, Nhật ký) dùng chung vài lớp `inbox-*` ở `globals.css` — không đụng; quy tắc `[aria-disabled]` toàn cục được giữ lại ở kit.

## Điểm chưa rõ

Không có. Tự chọn phương án an toàn: Q-TWC1.

## Tiêu chí nghiệm thu

1. `/app/comments` và `/dev/ui/comments` không còn dùng `inbox.css`/`inbox-parts.css`/`workbench.css` (đã xóa) — kiểm bằng: `grep` + `pnpm typecheck` + build.
2. Mọi thành phần trong `comments.html` có mặt (chữ/nhãn/nút) ≥ 95% — kiểm bằng: `pnpm ui:fidelity comments /dev/ui/comments`.
3. Lệch hình học ≤ 2px ở phần tử mốc ở 1440 và 1920px — kiểm bằng cùng lệnh, nộp bảng trong PR.
4. Mobile 390px: hai ngăn danh sách/chi tiết còn đúng, không tràn ngang — kiểm bằng ảnh `docs/plans/ui-fidelity/tw-comments/`.
5. Hành vi giữ nguyên: test hiện có (`suggestion-panel`, `kit`, `inbox-*`, bulk) vẫn xanh — `vitest` phạm vi web.
6. Công cụ xanh: lint, lint:i18n, typecheck, depcruise, check:plans, test:trace, precheck.

## File sẽ đọc

`design/stitch/comments.html`; `components/comments/*` (đã đọc); `ui/workbench.{tsx,css}`; `styles/{inbox,inbox-parts,tailwind}.css`; `app/dev/ui/comments/page.tsx`; `e2e/support/measure-comments.mjs`; `bulk-selection.tsx`, `reply-progress.tsx`, `hide-progress.tsx`, `comment-lock.tsx`.

## File sẽ sửa / tạo

- `components/ui/workbench.tsx` (Tailwind, bỏ `workbench.css`), `components/ui/ui.css` (bỏ import + giữ quy tắc `aria-disabled`).
- `components/comments/{inbox-strip,inbox-tabs,inbox-toolbar,inbox-list,comment-detail,reply-composer,suggestion-panel,relabel-select,hide-button,hide-progress,reply-progress,comment-lock,bulk-selection}.tsx` — đổi className sang Tailwind; rút `LabelChip`/`StatusChip` (cva) dùng ≥ 2 nơi.
- `app/app/(guarded)/comments/page.tsx`, `app/dev/ui/comments/page.tsx`.
- Xóa `styles/inbox.css`, `styles/inbox-parts.css`, `ui/workbench.css`; sửa `app/layout.tsx`.
- `e2e/support/measure-comments.mjs` (selector mốc), docs: gap-matrix, MASTER, codemap.d, quyết định, handoff.

## Migration

Không có.

## Test viết trước

Không có logic quy tắc mới. Giữ test hiện có; thêm test render cho `LabelChip`/`Workbench`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/components`; `pnpm lint:i18n`; `pnpm typecheck`.

## Cần kiểm chứng độc lập không?

Không (giao diện; không chạm auth/RLS/gửi tự động).

## Rủi ro / câu hỏi cho chủ dự án

Khung (`shell`) không đổi trong PR này; `ui:fidelity` đo khung có thể lệch do `frames.css` — ghi rõ trong PR nếu có.

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
- [x] Mỗi bảng mới nêu policy GHI theo vai trò — không có bảng mới

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định nằm trong ADR 013 / Q-TWC1).
