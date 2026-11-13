# Kế hoạch `feat/composer-calendar-ui` — Giao diện "Biên tập bài viết" và "Lịch đăng" + nhóm điều hướng mới

Mã gap matrix: `COMPOSER-CALENDAR-UI` (mới, GĐ UI-first) · Spec: chưa có mục riêng trong `docs/01–16` (xem "Đề xuất thay đổi") · Thiết kế: `design/stitch/composer.html` ("Biên tập bài viết & Gắn sản phẩm AI - Post Composer Studio") và `design/stitch/calendar.html` ("Lịch phát hành bài viết & Quản trị lịch đăng - Social Calendar").

**Tóm tắt:** Thêm nhóm điều hướng thứ ba (ngoài "Điều hướng vận hành" và "Hệ thống & trí tuệ") chứa hai trang mới theo thiết kế Stitch: **Biên tập bài viết** (`/app/composer`) và **Lịch đăng** (`/app/calendar`). Theo quy tắc UI-first (Q-UIF1) đây CHỈ là giao diện: không có bảng "bài lên lịch", không đăng được lên Facebook. Mọi thứ chưa có backend hiện đúng thiết kế nhưng vô hiệu kèm "Sắp có"; mọi số liệu/huy hiệu trong thiết kế mà không có thật được bỏ hoặc thay bằng dữ liệu thật. Rủi ro: tính năng ĐĂNG bài là phạm vi mới ngoài spec hiện tại (cần quyền Meta `pages_manage_posts`, App Review).

## Điểm chưa rõ

Không có. Quyết định tự chọn (khuyến nghị an toàn, đảo ngược được; ghi ở `docs/plans/quyet-dinh/qcmp1.md`):
1. Tên nhóm: "Biên tập & lịch đăng"; mục: "Biên tập bài viết", "Lịch đăng". Vị trí: giữa hai nhóm cũ.
2. **Chỉ Owner** thấy và vào được (Staff nhận 404) vì đăng bài là hành động hướng ra ngoài. Đổi sang cả Staff chỉ cần sửa một hằng số.
3. Lịch hiển thị **bài thật** (`posts`, theo `created_time` trong múi giờ workspace) với trạng thái "Đã đăng"; chưa có bài lên lịch/bản nháp (không bịa).
4. Không đưa vào gợi ý "khung giờ vàng", hashtag gợi ý, số tương tác/KPI tăng trưởng, tên cửa hàng/sản phẩm mẫu, "AI v2.4", "đạt chuẩn Meta" — đều không có dữ liệu thật.

## Tiêu chí nghiệm thu

1. Thanh bên Owner có nhóm thứ ba với hai mục dẫn tới trang thật; Staff không thấy; Staff vào trực tiếp nhận 404 — test `app-nav` + test trang.
2. Composer: chọn kênh (từ kênh thật đã kết nối), soạn nội dung, bộ đếm ký tự từng nền tảng đúng giới hạn (FB 63.206, IG 2.200, TikTok 2.200), xem trước cập nhật theo nội dung; các nút Lưu nháp / Lên lịch / Đăng ngay / AI / tải media / gắn sản phẩm vô hiệu kèm "Sắp có" — test thuần + render.
3. Lịch: lưới tuần 7 cột, điều hướng tuần trước/sau/hôm nay bằng tham số URL (dùng được khi tắt JS), bài thật nằm đúng ngày/giờ theo múi giờ workspace, chọn bài mở khung chi tiết (link tới bài gốc và bình luận), trạng thái rỗng trung thực — test thuần (`calendar-week`) + test tích hợp truy vấn.
4. Không có dữ liệu mẫu hiển thị như dữ liệu thật; mọi chữ qua i18n `vi`/`en` — `pnpm lint:i18n`.
5. Chụp 1440px và 390px, đối chiếu `design/stitch/*.png`, liệt kê điểm lệch ở `docs/plans/ui-fidelity/composer-calendar/` — bước thủ công/`pnpm ui:fidelity`.

## File sẽ đọc

`apps/web/src/lib/app-nav.ts` (+test), `components/app/shell-nav.tsx`, `app/app/(guarded)/posts/page.tsx` + `components/posts/posts-header.tsx` (khuôn trang), `server/posts.ts` + `packages/db/src/queries/posts.ts` (truy vấn bài), `design/stitch/composer.html`, `design/stitch/calendar.html`.

## File sẽ sửa / tạo

- Sửa: `lib/app-nav.ts`, `lib/app-nav.test.ts`, `components/app/shell-nav.tsx`, `i18n/messages` (vi/en).
- Tạo: `lib/post-counters.ts` (+test), `lib/calendar-week.ts` (+test), `app/app/(guarded)/composer/page.tsx`, `components/composer/*`, `app/app/(guarded)/calendar/page.tsx`, `components/calendar/*`, `packages/db/src/queries/post-calendar.ts` (+test tích hợp), `server/post-calendar.ts`.

## Migration

Không có.

## Test viết trước

Hàm thuần: đếm ký tự/giới hạn, tuần (thứ Hai đầu tuần, chuyển tuần, "hôm nay" theo múi giờ), truy vấn lịch (ngày/giờ theo múi giờ, cô lập workspace).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib src/components/composer src/components/calendar`; `cd packages/db && pnpm exec vitest run --config vitest.int.config.ts tests/post-calendar.int.test.ts`.

## Cần kiểm chứng độc lập không?

Không (giao diện chỉ đọc; không auth/token/migration). Có dùng `requireAppUser({ role: 'owner' })`.

## Rủi ro / câu hỏi cho chủ dự án

- Tính năng đăng bài thật là phạm vi mới: cần quyền Meta `pages_manage_posts` (thêm vào App Review), bảng bài lên lịch, job đăng, kiểm tra tuân thủ chính sách Meta. Chưa làm ở nhánh này.
- Thiết kế có TikTok/Instagram; hiện chỉ Facebook có kết nối thật.

## Đề xuất thay đổi

Thêm mục "Biên tập & lịch đăng" vào `docs/08_UI_UX_Specification.md` và US/FR tương ứng khi chủ dự án chốt phạm vi đăng bài.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking (không có thư viện mới)
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò — không có bảng mới

## Trạng thái duyệt

**Đã duyệt** (chủ dự án yêu cầu làm giao diện hai trang này, 12/11/2026; các quyết định tự chọn ở trên theo quy tắc hỏi).
