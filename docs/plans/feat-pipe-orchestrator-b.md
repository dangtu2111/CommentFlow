# Kế hoạch `feat/pipe-orchestrator-b` — PIPE-ORCHESTRATOR lát B (đọc ngữ cảnh thật từ DB)

**Trạng thái duyệt:** Đã duyệt (lát B của `docs/plans/feat-pipe-orchestrator.md`, chủ dự án duyệt 07/11/2026; sửa đổi của chủ dự án về migration 0072: dòng có sẵn = `backfill`, bỏ mặc định cột).

## Việc

Mã gap matrix: `PIPE-ORCHESTRATOR` (lát B) · Spec: `docs/09` §4, §7.1a; FR-011, FR-144, FR-147, FR-148, FR-154.

**Tóm tắt:** Lát B cho job `pipeline` đọc được ngữ cảnh THẬT từ DB (chỉ đọc): bình luận, bài (caption), sản phẩm gắn bài đã xác nhận, tên Page, chuỗi hội thoại (đã hỏi lại, hỏi lặp, nhân viên đang giữ), cấu hình gộp/giữ, bản kiến thức ĐÃ xuất bản. Kèm migration chỉ thêm (0072) và ghi nguồn bình luận ở `ingest`. Rủi ro: thêm cột bắt buộc ghi nguồn nên mọi chỗ chèn bình luận phải ghi `ingest_source`.

## Điểm chưa rõ

Không có. Quyết định: Q-POR4 (định nghĩa chuỗi và mặc định).

## Tiêu chí nghiệm thu

1. `loadPipelineContext` trả bình luận, bài, tên Page, loại đính kèm, nguồn; chưa có dòng cấu hình → mặc định 30 giây / 120 phút; chỉ sản phẩm gắn bài ĐÃ XÁC NHẬN, chính trước; bản kiến thức mới nhất đã xuất bản (chưa có → `null`) — kiểm bằng: `pipeline-context.int.test.ts`.
2. Ngữ cảnh chuỗi: `clarifyCount` chỉ đếm câu hỏi lại ĐÃ GỬI; `repeatCount` đếm lượt trước cùng nội dung (bỏ khác hoa/thường/khoảng trắng); `humanHolding` theo `human_hold_minutes` (0 = tắt); không tính bình luận của Page, đã xóa, lượt sau, lượt đã gộp vào chính nó — kiểm bằng: cùng file.
3. Không lộ chéo workspace; bình luận của Page/đã xóa/đã gộp vẫn trả về kèm cờ (nơi gọi quyết định) — kiểm bằng: cùng file.
4. `ingest` ghi `comments.ingest_source` từ `payload.source`: không có → `webhook`, `polling`, `backfill`; giá trị lạ → `webhook` — kiểm bằng: `ingest.int.test.ts`, `ingest-source.test.ts`.
5. Migration 0072 chỉ thêm: dòng bình luận CÓ SẴN = `backfill`; cột không có mặc định nên INSERT không ghi nguồn → lỗi; CHECK 3 giá trị — kiểm bằng: `comments-ingest-source.int.test.ts` (chạy đúng câu lệnh trong file migration trên bảng có dữ liệu cũ).
6. `pnpm precheck` xanh; DB integration và worker integration xanh.

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/db/src/schema/cf/{comments,automation,post-products,posts}.ts`, `queries/kb-publish.ts` (`getCurrentVersion`), `apps/worker/src/jobs/ingest.ts`, `packages/db/tests/helpers.ts`.

## File sẽ sửa / tạo

Migration `0072_pipeline_context.sql` + journal + schema (`comments.ts`, `automation.ts`); `packages/db/src/queries/pipeline-context.ts` (+ export ở `runtime.ts`); `packages/shared/src/ingest-source.ts` (+test); `apps/worker/src/jobs/ingest.ts`; mọi chỗ chèn `cf.comments` trong test và `tools/dev-seed` (thêm nguồn); tài liệu: Q-POR4, codemap, gap-matrix, handoff.

## Migration

`0072`: `automation_settings.merge_window_seconds` (10–60, mặc định 30), `human_hold_minutes` (≥ 0, mặc định 120), `comments.ingest_source` (CHECK `webhook|polling|backfill`; thêm với `DEFAULT 'backfill'` rồi `DROP DEFAULT` — dòng cũ = `backfill`, dòng mới bắt buộc ghi nguồn). Chỉ THÊM, không viết lại bảng, RLS không đổi; đường lùi: DROP COLUMN (ghi đầu file). Theo Q-MRG2: tự merge khi CI xanh.

## Test viết trước

Test tích hợp bộ đọc (9 ca), nguồn ingest, hành vi migration trên dữ liệu cũ.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/pipeline-context.int.test.ts tests/comments-ingest-source.int.test.ts` · worker `tests/ingest.int.test.ts` · `pnpm precheck`

## Cần kiểm chứng độc lập không?

Không (chỉ đọc + migration chỉ thêm); tự kiểm theo `verify.md` §B cho migration: có đường lùi, không nới RLS, không khóa bảng lâu.

## Rủi ro / câu hỏi cho chủ dự án

Dòng cũ thành `backfill` nên bình luận có sẵn không bao giờ tự chạy AI; muốn xử lý một bình luận cũ thì bấm "Soạn gợi ý" (lát F).

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào.
