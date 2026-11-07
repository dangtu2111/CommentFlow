# Bàn giao `feat/pipe-orchestrator` (claude)

Kế hoạch đã duyệt (kèm 4 sửa đổi) ở `docs/plans/feat-pipe-orchestrator.md`; quyết định Q-POR1..3. Tiến độ theo lát:

| Lát | Trạng thái |
|---|---|
| A — lõi `runPipeline` dùng chung | **Xong** (PR của nhánh này) |
| B — đọc ngữ cảnh DB + migration 0072 | **Xong** (nhánh `feat/pipe-orchestrator-b`; `loadPipelineContext`, `comments.ingest_source`, Q-POR4) |
| C — chặn dừng khẩn cấp/hạn mức + bảng `pipeline_turns` (migration 0073) | Chưa — **gửi diff cho chủ dự án kiểm chéo trước khi merge** |
| D — ghi `drafts`/`ai_usage`/`retrieval_logs`/`kb_gaps` (đã che PII) | Chưa |
| E — job `pipeline`, gộp bình luận, job quét, `PIPELINE_ENABLED` + `PIPELINE_WORKSPACE_IDS` | Chưa |
| F — hiện gợi ý, nút "Soạn gợi ý", đường vàng | Chưa |

## Lát A đã làm gì
- Lõi chuỗi một lượt chuyển từ `try/try-pipeline.ts` sang `pipeline/run-pipeline.ts` (hàm `runPipeline`); `try/try-pipeline.ts` chỉ còn re-export, `runTryPipeline` là alias của CÙNG hàm — ô Thử AI gọi như cũ, worker sẽ gọi `runPipeline`.
- Cổng mới (tùy chọn, mặc định như cũ): `deps.gate` (chạy SAU lọc/che PII/chuẩn hóa, TRƯỚC `extract`; bị chặn → `status: 'blocked'` + lý do, không tốn token), `input.thread` (`clarifyCount`, `repeatCount`, `humanHolding`), `input.risks` (mạo danh có danh tính, `priceConflict`, `stockStale`), `input.attachmentTypes` (luật ảnh/video FR-143).
- Kết quả `done` mang thêm `extract` thô (cho `drafts.extracted`) và `thread` đã dùng. Bình luận bị `ruleFilter` bỏ → `skipped` TRƯỚC gate (không hỏi hạn mức, không trừ lượt — FR-024).
- Các nơi đọc `TryResult` đổi sang `status !== 'done'` (ô Thử AI, bộ câu kiểm thử, playground, EVAL-RUNNER) vì `blocked` chỉ xuất hiện khi có gate.

## Lưu ý cho lát sau
- Cổng đọc DB (lát B) và gate hạn mức (lát C) chỉ cần truyền vào `runPipeline`; không sửa lõi nữa.
- `drafts.price_snapshot` cần dữ liệu có cấu trúc (product/variant id, giá, tồn, mốc đồng bộ) — `TryCandidate` hiện chỉ có văn bản; thêm ở lát D.

## Lát B đã làm gì
- Migration `0072` (chỉ thêm): `automation_settings.merge_window_seconds` (10–60, mặc định 30), `human_hold_minutes` (≥ 0, mặc định 120), `comments.ingest_source` (`webhook|polling|backfill`). **Bình luận có sẵn trước migration = `backfill`** (thêm cột với `DEFAULT 'backfill'` rồi `DROP DEFAULT`); dòng mới BẮT BUỘC ghi nguồn — mọi chỗ chèn `cf.comments` (ingest, test, dev-seed) đã ghi nguồn. Chạy trên `cf_dev`: 488 bình luận cũ → `backfill`.
- `ingest` ghi `ingest_source` từ `payload.source` (`ingestSourceOf`: không có → webhook; giá trị lạ → webhook).
- `loadPipelineContext(tx, ws, commentId, now)` (chỉ đọc): bình luận, bài (caption), sản phẩm gắn bài đã xác nhận, tên Page, cấu hình, bản kiến thức mới nhất đã xuất bản, chuỗi (`clarifyCount`, `repeatCount`, `humanHolding`) theo Q-POR4.
- Test: 893 test DB tích hợp + 105 worker tích hợp xanh trên DB thật; hành vi migration trên dữ liệu cũ kiểm bằng cách chạy chính câu lệnh trong file migration.

## Lưu ý cho lát C/E
- `shouldAutoRunPipeline` (lát E) đọc `comments.ingest_source`; job quét chỉ nhặt bình luận hàm đó cho phép hoặc đã có `pipeline_turns`.
- Nếu ai đó cần DB dev khớp sau khi sửa nội dung migration đã áp: `pnpm --filter @flow/db db:repair-dev <tên>` (xem `docs/workflows/db-drift.md`).
