# Bàn giao `feat/pipe-orchestrator` (claude)

Kế hoạch đã duyệt (kèm 4 sửa đổi) ở `docs/plans/feat-pipe-orchestrator.md`; quyết định Q-POR1..3. Tiến độ theo lát:

| Lát | Trạng thái |
|---|---|
| A — lõi `runPipeline` dùng chung | **Xong** (PR của nhánh này) |
| B — đọc ngữ cảnh DB + migration 0072 | **Xong** (nhánh `feat/pipe-orchestrator-b`; `loadPipelineContext`, `comments.ingest_source`, Q-POR4) |
| C — chặn dừng khẩn cấp/hạn mức + bảng `pipeline_turns` (migration 0073) | **Xong, CHỜ chủ dự án kiểm chéo** (nhánh `feat/pipe-orchestrator-c`, không tự merge) |
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

## Lát C — chặn trước LLM + trừ lượt idempotent (CHỜ KIỂM CHÉO)
**Làm gì:** `createTurnGate` (`packages/ai/src/pipeline/turn-gate.ts`) nối vào `runPipeline` qua `deps.gate`: dừng khẩn cấp → giành quyền + khóa + trừ lượt trong MỘT giao dịch ngắn (`createDbTurnPorts`, worker) → commit TRƯỚC khi gọi LLM. Bảng mới `cf.pipeline_turns` (migration 0073): `comment_id` khóa chính (duy nhất), `charged_at` ghi một lần (trigger), `attempts`, `state`, `locked_until` (thuê chống job trùng). Q-POR3, Q-POR5.

**Số đo (DB thật):** test tích hợp cổng lượt 17 (worker) + 14 (DB) xanh; crash sau consume trước persist → xử lý tiếp không trừ thêm; 5 job đồng thời → trừ 1 lượt, 1 job chạy, 4 `busy`; hết lượt/dừng khẩn cấp → `extract`/`draft` đếm = 0 lần gọi.

### Tự kiểm theo `verify.md` — tự kiểm, chưa có kiểm chứng độc lập
- §A.1 cô lập workspace: mọi truy vấn mới lọc `workspace_id`; bảng mới bật RLS; test workspace khác không giành quyền/không thấy. ✔
- §A.2 bí mật: không log; `last_error` chỉ mã lý do (CHECK ≤ 200 ký tự, không nội dung khách). ✔
- §A.4 tự gửi: lát này KHÔNG chạm `decideAutoSend`/`sendRecheck`/đường gửi; không có import đường gửi. ✔ Lỗi đọc cờ dừng khẩn cấp/hạn mức → chặn (đóng khi lỗi). ✔
- §A.5 số tiền: không chạm. §A.6 quyền: thành viên chỉ đọc, chỉ hệ thống ghi (policy + GRANT theo cột + `check-rls` kỳ vọng mới). ✔ §A.7 đầu vào: id ép kiểu `::uuid`, lý do cắt 200 ký tự. ✔
- §B.1 RLS ✔ (`pnpm db:check-rls` đạt). §B.2 chỉ thêm bảng mới, không khóa bảng lớn, có đường lùi (`DROP TABLE`/`DROP FUNCTION`). ✔ §B.3 PK `comment_id` + chỉ mục `(workspace_id, state, updated_at)` cho job quét lát E. §B.4 `timestamptz`. ✔ §B.5 đã thêm bảng vào `docs/10`.

### Điểm cần bạn nhìn kỹ khi kiểm chéo
1. **Lượt đã trừ không hoàn khi lỗi hệ thống** (trừ ở ĐẦU lượt): bình luận kết thúc `needs_human` do lỗi sau khi đã trừ vẫn mất 1 lượt. Chọn thế vì an toàn hơn không trừ; hoàn lượt là việc thêm nếu bạn muốn (Q-POR5).
2. **Thuê 120 giây:** job trùng/đồng thời nhận `busy` (bỏ qua, không đốt lần thử). Crash cứng: bình luận chờ thuê hết hạn (tối đa 120 giây) rồi job được giao lại/job quét (lát E) xử lý tiếp.
3. **Giao dịch trừ lượt** giữ khóa dòng bình luận + dòng bộ đếm lượt chỉ trong thời gian rất ngắn (không có lời gọi LLM trong giao dịch); các bình luận khác nhau của cùng workspace tuần tự hóa qua dòng bộ đếm (vài mili giây mỗi lần).
4. **`isWorkspaceEmergencyStopped`**: workspace không đọc được → coi là ĐANG DỪNG (đóng khi lỗi).
5. **Hạn mức** vẫn lấy từ `resolveAiTurnLimit` (biến môi trường `AI_TURNS_PLAN_LIMIT`, Q-UMU1, mặc định 500) — chưa nối gói cước thật; nay hàm nằm ở `@flow/shared` dùng chung web/worker.
6. **Sửa nội dung migration sau khi áp:** 0073 được sửa (thêm `locked_until`) sau khi áp lên `cf_dev`; đã dùng `db:repair-dev` — đã khớp.

