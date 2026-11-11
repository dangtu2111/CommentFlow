# Kế hoạch `feat/guard-facts-t2-t4` — guard theo chủ đề (T2) + gọi lại khi nháp rỗng có nguồn (T4)

## Việc

Mã gap matrix: `FACT-SLOTS` · ADR 018 bước 2, lệnh tổng 10/11/2026 (M4), xếp chồng trên #318.

**Tóm tắt (2–3 câu dễ hiểu):** Hai cải tiến cho lớp kiểm tra câu AI, bật bằng cờ riêng `cf.ai.guard_facts` (mặc định TẮT). (T2) Guard tiền/khái niệm kiểm số trên mọi đoạn tìm được CÙNG CHỦ ĐỀ câu hỏi, không chỉ đoạn bộ soạn khai — bớt từ chối oan; đồng thời đoạn `kb` thuộc chủ đề khác hẳn không còn là nguồn hợp lệ cho số. (T4) Nháp rỗng/xin người ở hành động `answer` mà có nguồn → gọi lại bộ soạn đúng 1 lần kèm mã lỗi `draft_empty_with_sources`; vẫn rỗng → câu dự phòng do code dựng từ thẻ, không có thẻ → chuyển người. Rủi ro: chạm guard (nhạy cảm) nên chỉ làm TẶNG nguồn hợp lệ và thêm đúng một lần gọi LLM (≤ 2 lần/lượt, FR-162); cờ TẮT y hệt cũ.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. Cờ TẮT: không gọi lại bộ soạn, không có `guardFacts` trong kết quả, guard dùng đúng nguồn cũ — `guard-facts.test.ts`.
2. T4: lần 1 rỗng + có đoạn cùng chủ đề (hoặc sự kiện bắt buộc) → đúng 2 lần gọi, lần 2 mang `retryCode`; vẫn rỗng → câu dự phòng từ thẻ / chuyển người; không bao giờ lần 3.
3. T2: số đúng ở đoạn cùng chủ đề (bộ soạn khai thiếu) không bị bắt; số chỉ ở đoạn chủ đề khác vẫn bị bắt kèm `number_not_in_topic`.
4. EVAL `out/fs-b2` (cờ bật bằng `--guard-facts`): demo 36/37, 31/32, 29/30, sự kiện 36/36; sswiftly 29/32, sự kiện 11/12; sai giá / reply_empty / FR-142 = 0; 0 lần chạy lỗi.

## File sẽ đọc / sửa

Sửa: `packages/ai/src/pipeline/run-pipeline.ts`, `draft/draft-prompt.ts`, `draft/drafter.ts`, `pipeline/index.ts`; `packages/shared/src/{flag-keys,index}.ts`; `apps/worker/src/{main,jobs/pipeline-job}.ts`; `tools/eval/src/{cli/run,runner,run-sample}.ts`. Thêm: `guard-facts.test.ts`.

## Migration

Không.

## Test viết trước

Có (kịch bản T2/T4 dựng bằng bộ soạn giả đếm số lần gọi).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/pipeline` · `pnpm --filter @flow/worker exec vitest run`.

## Cần kiểm chứng độc lập không?

Có — chạm guard/cổng tự gửi: tự kiểm theo `docs/workflows/verify.md` (nhãn "tự kiểm, chưa có kiểm chứng độc lập"), KHÔNG tự merge, chủ dự án kiểm chéo.

## Rủi ro / câu hỏi cho chủ dự án

Cờ chỉ bật cho `[EVAL]` qua `--guard-facts`; không bật cho shop thật (chờ UUID Shop Thử 2). T4 không áp dụng ở chế độ chỗ giữ chỗ (có luồng riêng).
