# Kế hoạch `feat/pipe-orchestrator` — PIPE-ORCHESTRATOR (Bước 4 lõi AI, GĐ2: soạn gợi ý, KHÔNG gửi)

**Trạng thái duyệt:** Chờ duyệt (chủ dự án yêu cầu 07/11/2026: lập kế hoạch chia lát nhỏ, gửi duyệt trước khi code). **Chưa viết dòng code nào của việc này.**

## Việc

Mã gap matrix: `PIPE-ORCHESTRATOR` (+ gỡ dần `USAGE-GATE-PIPE`, `RETRIEVAL-LOG-WIRE`, `DA-HOLDER-WIRE`, `DA-IMPERSONATION-WIRE`, `EMERGENCY-STOP-WIRE` ở mức đọc) · Spec: `docs/09` §4, §7.1, §7.1a, §9; FR-090, FR-141, FR-147, FR-148, FR-154, FR-155, FR-162.

**Tóm tắt:** Hiện AI chỉ chạy trong ô Thử AI. Việc này dựng job `pipeline` ở worker: nhận bình luận thật đã lưu, chạy CÙNG một chuỗi xử lý với ô Thử AI (một hàm dùng chung, hai nơi gọi), đọc ngữ cảnh thật từ DB, chặn hạn mức và dừng khẩn cấp TRƯỚC khi gọi LLM, rồi ghi bản nháp (`drafts`), mức dùng AI (`ai_usage`), nhật ký tìm kiếm (`retrieval_logs`) và lỗ hổng kiến thức (`kb_gaps`). Bản nháp hiện trong chi tiết bình luận để nhân viên duyệt. **GĐ2 không gửi gì ra Facebook:** đường gửi, cổng tự gửi (`decideAutoSend`) và `sendRecheck` để sau, chờ bạn. Rủi ro chính: chi phí LLM chạy trên mọi bình luận thật (mặc định TẮT bằng cờ), và trừ lượt gói nhầm hai lần khi job thử lại.

## Hiện trạng (đã kiểm trong code, để kế hoạch bám thực tế)

- Đã có: lõi `runTryPipeline` + `evaluateTurnRisks` + `decideAction`; `insertDraft`; bảng `drafts`, `retrieval_logs`, `kb_gaps`, `ai_usage`; `LlmClient` ghi `ai_usage`; `createUsageMeter().consume()` (trừ lượt nguyên tử, chỉ đường `withJob`); `workspaces.emergency_stopped_at`; `getCurrentVersion` (kb_version đã xuất bản); builder `buildRetrievalLogRecord`/`buildKbGapRecord`; `comments.merged_into_id`, trạng thái `processing/pending_review/needs_human`; `workspaceJob` + `withJob`; trang `comments` + `comment-detail.tsx` + `lib/suggestion.ts` (đã sẵn chỗ hiện gợi ý).
- Chưa có: job/hàng đợi `pipeline`; hàm đọc ngữ cảnh thật (chuỗi, người đang giữ, bài/caption, tên Page); cột cấu hình `merge_window_seconds` và `human_hold_minutes`; truy vấn ghi `retrieval_logs`/`kb_gaps`; bộ chuyển `LlmClient` sang đường `withJob` của worker; `consume()` chưa có khóa idempotent theo bình luận.

## Điểm chưa rõ

Không có thẻ chặn. Các quyết định tự chọn (khuyến nghị, đảo ngược được; sẽ ghi vào `docs/plans/quyet-dinh/` khi làm):
1. **Lượt trúng cache vẫn trừ 1 lượt** (1 lượt = 1 bình luận được AI xử lý, FR-090). Đảo ngược: không trừ khi cache hit.
2. **Hạn mức hết hoặc dừng khẩn cấp → KHÔNG gọi LLM**, bình luận sang `needs_human`, bản nháp ghi lý do (`quota_exhausted` / `emergency_stop`), không im lặng.
3. **Cờ `PIPELINE_ENABLED` mặc định TẮT** (chỉ đúng chữ `true` mới bật). Bật ở dev khi bạn đồng ý (có chi phí LLM thật qua khóa ảo, trần 10 USD/30 ngày).
4. Mạo danh/giá lệch caption/tồn cũ: nối đủ ở mức ĐỌC dữ liệu có sẵn (tên Page, caption bài, mốc đồng bộ); nguồn chưa có dữ liệu thì cờ tắt và ghi vào `context_refs` để biết.

## Thứ tự bước (đúng docs/09 §4, MỘT chuỗi cho cả hai nơi gọi)

