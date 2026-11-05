# Kế hoạch `feat-inbox-mobile` — Trang Bình luận trên mobile 390px

## Việc

Mã gap matrix: `INBOX-MOBILE` · Spec: FR-040 (`docs/05`), `docs/08` §4 (mobile 390 cho Bình luận), UF-3; bố cục `design/stitch/comments.png` (chỉ có bản desktop).

**Tóm tắt:** Ở màn hình hẹp (< 900px, thiết kế cho 390px) trang Bình luận hiện hai "ngăn" thay vì xếp dọc dài: danh sách (kèm tab, bộ lọc), hoặc chi tiết toàn màn hình khi đã chọn một bình luận, có nút "← Quay lại danh sách" giữ nguyên tab/lọc. Chỉ đổi giao diện (CSS + một hàm thuần + 1 chuỗi i18n), không đụng dữ liệu hay quyền; rủi ro thấp. Thiết kế Stitch chưa có bản mobile nên bố cục mobile là quyết định QM1.

## Điểm chưa rõ

Không có (QM1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. `inboxMobilePane`: có `?c=` → `detail`, không → `list` — kiểm bằng `src/lib/inbox-pane.test.ts`.
2. `buildInboxBackHref` giữ tab/lọc/sắp xếp, bỏ `c` — cùng file test.
3. Chuỗi `comments.detail.back` có ở `vi` và `en`, không viết cứng — `pnpm lint:i18n` + test khớp khóa.
4. CSS: dưới 900px chỉ một ngăn hiện; mục chạm ≥ 44px; trường lọc full-width; ≥ 900px không đổi — kiểm tay KT-016 (E2E có dữ liệu bình luận chưa có hạ tầng seed → ghi vào gap matrix).

## File sẽ đọc

`design/stitch/comments.png` · `(guarded)/comments/page.tsx` · `inbox-tabs.tsx` · `lib/inbox-filters.ts` · `styles/globals.css` (khối `.inbox*`) · `messages/{vi,en}.json` (khối `comments.detail`).

## File sẽ sửa / tạo

`lib/inbox-pane.ts` (+test) · `comments/page.tsx` · `styles/globals.css` · `messages/{vi,en}.json` · docs (gap-matrix, MASTER, codemap, KIEM_TRA_TAY, QUYET_DINH, handoff).

## Migration

Không có.

## Test viết trước

`inbox-pane.test.ts` (hàm chọn ngăn + URL quay lại).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/inbox-pane.test.ts`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/token/gửi).

## Rủi ro / câu hỏi cho chủ dự án

Thiết kế mobile chưa có trong Stitch — xem QM1; chủ dự án có thể yêu cầu `/stitch-sync` bản mobile.

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

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/QM1).
