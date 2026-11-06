# Bàn giao `feat-tw-comments`

Cập nhật: 2026-11-06 · Mục gap matrix: UI-TW-COMMENTS · Agent vừa làm: claude

## Đã làm
- Dựng lại hộp thư Bình luận bằng class Tailwind chép từ `design/stitch/comments.html` (bọc `.tw`); xóa `styles/inbox.css`, `styles/inbox-parts.css`, `components/ui/workbench.css`.
- Thành phần dùng lại mới: `LabelChip`/`StatusChip` (cva), `StateNote`/`QuoteBlock`/`InlineError`, `EmptyNote`/`BackLink`, `dock-styles.ts`; `Icon` có `className`; quy tắc `[aria-disabled]` chuyển sang `ui/ui.css`.
- Hành vi, i18n, Server Action không đổi. Test: `label-chip.test.tsx` mới, `kit.test.tsx` cập nhật; web 362+ test xanh, `precheck` xanh, `next build` xanh, CSS Tailwind sinh đúng các biến thể (`group-data-[pane=…]/wb`, `group-aria-[current=page]/tab`).

## Chưa làm (cần máy xem trước chạy)
- `pnpm ui:fidelity comments //dev/ui/comments --base http://localhost:3101` và ảnh trước/sau 1440/1920/390: máy `localhost:3101` KHÔNG phản hồi (cả `/` và `/dev/ui/tailwind` treo > 25 giây) nên chưa đo được; `docs/plans/ui-fidelity/tw-comments/` chưa có. Sau khi khởi động lại máy xem trước: chạy lệnh trên + `node e2e/support/measure-comments.mjs docs/plans/ui-fidelity/tw-comments` (selector đã cập nhật) và dán bảng vào PR.
- Dự kiến cần chỉnh nhỏ: thanh dính đáy ở màn ≥ 1920px (`max-w-5xl`), kbd kit (`Kbd`) chưa là Tailwind.

## File đã đọc + điều rút ra
- Chỉ `components/comments/*`, `ui/workbench.*`, `styles/{inbox,inbox-parts,tailwind}.css`, `design/stitch/comments.html`. Lớp `inbox-*` dùng chung ở `globals.css` (Bài viết/Nhật ký) và `.bulk-*` giữ nguyên.
- Class Tailwind phải là chuỗi nguyên văn trong source (không ghép `${}`) mới được quét.
