# Kế hoạch `feat-ui-gate-comments` — Cổng đủ thành phần màn Bình luận

## Việc

Mã gap matrix: `UI-GATE-COMMENTS` · Nguồn dựng: `design/stitch/comments.html`.

**Tóm tắt:** đưa `/dev/ui/comments` (và các thành phần dùng chung với `/app/comments`) từ 38/105 = 36,2% lên ≥ 95% đủ thành phần so với HTML Stitch, đo bằng `e2e/support/ui-completeness.mjs`. Thành phần chưa có dữ liệu/chức năng vẫn hiện đúng thiết kế nhưng vô hiệu + "Sắp có"; dữ liệu mẫu có nhãn `[MẪU]` chỉ truyền ở trang mẫu. Không đổi logic nghiệp vụ, không migration.

## Điểm chưa rõ

Không có (Q-UIGC1 ghi các lựa chọn an toàn).

## Tiêu chí nghiệm thu

1. `node e2e/support/ui-completeness.mjs comments //dev/ui/comments` ≥ 95% — kiểm bằng báo cáo trước/sau ở `docs/plans/ui-fidelity/gate-comments/`.
2. Bounding box dải phụ/3 cột khớp Stitch ≤ 2px — kiểm bằng `e2e/support/measure-comments.mjs` (`so-bbox.json`).
3. Trang thật `/app/comments` không hiện số liệu bịa: thành phần chưa có dữ liệu hiện "—"/"Sắp có", nút chưa có chức năng `aria-disabled` — kiểm bằng đọc props (chỉ trang mẫu truyền `sample`/`extras`).
4. i18n vi/en đủ khóa — `pnpm lint:i18n`; không chạm cổng gửi/ẩn — test hiện có xanh.

## File sẽ đọc

`design/stitch/comments.html`, `scripts/lib/ui-completeness.mjs`, `components/comments/*` (strip, tabs, toolbar, list, detail, reply-composer, suggestion-panel), `app/dev/ui/comments/page.tsx`, `styles/inbox.css`.

## File sẽ sửa / tạo

Các file trên + `styles/inbox-parts.css` (mới) + `app/layout.tsx` (import CSS) + i18n vi/en + `suggestion-panel.test.tsx` (mới) + tài liệu (quyết định, codemap, KT, gap matrix, MASTER, handoff).

## Migration

Không có.

## Test viết trước

Đo cổng đủ thành phần trước (36,2%); `suggestion-panel.test.tsx` cho dải ghi chú/chip nguồn (logic hiển thị mới).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/components/comments src/lib`

## Cần kiểm chứng độc lập không?

Không (chỉ giao diện; không chạm auth/RLS/cổng tự gửi/`sendRecheck`).

## Rủi ro / câu hỏi cho chủ dự án

Ô soạn nay điền sẵn câu AI gợi ý khi có (người vẫn phải bấm gửi); hiện chưa có nguồn `drafts` nên trang thật chưa thấy khác.

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

**Đã duyệt** (tự duyệt: quyết định có trong quy tắc UI-first 06/11; Q-UIGC1).
