# Kế hoạch `feat/pipe-orchestrator-e` — PIPE-ORCHESTRATOR lát E (job `pipeline`, gộp bình luận, job quét)

**Trạng thái duyệt:** Đã duyệt (lát E của `docs/plans/feat-pipe-orchestrator.md`, chủ dự án duyệt 07/11/2026; chỉ đạo thêm: nguồn kiến thức dùng chung web/worker, Q-POR10, Q-POR11, Q-POR12). Có migration 0074 (chỉ thêm một hàm đọc) nên **chờ chủ dự án kiểm chéo trước khi merge**.

## Việc

Mã gap matrix: `PIPE-ORCHESTRATOR` (lát E) · Spec: `docs/09` §4, §9; FR-011, FR-021–024, FR-148; Q-POR1/2/3/5/6/7/10.

**Tóm tắt:** Dựng job `pipeline` ở worker xử lý MỘT bình luận thật bằng đúng chuỗi của ô Thử AI: nguồn kiến thức và dựng LLM là các hàm DÙNG CHUNG với web (chỉ khác giao dịch và phiên bản KB đã xuất bản); gộp bình luận cùng khách + bài thành một lượt; `ingest` xếp job sau khi lưu bình luận; job quét 5 phút nhặt lại bình luận kẹt, bỏ qua backfill và workspace đang dừng khẩn cấp. Cờ `PIPELINE_ENABLED` mặc định TẮT. Chưa có đường gửi.

## Điểm chưa rõ

Không có. (Ngữ cảnh hội thoại → lát E2, Q-POR12; nút "Soạn gợi ý" + bản nháp mới thủ công → lát F, Q-POR8/Q-POR11.)

## Tiêu chí nghiệm thu

1. Web và worker cùng gọi `loadWorkspaceKnowledge`; cùng câu hỏi + cùng phiên bản KB → cùng nguồn, cùng điểm; chỉ đọc phiên bản đã xuất bản (đoạn nháp không bao giờ lọt) — kiểm bằng: `workspace-knowledge.int.test.ts`.
2. Dựng LLM dùng chung (`createLlmDepsFromEnv`); `ai_usage` ghi qua `withJob` dưới ngữ cảnh worker — kiểm bằng: `pipeline-job.int.test.ts`.
3. `extendPipelineTurnLease`/`releasePipelineTurn` chỉ tác động với token thuê đúng (`attempts`); job mất thuê dừng, không ghi — kiểm bằng: `pipeline-run.int.test.ts` (Q-POR10).
4. Handler `pipeline`: đường vàng ghi bản nháp + nhật ký tìm kiếm từ KB đã xuất bản, trừ đúng 1 lượt; đường tự động tôn trọng `shouldAutoRunPipeline` (backfill/cờ tắt/ngoài danh sách → không chạy, không trừ); thủ công chạy được backfill; PII không lọt cột nào — kiểm bằng: `pipeline-job.int.test.ts`.
5. Gộp: 3 bình luận cùng khách + bài sát nhau → 1 bản nháp ở bình luận cuối, 1 lượt, các bình luận trước `merged_into_id`; khác khách/backfill không gộp — kiểm bằng: cùng file.
6. `ingest` xếp job `auto` (startAfter = cửa sổ gộp) chỉ khi `shouldAutoRunPipeline`; chạy lại không xếp thêm; xếp lỗi không làm hỏng ingest — kiểm bằng: `ingest.int.test.ts`.
7. Job quét: 50 bình luận backfill → sau 2 vòng 0 job, 0 lượt; dừng khẩn cấp → bình luận giữ `new`, 0 job, bỏ dừng → xếp; `processing` hết thuê → xếp lại; bình luận của Page/đã xóa/đã gộp không xếp — kiểm bằng: `pipeline-sweep.int.test.ts`.
8. Cấu hình: `PIPELINE_ENABLED` mặc định tắt, chỉ đúng chữ `true`; danh sách workspace chỉ giữ UUID; thiếu LLM thì không chạy — kiểm bằng: `config.test.ts`.
9. Migration 0074: chỉ thêm hàm DEFINER chỉ đọc (id + nguồn), chỉ `cf_worker` gọi được — kiểm bằng: `pnpm db:check-rls`, `pnpm check:migrations`, test quét.
10. `pnpm precheck` xanh; DB/worker tích hợp xanh.

## File sẽ đọc / sửa

Đọc: `try-ai-knowledge.ts`, `try-ai-llm.ts`, `try-ai.ts`, `ingest.ts`, `main.ts`, `config.ts`, `0031_stuck_outbox_sweep.sql` (mẫu). Sửa/tạo: `packages/ai/src/try/{workspace-knowledge,llm-deps}.ts`, web `try-ai-knowledge.ts`/`try-ai-llm.ts` (chỉ gọi hàm chung), `packages/shared/src/{pipeline-auto-run,queues}.ts`, `packages/db/src/queries/{pipeline-merge,pipeline-persist,pipeline-turns}.ts`, migration `0074`, `apps/worker/src/jobs/{pipeline-job,pipeline-sweep,pipeline-run,ingest}.ts`, `config.ts`, `main.ts`, `queue/definitions.ts`, `env.example`; tài liệu: Q-POR10/11/12, codemap, gap-matrix, handoff.

## Migration

`0074_pending_pipeline_sweep.sql`: chỉ THÊM hàm `cf.list_pending_pipeline_comments` (DEFINER, STABLE, chỉ đọc, chỉ ngữ cảnh trần của `cf_worker`, trả id + nguồn). Không đổi bảng, không nới RLS. Đường lùi: `DROP FUNCTION cf.list_pending_pipeline_comments(integer, integer, uuid[], integer);`. Hàm đọc xuyên workspace nên **vẫn chờ kiểm chéo**.

## Cần kiểm chứng độc lập không?

**Có — chủ dự án kiểm chéo** (hàm DEFINER xuyên workspace, đường bỏ qua dừng khẩn cấp, cờ tự chạy). Tự kiểm theo `verify.md` §A + §B ghi ở handoff, nhãn "tự kiểm, chưa có kiểm chứng độc lập".

## Rủi ro / câu hỏi cho chủ dự án

Thay "cuối mỗi job kiểm bình luận còn chờ" bằng `startAfter` theo từng bình luận + job quét (mỗi bình luận luôn có job của chính nó, không dựa singletonKey). E2E Playwright chưa chạy worker (việc riêng).

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào.
