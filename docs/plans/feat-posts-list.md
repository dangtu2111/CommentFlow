# Kế hoạch `feat-posts-list` — Danh sách bài viết

## Việc

Mã gap matrix: `POSTS-LIST` · Spec: FR-060, US-032, UF-7 (docs/07 §7.3b, `design/stitch/posts.png`).

**Tóm tắt:** Thêm trang `/app/posts` liệt kê bài của các kênh trong workspace: lọc theo nền tảng/kênh/loại bài (thường/quảng cáo), tìm theo nội dung hoặc mã bài, sắp xếp (bình luận chờ nhiều nhất / mới nhất), phân trang. Hiện số bình luận và số chờ duyệt (đã có sẵn ở `posts`). Bảng `post_products` (gắn sản phẩm) CHƯA có và cần migration (chỉ làn b) nên bộ lọc "đã gắn / chưa gắn" và nhãn gắn sản phẩm để lại ở gap `POSTS-LIST-LINK-FILTER`. Chỉ đọc, không đổi DB.

## Điểm chưa rõ

Không có. Tự chọn (ghi Q-PL1): bộ lọc gắn/chưa gắn hoãn tới khi có `post_products`; phân trang theo số trang (khớp thiết kế "1 2 3 … 12"), 20 bài/trang.

## Tiêu chí nghiệm thu

1. Truy vấn trả bài của workspace mình, không thấy workspace khác, người ngoài → rỗng — test tích hợp `posts.int.test.ts` (FR-060).
2. Lọc nền tảng, kênh, quảng cáo/thường, tìm kiếm (không phân biệt dấu/hoa thường, thoát `%_`; khớp mã bài) hoạt động — cùng test.
3. Sắp xếp + phân trang ổn định (tổng số đúng, trang cuối) — cùng test.
4. Tham số URL lạ bị bỏ qua, dựng lại URL đúng — `posts-filters.test.ts`.
5. Menu có mục Bài viết (Owner + Staff), nhãn vi/en đủ khóa — `app-nav.test.ts`, `lint:i18n`.
6. Trang truy cập qua `requireAppUser` — test quét hiện có; kiểm tay KT trong `KIEM_TRA_TAY.md`.

## File sẽ đọc
`schema/cf/posts.ts`, `queries/inbox.ts`, `comments/page.tsx`, `inbox-filters.ts`, `inbox-toolbar.tsx`, `app-nav.ts` (đã đọc).

## File sẽ sửa / tạo
- `packages/db/src/queries/posts.ts` (+ export ở `runtime.ts`), `packages/db/tests/posts.int.test.ts` — truy vấn.
- `apps/web/src/lib/posts-filters.ts` (+test) — tham số URL.
- `apps/web/src/server/posts.ts` — nạp dữ liệu trong `withActor`.
- `apps/web/src/app/app/(guarded)/posts/page.tsx`, `components/posts/{posts-toolbar,posts-list}.tsx`, `globals.css`.
- `app-nav.ts` (+test), `packages/shared/messages/{vi,en}.json`.
- docs: gap-matrix, MASTER, codemap, QUYET_DINH_CHO_DUYET, KIEM_TRA_TAY, handoff.

## Migration
Không có.

## Test viết trước
Test tích hợp truy vấn và test `posts-filters` viết trước, chạy đỏ rồi mới viết mã.

## Lệnh test phạm vi hẹp
`CF_LANE=a pnpm --filter @flow/db exec vitest run -c vitest.int.config.ts tests/posts.int.test.ts`; `pnpm --filter @flow/web exec vitest run src/lib/posts-filters.test.ts src/lib/app-nav.test.ts`.

## Cần kiểm chứng độc lập không?
Không (chỉ đọc, qua `withActor` + RLS có sẵn; không auth/thanh toán/migration).

## Rủi ro / câu hỏi cho chủ dự án
`posts.message/permalink/media_url` có thể trống tới khi có `POST-HYDRATE`: giao diện hiện mã bài thay cho tiêu đề.

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

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR; điểm mơ hồ ghi Q-PL1).
