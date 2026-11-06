# Kế hoạch `feat-ui-comments` — UI-FIDELITY nhóm 3: hộp thư Bình luận

## Việc

Mã gap matrix: `UI-FIDELITY-COMMENTS` (ảnh `ui-comments`) · Spec: docs/08 §7.1 · Thiết kế: `design/stitch/comments.png` (+ `comments.html`).

**Tóm tắt (UI-first, 06/11/2026):** làm hộp thư Bình luận giống thiết kế Stitch hơn: cột trái chia hai cụm trạng thái có chấm màu và tab đang chọn đậm màu nút chính; mỗi dòng bình luận có ảnh đại diện chữ + huy hiệu nền tảng, trích dẫn nội dung, chip nhãn theo tông màu; ô tìm kiếm có biểu tượng, bộ lọc gọn một hàng; cột chi tiết dạng thẻ (ảnh đại diện lớn, ô gợi ý AI màu AI). Không đổi logic nghiệp vụ, không migration. Số liệu/huy hiệu không có thật (SLA, "Độ chính xác AI 98.4%", "Có AI", bối cảnh sản phẩm, "Dừng khẩn cấp"…) không dựng — Q-UIC1.

## Điểm chưa rõ

Không có. Tự chọn theo AGENTS.md § Quy tắc hỏi: Q-UIC1.

## Tiêu chí nghiệm thu

1. Cột trái: hai cụm tab (đang xử lý · đã xong), chấm màu theo loại, tab chọn nổi bật, số đếm giữ nguyên — kiểm bằng ảnh 1440px + `inboxTabGroup` test (mỗi tab đúng một nhóm).
2. Danh sách: ảnh đại diện chữ + huy hiệu nền tảng, nội dung trích dẫn, chip nhãn theo tông, chip trạng thái bên phải — kiểm bằng ảnh + `platformBadgeText`/`labelTone` test.
3. Chi tiết: thẻ có ảnh đại diện lớn, nội dung nổi bật, ô gợi ý AI tông AI, hộp trả lời dạng thẻ — kiểm bằng ảnh.
4. Mobile 390px: hai ngăn (danh sách / chi tiết) vẫn đúng, không tràn ngang — kiểm bằng ảnh `danh-sach-390`, `chi-tiet-390`.
5. Không bịa số liệu: dữ liệu mẫu chỉ ở `/dev/ui/comments` (404 khi production), gắn nhãn [MẪU] — đọc code.
6. Công cụ xanh: lint, lint:i18n, typecheck, depcruise, check:plans, test:trace, test phạm vi.

## File sẽ đọc

`design/stitch/comments.png`; `comments/page.tsx`; `components/comments/{inbox-tabs,inbox-list,inbox-toolbar,comment-detail}.tsx`; `styles/globals.css` (khối inbox); `tokens.css`; `app/dev/ui/page.tsx` (mẫu trang dev).

## File sẽ sửa / tạo

- `apps/web/src/lib/inbox-visual.ts` (+test) — hàm thuần: `platformBadgeText`, `labelTone`, `inboxTabGroup`.
- `components/comments/{inbox-tabs,inbox-list,inbox-toolbar,comment-detail}.tsx`; `styles/globals.css`.
- `app/dev/ui/comments/page.tsx` — trang xem mẫu ([MẪU]).
- `docs/plans/ui-fidelity/ui-comments/*`, `docs/plans/quyet-dinh/q-uic1.md`, gap-matrix, MASTER, `docs/codemap.d/`, handoff.
- `messages.png`: Tin nhắn chưa có trang/connector (`MESSENGER-WEBHOOK` ⛔) → không dựng vỏ ở nhóm này; ghi vào gap matrix.

## Migration

Không có.

## Test viết trước

`inbox-visual.test.ts` (hàm thuần).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/inbox-visual.test.ts`

## Cần kiểm chứng độc lập không?

Không (chỉ giao diện/CSS; không chạm auth/RLS/token/gửi).

## Rủi ro / câu hỏi cho chủ dự án

Nhiều khối thiết kế chưa có dữ liệu thật (SLA, độ chính xác AI, bối cảnh sản phẩm, lọc nhãn AI, "Giao cho tôi"): để gap `UI-FIDELITY-COMMENTS-DATA`.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Tiêu chí nghiệm thu kiểm được
- [x] Không còn thẻ cần làm rõ
- [x] Không migration, không thư viện mới
- [x] Test viết trước cho hàm thuần

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định đã có trong chỉ đạo UI-first 06/11/2026 + Q-UIC1)
