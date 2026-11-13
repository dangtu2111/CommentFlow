# Kế hoạch `feat/composer-product-tag` — Gắn sản phẩm vào bài khi soạn

Mã gap matrix: `POST-PUBLISHING` (mở rộng) · Quyết định: `docs/plans/quyet-dinh/qpub3.md` (chủ dự án đã đồng ý đề xuất 13/11/2026).

**Tóm tắt:** Owner chọn tối đa 5 sản phẩm thật của cửa hàng khi soạn bài. Khi bài đăng thành công, hệ thống tạo liên kết bài–sản phẩm "đã xác nhận" (người xác nhận là Owner đã chọn) để AI báo giá đúng khi trả lời bình luận. Không nới RLS. Rủi ro: ghi nhầm liên kết → AI nhắc sai sản phẩm; chặn bằng ràng buộc DB (chỉ sản phẩm đang bán của workspace) và không để lỗi phụ làm hỏng kết quả đăng.

## Điểm chưa rõ
Không có.

## Tiêu chí nghiệm thu
1. Owner lưu/sửa danh sách sản phẩm (thứ tự giữ nguyên, bỏ trùng); sản phẩm lưu trữ/workspace khác/quá 5 → 22023; Staff → 42501 — test tích hợp.
2. Đăng thành công → có `cf.posts` + `post_products` `confirmed`, `is_primary` ở sản phẩm đầu, `confirmed_by` = Owner, `suggested_by_ai` = false; dùng lại dòng `cf.posts` có sẵn — test tích hợp.
3. Sản phẩm bị lưu trữ sau khi chọn hoặc lỗi liên kết không làm hỏng việc ghi kết quả đăng — test tích hợp.
4. Hàm nội bộ không cấp cho cf_app/cf_worker; `db:check-rls` đạt — kiểm.
5. Giao diện: nút "Gắn sản phẩm" chọn/bỏ/tìm kiếm, giới hạn 5, điền lại khi sửa bài; không có sản phẩm → khóa kèm lý do — test render.

## File sẽ đọc / sửa
Đọc: migration 0049, 0090; `publish-posts.ts` (db/web), `composer-studio.tsx`. Sửa/tạo: `0091_publish_post_products.sql` (+ journal), `packages/db/src/publish-posts.ts` + `runtime.ts`, `apps/web/src/lib/publish-form.ts`, `server/post-calendar.ts` + `publish-posts.ts`, `composer/page.tsx`, `composer-studio.tsx`, i18n vi/en, test, tài liệu.

## Migration
0091 (chỉ thêm + thay thân `record_publish_result`, giữ chữ ký). Đường lùi ở đầu file. Đã kiểm lùi trong giao dịch rồi ROLLBACK trên `cf_test`.