`skipOwnPage` → `ruleFilter` → che PII + chuẩn hóa/nhận ngôn ngữ → **[chặn: dừng khẩn cấp → hạn mức (trừ lượt)]** → `cacheLookup` (chưa nối ở GĐ2, để trống có chủ đích) → `extract` → `rewriteQuery` → `route` → `retrieve` (sản phẩm → SQL giá/tồn → kiến thức hybrid, chỉ `kb_version` ĐÃ xuất bản) → `evaluateTurnRisks` → `decideAction` → `draft` → `guard` (tiền/xưng hô/nguồn) → độ tin cậy → `pickVariant` (chọn biến thể đầu, chưa Redis) → `persist`. **Không có `decideAutoSend`/gửi.** Ô Thử AI gọi cùng hàm `runPipeline` với các cổng đọc DB thay bằng mặc định (không bài, không Page, không chuỗi); worker gọi với cổng đọc DB thật. Cổng chặn (dừng khẩn cấp, hạn mức) nằm TRƯỚC `extract` nên không tốn token khi bị chặn.

## Chia lát (mỗi lát một PR nhỏ, tuần tự, có test, tự merge khi CI xanh trừ lát nhạy cảm)

**Lát A — Lõi một chuỗi, không đụng DB** (không migration): tách `runTryPipeline` thành `runPipeline(input, ports)`; `ports` = nguồn kiến thức, `extractor/rewriter/drafter`, `voices`, `risks` (nơi gọi cấp dữ liệu, mặc định như ô Thử AI), `thread` (`clarifyCount`, `repeatCount`, `humanHolding`), `gates` (chạy trước `extract`, trả `allow | blocked(reason)`). Kết quả mở rộng: mọi thứ `persist` cần (truy vấn tìm kiếm, nguồn kèm điểm, chủ đề thiếu, dữ liệu chụp giá). Ô Thử AI chuyển sang gọi hàm này; hành vi cũ giữ nguyên (bộ test hiện có là hàng rào). Nhẹ nhất, mở đường cho các lát sau.

**Lát B — Đọc ngữ cảnh thật từ DB (chỉ đọc)** + migration CHỈ THÊM: `loadPipelineContext(tx, commentId)` trả bình luận, bài (caption, sản phẩm gắn), tên Page của kênh, chuỗi (cha/con, các lượt của cùng khách cùng bài), `clarifyCount`/`repeatCount` (đếm từ bản nháp/phản hồi trước trong chuỗi, FR-144/147), người đang giữ chuỗi (`humanHolding` từ phản hồi của nhân viên trong `human_hold_minutes`, FR-154), cờ mạo danh/giá lệch/tồn cũ qua `evaluateTurnRisks` (đã có luật), `kb_version` ĐÃ xuất bản. Migration `0072`: thêm `automation_settings.merge_window_seconds integer NOT NULL DEFAULT 30 CHECK 10–60` và `human_hold_minutes integer NOT NULL DEFAULT 120 CHECK ≥ 0` + quyền theo cột; đường lùi: DROP COLUMN. Thuộc loại tự merge theo Q-MRG2.

**Lát C — Chặn trước khi gọi LLM (NHẠY CẢM — tự kiểm, không tự merge):** cổng `emergency_stopped_at` (đọc `workspaces`, đang dừng → chặn) rồi `consume()` hạn mức (FR-090: hết 100% → chặn, 80% → báo Owner một lần đã có sẵn trong `ConsumeOutcome`). Idempotent: chỉ trừ lượt MỘT lần cho một bình luận — giành quyền xử lý bằng cập nhật có điều kiện `status: new → processing` rồi mới `consume()`; job thử lại thấy đã `processing`/đã có bản nháp thì không trừ nữa. Lỗi đọc cờ/hạn mức → chặn (không "mở khi lỗi"). Test: dừng khẩn cấp, hết lượt, đúng 80%, thử lại không trừ hai lần, hai job đồng thời cùng bình luận.

**Lát D — Ghi kết quả (`persist`):** trong MỘT giao dịch `withJob`: `insertDraft` (kèm biến thể, claims, chủ đề thiếu, `price_snapshot` từ nguồn sản phẩm — mục ngoại tệ không đưa vào snapshot vì `sendRecheck` chưa đọc được), `retrieval_logs`, `kb_gaps` (mở/cộng dồn theo chủ đề), cập nhật `comments` (nhãn, ngôn ngữ, văn bản chuẩn hóa, `needs_followup`, trạng thái `pending_review` hoặc `needs_human`). `ai_usage` do `LlmClient` ghi — cần bộ chuyển để `LlmClient` dùng `withJob` ở worker (hiện dùng `withWorkspace`). Lỗi AI/đầu ra không đọc được → bản nháp "Cần nhân viên" với lý do, KHÔNG ném làm job lặp vô hạn (FR-032, docs/09 §9). Test tích hợp trên DB thật.

