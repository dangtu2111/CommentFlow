# Bàn giao `feat-ui-comments` (claude, làn a)

## Đã làm
Plan `docs/plans/feat-ui-comments.md` (Q-UIC1). Giao diện hộp thư Bình luận: hai cụm tab + chấm màu, dòng bình luận có ảnh đại diện chữ/huy hiệu nền tảng/chip nhãn theo tông, ô tìm có biểu tượng, chi tiết dạng thẻ; trang mẫu `/dev/ui/comments`. Hàm thuần có test: `lib/inbox-visual.ts`. Ảnh ở `docs/plans/ui-fidelity/ui-comments/`.

## Đã đọc + rút ra
- Máy lane không có DB/phiên → chụp trang mẫu `/dev/ui/comments` bằng Playwright (`pnpm --dir e2e exec playwright`; không có script commit sẵn).
- Dev server `next dev` của worktree chiếm cổng 3100; `curl` bị chặn trong phiên không tương tác.
- `comments.html` không đọc (53 KB); bố cục lấy từ PNG + token.

## Còn lại
- `UI-FIDELITY-COMMENTS-DATA`: SLA, độ chính xác AI, bối cảnh bài/sản phẩm, "Giao cho tôi", lọc nhãn AI, "N bình luận mới", thanh hành động cố định — cần dữ liệu thật.
- Tin nhắn (`messages.png`): chưa dựng vỏ (chưa có trang/connector; `MESSENGER-WEBHOOK` ⛔; thiếu `.html`).
- Chụp so sánh trên trang thật khi có `pnpm dev:seed-demo`.
