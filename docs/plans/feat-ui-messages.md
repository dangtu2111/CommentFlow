# Kế hoạch `feat-ui-messages` — Giao diện Tin nhắn (UI-first)

## Việc

Mã gap matrix: `UI-FIDELITY-MESSAGES` · Spec: `design/stitch/messages.png`, `docs/design/stitch-prd-brief.md`, `docs/08` §2.

**Tóm tắt:** dựng vỏ giao diện trang Tin nhắn 3 cột (danh sách hội thoại, khung hội thoại có đồng hồ cửa sổ 24 giờ, ngăn thông tin khách) khớp thiết kế Stitch, với dữ liệu mẫu có nhãn `[MẪU]` ở route dev. Chưa có kênh nhắn tin thật nên không tạo trang thật hay mục thanh bên. Không đổi logic nghiệp vụ, không migration.

## Điểm chưa rõ

Không có (Q-UIM1 ghi các lựa chọn an toàn).

## Tiêu chí nghiệm thu

1. Đồng hồ: còn < 2 giờ → cảnh báo; 24 giờ–7 ngày → chỉ nhân viên; > 7 ngày → khóa — kiểm bằng `message-window.test.ts`.
2. `/dev/ui/messages` hiển thị 3 cột khớp bố cục `messages.png` ở 1440px và xếp một cột ở 390px — kiểm bằng ảnh `docs/plans/ui-fidelity/ui-messages/`.
3. Mọi dữ liệu mẫu mang `[MẪU]`; i18n vi/en đủ khóa — kiểm bằng `pnpm lint:i18n`.
4. Không có mục "Tin nhắn" ở thanh bên; route dev 404 khi production — kiểm bằng đọc `app-nav.ts` + guard `NODE_ENV`.

## File sẽ đọc

`design/stitch/messages.png`, `docs/design/stitch-prd-brief.md`, `lib/app-nav.ts`, `dev/ui/leads/page.tsx`, `dev/ui/page.tsx`, `lib/inbox-visual.ts`.

## File sẽ sửa / tạo

`lib/message-window.ts(+test)`, `components/messages/message-center.tsx`, `app/dev/ui/messages/page.tsx`, `styles/messages.css`, `app/layout.tsx` (import CSS), `lib/inbox-visual.ts(+test)` (`avatarInitial`), i18n vi/en, `e2e/support/shot-messages.mjs`, tài liệu (quyết định, codemap, gap matrix, handoff).

## Migration

Không có.

## Test viết trước

`message-window.test.ts` (logic cửa sổ 24 giờ/7 ngày).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/message-window.test.ts src/lib/inbox-visual.test.ts`

## Cần kiểm chứng độc lập không?

Không (chỉ giao diện + hàm hiển thị; không chạm cổng gửi/RLS/auth).

## Rủi ro / câu hỏi cho chủ dự án

Khi có Messenger thật, nối dữ liệu và thêm mục thanh bên (`MESSENGER-WEBHOOK`, `MESSAGES-PAGE`).

## Đề xuất thay đổi

Không.

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

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/PRD; Q-UIM1).
