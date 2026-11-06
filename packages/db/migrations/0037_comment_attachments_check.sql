-- ===================================================================================================
-- ATTACHMENTS-STORE (feat-attachments-store, FR-143): `cf.comments.attachments` (jsonb, đã có từ 0019) giờ được worker ghi
-- `[{type, url?, externalId?}]`. Ràng buộc hình dạng ở tầng DB: phải là MẢNG và ≤ 10 phần tử (khớp MAX_ATTACHMENTS của
-- @flow/connectors) — chặn dữ liệu sai dạng/phình to dù code ghi lỗi. Không bảng/policy/quyền mới; các hàm xóa trắng
-- (0025/0026) ghi '[]' nên vẫn hợp lệ. Dùng CASE để không phụ thuộc thứ tự đánh giá AND (object/scalar → false, không ném 22023).
-- Hai bước NOT VALID rồi VALIDATE: bước đầu khóa rất ngắn và đã chặn dòng mới; VALIDATE chỉ giữ SHARE UPDATE EXCLUSIVE
-- (không chặn đọc/ghi) khi quét dòng cũ (mọi dòng cũ là '[]' vì chưa có mã nào ghi cột này).
-- Đường lùi: ALTER TABLE "cf"."comments" DROP CONSTRAINT "comments_attachments_shape_check";
-- ===================================================================================================
ALTER TABLE "cf"."comments" ADD CONSTRAINT "comments_attachments_shape_check" CHECK (case when jsonb_typeof("cf"."comments"."attachments") = 'array' then jsonb_array_length("cf"."comments"."attachments") <= 10 else false end) NOT VALID;--> statement-breakpoint
ALTER TABLE "cf"."comments" VALIDATE CONSTRAINT "comments_attachments_shape_check";
