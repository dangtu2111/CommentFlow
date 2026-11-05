# Kế hoạch `feat/comment-tombstone` — Dấu xóa (tombstone) + dọn payload webhook sau 14 ngày

> Trạng thái duyệt: **Đã duyệt** (chủ dự án 05/11/2026: mục 2 "COMMENT-DELETE-BEFORE-CREATE: sửa ở nhánh có migration kế tiếp… ghi dấu xóa (channel_id, external_id, deleted_at); sự kiện tạo đến sau thấy dấu xóa → lưu dòng đã xóa trắng ngay. Test cả hai thứ tự"; mục 3 "WEBHOOK-PAYLOAD-RETENTION: dọn payload sau 14 ngày bằng job định kỳ; bắt buộc trước staging trong MASTER.md; được sửa docs/10 dòng webhook_events").

## Việc

Mã gap matrix: `COMMENT-DELETE-BEFORE-CREATE`, `WEBHOOK-PAYLOAD-RETENTION` · Spec: FR-048, docs/10 `comments`/`webhook_events`.

**Tóm tắt:** (1) Nếu sự kiện "khách xóa" đến trước sự kiện "tạo", hệ thống ghi một dấu xóa (kênh + mã bình luận + giờ xóa); khi sự kiện tạo đến sau, dòng bình luận được lưu NGAY ở dạng đã xóa trắng (không hiện trong inbox, không lưu nội dung/tên khách). (2) Một job định kỳ của worker xóa payload sự kiện webhook sau 14 ngày (payload chứa tên/nội dung khách). Rủi ro: dấu xóa chỉ chứa mã, không có nội dung; payload đã xóa không khôi phục được.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Xóa-trước-tạo-sau: dòng được tạo đã `deleted_at` (= giờ dấu xóa), `redacted_at`, `text=''`, tên/mã khách trống, không vào inbox/số tab; số đếm bài (`comment_count`/`pending_count`) không tăng — test DB + worker.
2. Tạo-trước-xóa-sau (đã có) vẫn đúng; xóa lần hai/tạo lại không đổi gì — test.
3. Dấu xóa chỉ do `cf.mark_comment_deleted` ghi (đường hệ thống); cf_app không đọc/ghi trực tiếp; check-rls đạt — test + `db:check-rls`.
4. Hàm dọn `cf.purge_expired_webhook_payloads(days)` (chỉ ngữ cảnh trần) đặt payload `{}` cho sự kiện cũ hơn 14 ngày (`received/processing/failed` → `dead`), xóa dấu xóa cũ hơn 14 ngày; không đụng sự kiện mới; chạy lại an toàn — test DB.
5. Worker chạy job dọn khi khởi động rồi mỗi giờ; lỗi không làm sập worker — test đơn vị.
6. docs/10 (webhook_events, comments, hàm mới), gap-matrix, MASTER (đánh dấu bắt buộc trước staging) cập nhật.

## File sẽ sửa / tạo

migration `0026_comment_tombstone.sql`; `schema/cf/comment-tombstones.ts`, `schema/cf/webhook-events.ts` (chỉ mục); `packages/db/src/{retention,runtime}.ts`; `check-rls.ts`; `apps/worker/src/{jobs/retention.ts,main.ts,jobs/ingest.ts}`; tests db/worker; docs.

## Migration

0026: bảng `cf.comment_tombstones` (PK `(channel_id, external_id)`, RLS chỉ hệ thống, cf_app không grant); hàm `cf.mark_comment_deleted` (thay bản 0025: ghi dấu xóa khi chưa có dòng); trigger BEFORE INSERT `cf.apply_comment_tombstone` (SECURITY DEFINER) trên `cf.comments`; hàm `cf.purge_expired_webhook_payloads(int)`; chỉ mục `webhook_events_retention_idx`. Đường lùi: lùi code; DROP TRIGGER/FUNCTION/TABLE; CREATE OR REPLACE `mark_comment_deleted` bản 0025; DROP INDEX.

## Cần kiểm chứng độc lập không?

Có — `verifier-db`.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking
