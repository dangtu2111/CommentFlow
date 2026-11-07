# Bàn giao `feat/pipe-orchestrator` (claude)

Kế hoạch đã duyệt (kèm 4 sửa đổi) ở `docs/plans/feat-pipe-orchestrator.md`; quyết định Q-POR1..3. Tiến độ theo lát:

| Lát | Trạng thái |
|---|---|
| A — lõi `runPipeline` dùng chung | **Xong** (PR của nhánh này) |
| B — đọc ngữ cảnh DB + migration 0072 | Chưa |
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
