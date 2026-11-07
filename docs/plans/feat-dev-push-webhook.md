# Kế hoạch `feat/dev-push-webhook` — lệnh dev đẩy webhook fixture vào Shop Thử 2

**Trạng thái duyệt:** Đã duyệt (chủ dự án yêu cầu 07/11/2026).

## Việc

Mã gap matrix: `DEV-PUSH-WEBHOOK` (công cụ DEV, hỗ trợ kiểm tay PIPE-ORCHESTRATOR).

**Tóm tắt:** Thêm `pnpm dev:push-webhook` (chỉ `cf_dev`) đẩy MỘT webhook bình luận fixture qua đường thật (`webhook_events` bằng hàm DEFINER + job `ingest`) vào workspace dev (mặc định "Shop Thử 2") để chủ dự án thấy pipeline chạy thật; `--cleanup` dọn. Dữ liệu mang nhãn `[FIXTURE]`. Không đổi logic nghiệp vụ, không migration.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Từ chối khi không phải `cf_dev` (cổng `assertDevSeedAllowed` dùng chung với `dev:seed-demo`) — kiểm bằng: guard test hiện có + CLI gọi cổng TRƯỚC khi mở kết nối.
2. Tạo kênh fixture MỘT lần, ghi sự kiện đúng workspace, đẩy job `ingest`, không đụng workspace khác — kiểm bằng: `push-webhook.int.test.ts`.
3. `--cleanup` dọn bình luận/bản nháp/bài/kênh fixture, giữ dữ liệu thật — kiểm bằng: cùng file.
4. Có mục KT-PIPE trong `docs/testing/KIEM_TRA_TAY.md` (qua `kiem-tra-tay.d`) — kiểm bằng: `pnpm kt:build`.

## File sẽ đọc / sửa

`tools/dev-seed/src/{push-webhook,push-webhook-cli}.ts` (+test), `tools/dev-seed/package.json` (thêm `@flow/connectors` nội bộ và `pg-boss` 12.38.0 MIT — đã dùng ở web/worker cùng phiên bản), `package.json` (script), `docs/testing/kiem-tra-tay.d/{kt,tt}-pipe.md`, codemap, gap-matrix.

## Migration

Không có.

## Cần kiểm chứng độc lập không?

Không (công cụ DEV, cổng chỉ-`cf_dev`).

## Rủi ro / câu hỏi cho chủ dự án

Không.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào.
