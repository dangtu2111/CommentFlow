# Kế hoạch `feat/post-hydrate` — POST-HYDRATE: điền nội dung bài từ nền tảng

## Việc

Mã gap matrix: POST-HYDRATE (Phần 4e, thứ tự chủ dự án 12/11/2026: POST-HYDRATE → INBOX-LABEL-FILTER → REPLY-ADDRESS-UI → DB-BOOTSTRAP → …).

**Tóm tắt (2–3 câu dễ hiểu):** Bài viết tạo từ webhook chỉ có mã ngoài nên inbox không hiện được nội dung/liên kết/ảnh bài. Nay sau khi ingest lưu xong bình luận của một bài MỚI, worker hỏi Facebook lấy nội dung bài và điền vào các ô còn trống (không ghi đè). Chạy khi connector Facebook bật; lỗi chỉ ghi cảnh báo, không làm hỏng ingest.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. `fetchPost` chỉ GET đúng trường, trường vắng → null, chỉ nhận liên kết/ảnh http(s), id sai không gọi mạng, lỗi Graph dùng chung xử lý.
2. `hydratePostFields` chỉ điền ô NULL, không ghi đè, đúng workspace (RLS), không có gì để điền thì không ghi.
3. Hook chỉ chạy cho bài MỚI tạo (một lần), sau commit; lỗi/ném của hook không làm hỏng ingest; không hook thì như cũ.
4. Không log nội dung bài/thông điệp lỗi, chỉ mã lỗi.
5. typecheck, biome, test connectors/worker/db xanh.

## File sẽ đọc / sửa

Sửa: `packages/connectors/src/facebook/connector.ts` (+test), `apps/worker/src/jobs/ingest.ts`, `apps/worker/src/main.ts`, `packages/db/src/runtime.ts`, `docs/gap-matrix.md`. Thêm: `packages/db/src/queries/post-hydrate.ts` (+int test), `apps/worker/src/jobs/post-hydrate.ts` (+test), `docs/can-ban-cung-cap.d/post-hydrate.md`.

## Migration

Không (cột `message/permalink/media_url/created_time` và quyền UPDATE của `cf_app` đã có từ 0019).

## Test viết trước

connector (3 ca), `post-hydrate.int.test.ts` (4 ca), `post-hydrate.test.ts` (4 ca), ingest int (2 ca).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/facebook` · `pnpm --filter @flow/db test:db tests/post-hydrate.int.test.ts` · `pnpm --filter @flow/worker exec vitest run src/jobs/post-hydrate.test.ts` · `pnpm --filter @flow/worker test:db tests/ingest.int.test.ts`.

## Cần kiểm chứng độc lập không?

Không: không migration, không đụng auth/RLS (chỉ dùng chính sách `posts_update` của hệ thống có sẵn)/cổng tự gửi/`sendRecheck`. Có gọi Meta (đọc) nhưng chỉ khi connector bật; token lấy qua provider có sẵn.

## Rủi ro / câu hỏi cho chủ dự án

- Bài lỗi không tự thử lại (chưa có cột theo dõi; cần migration nếu muốn) — chấp nhận: bài vẫn hiện với mã ngoài.
- Chưa kiểm với Page thật (xem `docs/can-ban-cung-cap.d/post-hydrate.md`).