**Lát E — Job `pipeline` + gộp bình luận (FR-148):** hàng đợi `pipeline` (retry 3, concurrency 5, theo docs/09 §9), schema job, handler `workspaceJob`. `ingest` xếp job `pipeline` sau khi lưu bình luận mới với `singletonKey = workspace+bài+khách` và `startAfter = merge_window_seconds` (lát B); khi chạy, gộp chữ các bình luận chưa xử lý cùng khách cùng bài theo thứ tự thời gian thành một lượt, bản nháp gắn vào bình luận cuối, các bình luận trước đặt `merged_into_id`. Cờ `PIPELINE_ENABLED` tắt → không xếp job. Bỏ qua bình luận của chính Page (`is_own`, nguyên tắc #5) và bình luận đã xóa.

**Lát F — Hiện gợi ý + đường vàng:** `comment-detail.tsx` đọc bản nháp mới nhất (đã có `lib/suggestion.ts`; chỉ nối dữ liệu thật, nhãn "gợi ý — chưa gửi", lý do chặn nếu có). Kiểm đường vàng: (1) test tích hợp vitest trên DB thật: webhook fixture (đã có fixture chữ ký) → `processIngestEvent` → handler `pipeline` với LLM giả → bản nháp đúng trạng thái/giá/nguồn/`ai_usage`/`retrieval_logs`/`kb_gaps`; (2) Playwright: bình luận + bản nháp có sẵn hiện trong chi tiết bình luận. Nếu job E2E của CI chưa chạy worker, thêm worker vào job đó là việc riêng (ghi vào rủi ro) — không bắt buộc cho tiêu chí nghiệm thu.

Thứ tự phụ thuộc: A → B → C → D → E → F. A, B, D, E, F tự merge khi CI xanh (B có migration chỉ thêm theo Q-MRG2). **C dừng chờ bạn kiểm chéo** (hạn mức = đếm tiền gói; dừng khẩn cấp). Mỗi lát báo cáo ≤ 10 dòng.

## Tiêu chí nghiệm thu (cho cả việc)

1. Ô Thử AI và worker cùng gọi MỘT hàm `runPipeline`; toàn bộ test ô Thử AI hiện có vẫn xanh — kiểm bằng: bộ test `try-pipeline`/web `try-ai` không đổi kết quả.
2. Đúng thứ tự docs/09 §4 và cổng chặn đứng TRƯỚC `extract` — kiểm bằng: test thứ tự gọi (mock đếm số lần gọi `extract`).
3. Dừng khẩn cấp hoặc hết hạn mức → không gọi LLM, bình luận `needs_human`, bản nháp ghi lý do — kiểm bằng: test C.
4. Mỗi bình luận trừ đúng 1 lượt dù job thử lại hoặc chạy đồng thời — kiểm bằng: test tích hợp C.
5. Đọc từ DB đủ: `clarifyCount`/`repeatCount`, người đang giữ, cờ mạo danh/giá lệch/tồn cũ, `kb_version` ĐÃ xuất bản (bản nháp chưa xuất bản không bao giờ lọt vào luồng thật) — kiểm bằng: test tích hợp B.
6. Ghi đủ `drafts`, `ai_usage`, `retrieval_logs`, `kb_gaps` trong một giao dịch, idempotent theo bình luận (chạy hai lần chỉ một bản nháp) — kiểm bằng: test tích hợp D.
7. Lỗi AI → "Cần nhân viên", không ném vô hạn, không mất bình luận — kiểm bằng: test D.
8. Gộp bình luận liên tiếp (cùng khách, cùng bài, trong cửa sổ) thành một lượt, trả lời gắn vào bình luận cuối — kiểm bằng: test E.
9. Đường vàng bằng mock: webhook fixture → ingest → pipeline → drafts → gợi ý hiện trong chi tiết bình luận — kiểm bằng: test tích hợp + Playwright F.
10. KHÔNG có đường gửi: không file nào của việc này gọi `send`/`decideAutoSend`/`sendRecheck` — kiểm bằng: test quét import (mẫu như `try-pipeline.test.ts` "không có import usage-meter") + đọc diff.
11. Cờ `PIPELINE_ENABLED` mặc định tắt: tắt thì ingest không xếp job — kiểm bằng: test E.
12. `pnpm precheck` xanh mỗi lát; gói `ai` giữ coverage 100% lines/functions.

## File sẽ đọc (≤ ~8 mỗi lát, kèm lý do)

`packages/ai/src/try/try-pipeline.ts` (lõi), `packages/ai/src/decide/turn-risks.ts`, `apps/worker/src/jobs/{run-job,ingest}.ts` + `queue/definitions.ts` + `main.ts` (mẫu job), `packages/db/src/queries/{drafts,comments…}.ts`, `packages/saas-core/src/billing/usage-meter.ts`, `packages/shared/src/retrieval-log.ts`, `apps/web/src/components/comments/comment-detail.tsx` + `lib/suggestion.ts`.

## File sẽ sửa / tạo

Lát A: `ai/src/try/try-pipeline.ts` (tách `runPipeline`), test, `apps/web/src/server/try-ai.ts` (gọi hàm mới). Lát B: `db/src/queries/pipeline-context.ts` (mới), migration `0072_automation_settings_pipeline.sql` + journal + schema. Lát C: `ai/src/pipeline/gates.ts` (mới), `worker` nối `consume`/`emergency_stopped_at`. Lát D: `db/src/queries/{retrieval-logs,kb-gaps}.ts` (mới), `apps/worker/src/jobs/pipeline-persist.ts` (mới), bộ chuyển `LlmClient`↔`withJob`. Lát E: `shared` (schema job `pipeline`), `worker/src/queue/definitions.ts`, `jobs/pipeline.ts` (mới), `jobs/ingest.ts` (xếp job), `config.ts`/`main.ts` (cờ). Lát F: `comment-detail.tsx`, `lib/suggestion.ts`, test tích hợp + `e2e/tests/…`. Tài liệu mỗi lát: Q-…, codemap, gap-matrix, handoff.

## Migration

Chỉ lát B: `0072` thêm 2 cột có mặc định vào `automation_settings` (+ quyền cột). Chỉ THÊM, có đường lùi (DROP COLUMN), RLS không đổi → tự merge theo Q-MRG2. Không migration ở lát còn lại (bảng `drafts`, `retrieval_logs`, `kb_gaps` đã có).

## Test viết trước

Từng lát viết test đỏ trước (đặc biệt C: logic hạn mức/dừng khẩn cấp theo quy tắc "logic quy tắc viết test trước"): thứ tự gọi, cổng chặn, idempotent trừ lượt, lỗi AI, gộp bình luận, ghi một giao dịch, cờ tắt, không import đường gửi.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run --coverage` · `pnpm --filter @flow/worker exec vitest run src/jobs` · `pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts` (DB thật `cf_test`) · `pnpm --filter @flow/web exec vitest run src` · `pnpm precheck`

## Cần kiểm chứng độc lập không?

**Có, riêng lát C** (đếm lượt gói và dừng khẩn cấp thuộc diện thanh toán/an toàn): tự kiểm theo `verify.md`, gắn nhãn "tự kiểm, chưa có kiểm chứng độc lập", **không tự merge**, chờ bạn/Codex kiểm chéo. Lát còn lại: diff thường, tự kiểm theo `verify.md` §A khi chạm ghi DB; lát nào có migration chỉ thêm tự merge theo Q-MRG2.

## Rủi ro / câu hỏi cho chủ dự án

- **Cần bạn quyết định (một câu):** đồng ý bật `PIPELINE_ENABLED` trên dev sau lát E để thử với webhook giả — có chi phí LLM thật (nhỏ, trần 10 USD/30 ngày)? Mặc định tôi để TẮT, chỉ bật khi bạn nói.
- Hạn mức hiện lấy từ `resolveAiTurnLimit` (env, Q-UMU1) vì gói cước thật chưa nối vào pipeline; lát C dùng đúng hàm đó, khi gói thật nối thì đổi một chỗ.
- Cache (exact/semantic) chưa nối ở GĐ2 (Redis thật chưa có) — mỗi bình luận đều đi đủ chuỗi; ghi nhận là việc sau.
- `sendRecheck` R5 + `price_snapshot` cho ngoại tệ, đường gửi, cổng tự gửi: ngoài phạm vi, chờ bạn.
- Job E2E của CI có thể chưa chạy worker: đường vàng chính chạy bằng test tích hợp; thêm worker vào E2E là việc riêng nếu bạn muốn.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Thêm một lớp `ports` cho hàm dùng chung (đi ngược "không trừu tượng hóa sớm") — được phép vì có ĐÚNG hai nơi gọi thật ngay từ đầu (ô Thử AI và worker), đúng điều kiện ngoại lệ của AGENTS.md.
