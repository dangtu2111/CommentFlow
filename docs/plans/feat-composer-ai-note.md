# Kế hoạch `feat/composer-ai-note` — Ghi chú riêng cho AI trong Biên tập

Mã gap matrix: `POST-PUBLISHING` (mở rộng) · Quyết định tự chọn: `docs/plans/quyet-dinh/qpub5.md`.

**Tóm tắt:** Nối ô "Ghi chú riêng cho AI (khách không nhìn thấy)" đang bị khóa. Owner viết ghi chú khi soạn; khi bài đăng thành công, ghi chú trở thành ghi chú của bài (`cf.post_notes`) để AI dùng khi tư vấn bình luận của bài đó. Pipeline AI đã đọc `post_notes` nên không đổi prompt. Rủi ro: ghi chú sai làm AI tư vấn sai; chặn bằng giới hạn 1000 ký tự, chỉ Owner viết, hiển thị công khai trước nhân viên ở trang Bài viết (nơi sửa/xóa ghi chú).

## Điểm chưa rõ
Không có.

## Tiêu chí nghiệm thu
1. Owner lưu/sửa/xóa ghi chú ở bài nháp/đã lên lịch; Staff 42501; > 1000 ký tự 22023 — test tích hợp.
2. Đăng thành công → có `post_notes` còn hiệu lực (kể cả khi bài không gắn sản phẩm); không nhân đôi ghi chú giống hệt — test tích hợp.
3. Giao diện: ô nhập bật, đếm ký tự, điền lại khi sửa bài — test render.
4. Form: chuẩn hóa xuống dòng, cắt khoảng trắng, rỗng → xóa — test.

## File sẽ sửa
`packages/db/migrations/0094_publish_post_ai_note.sql` (+ journal), `packages/db/src/publish-posts.ts` + `runtime.ts`, `apps/web/src/lib/publish-form.ts`, `server/post-calendar.ts` + `publish-posts.ts`, `composer/page.tsx`, `composer-studio.tsx`, i18n vi/en.