### Lưu ý cho lát D/E
- Handler (lát E) phải xử lý `blocked` theo lý do: `busy` → bỏ qua (KHÔNG đánh `needs_human`); `gate_error` → ném để pg-boss thử lại; `quota_exhausted`/`attempts_exhausted` → ghi bản nháp "Cần nhân viên" kèm lý do (lát D); **`emergency_stop` → KHÔNG ghi gì, bình luận giữ `new`, job quét bỏ qua workspace đang dừng (Q-POR7)**.
- Lỗi có kiểm soát trong handler → gọi `releasePipelineTurn` để lần thử lại giành được ngay; xong → `completePipelineTurn`.

## Lát D — ghi kết quả (nhánh `feat/pipe-orchestrator-d`)

**Làm gì:** `persistPipelineResult` (một giao dịch: CAS `processing → trạng thái cuối`, `drafts`, `retrieval_logs`, `kb_gaps`, khóa lượt `done`), `persistHandoff` ("Cần nhân viên", khóa theo bình luận, idempotent), `runCommentPipeline` (cổng → pipeline → ghi; gia hạn thuê 120 giây trước mỗi lời gọi LLM; dừng khẩn cấp/busy/đã xử lý → không ghi; lỗi tạm → nhả thuê và ném). `NewDraft` ghi thêm `extracted`, `confidence_components`, `context_refs`; nguồn sản phẩm mang `priceSources` để dựng `price_snapshot`.
**Số đo (DB thật):** `pipeline-persist.int.test.ts` 5 + `pipeline-run.int.test.ts` 10 xanh; gói `ai` 1861 test xanh. Chạy trùng/đồng thời → đúng 1 bản nháp; PII không lọt cột nào.
**Việc lát E:** dựng `LlmClient` thật + adapter `ai_usage` qua `withJob`, job `pipeline`, quét, `shouldAutoRunPipeline`. Ghi chú: nhật ký tìm kiếm chưa có điểm từng nhánh (vector/toàn văn/trigram) — cần mở rộng `TryKnowledge`.
**Tự kiểm (verify.md §A):** không đụng auth/RLS/migration/đường gửi; ghi chỉ qua `withJob` đúng workspace; văn bản qua `maskPii`. Nhãn: tự kiểm, chưa có kiểm chứng độc lập.

## Lát E — job `pipeline`, gộp, quét (nhánh `feat/pipe-orchestrator-e`)

**Làm gì:** (1) Token thuê (Q-POR10). (2) Nguồn kiến thức `loadWorkspaceKnowledge` và dựng LLM `createLlmDepsFromEnv` chuyển sang `@flow/ai`, web và worker CÙNG gọi (không bản thứ hai; test `workspace-knowledge.int.test.ts`: cùng câu hỏi + cùng phiên bản KB → cùng nguồn, cùng điểm; worker CHỈ đọc phiên bản đã xuất bản). (3) `runPipelineJob`: ngữ cảnh thật + gộp bình luận (FR-148, bình luận cuối làm chính, các bình luận trước `merged_into_id` + `skipped`) + cổng lượt + ghi; không giữ giao dịch qua LLM (mỗi lần tìm kiếm một giao dịch ngắn). (4) `ingest` xếp job `auto` sau commit với `startAfter` = cửa sổ gộp, qua `shouldAutoRunPipeline` (lỗi xếp không làm hỏng ingest). (5) Job quét 5 phút (migration 0074, hàm DEFINER chỉ đọc): bỏ qua backfill chưa từng có lượt và workspace dừng khẩn cấp. (6) Cờ `PIPELINE_ENABLED` + `PIPELINE_WORKSPACE_IDS` (mặc định TẮT), đăng ký `main.ts`; thiếu cấu hình LLM → không chạy.
**Số đo (DB thật):** worker int 8 (job) + 7 (quét) + 25 (ingest) + 10 (run) + 3 (kiến thức) xanh; config 22.
**Chưa làm / việc sau:** lát E2 (ngữ cảnh hội thoại, Q-POR12) NGAY SAU lát E, trước lát F; "cuối mỗi job kiểm bình luận còn chờ cùng khách+bài" được thay bằng job quét + startAfter từng bình luận; E2E Playwright chưa chạy worker.
**Điểm cần chủ dự án nhìn kỹ (nhạy cảm):** migration 0074 (hàm DEFINER đọc bình luận xuyên workspace, chỉ trả id + nguồn, chỉ cf_worker gọi được, bỏ qua workspace dừng khẩn cấp); luồng bỏ qua dừng khẩn cấp; `PIPELINE_ENABLED` mặc định tắt. Tự kiểm, chưa có kiểm chứng độc lập.
