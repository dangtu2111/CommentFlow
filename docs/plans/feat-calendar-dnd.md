# Kế hoạch `feat/calendar-dnd` — Kéo thả bài trên Lịch và hộp thoại chỉnh sửa/xem bài

Mã gap matrix: `POST-PUBLISHING` (mở rộng) · Quyết định tự chọn: `docs/plans/quyet-dinh/qpub6.md`.

**Tóm tắt:** Trên Lịch đăng: (1) kéo bài ĐÃ LÊN LỊCH sang ngày khác để đổi ngày (giữ nguyên giờ), kéo BẢN NHÁP vào ngày để mở hộp thoại với ngày điền sẵn; (2) click vào bài mở hộp thoại chỉnh sửa nội dung, ngày/giờ và xem trước bài giống Facebook. Rủi ro: đổi giờ một bài đã hẹn ảnh hưởng thời điểm đăng công khai; chặn bằng hàm DB chỉ Owner, chỉ bài chưa có mục tiêu đi tiếp, giờ 2 phút–90 ngày, giới hạn tốc độ, và thả bản nháp không tự lên lịch.

## Điểm chưa rõ
Không có.

## Tiêu chí nghiệm thu
1. Hàm DB: Owner đổi giờ/nội dung, thành nháp khi bỏ giờ; Staff 42501; giờ ngoài khoảng/thiếu nội dung/thiếu kênh/kênh hỏng 22023; bài đã đi tiếp hoặc workspace khác 55000 — test tích hợp.
2. Dịch vụ: kéo giữ giờ địa phương, về đúng tuần; ngày quá khứ → invalid_schedule không ghi; lên lịch cần cờ — test.
3. Giao diện: chỉ bài đã lên lịch kéo được; hộp thoại theo trạng thái (nháp/đã lên lịch/đã đăng/lỗi), xem trước theo lúc gõ — test render + trình duyệt thật (đã chạy: kéo → "đã chuyển", mở hộp thoại, sửa, lưu).

## File sẽ sửa
`packages/db/migrations/0095_update_publish_post.sql`, `packages/db/src/publish-posts.ts`, `apps/web/src/lib/{calendar-move,calendar-edit-form}.ts`, `server/{publish-posts,publish-runtime,post-calendar}.ts`, `app/(guarded)/calendar/{actions.ts,page.tsx}`, `components/calendar/{dnd,publish-modal,week-board}.tsx` (thay `publish-drawer`), i18n vi/en.
