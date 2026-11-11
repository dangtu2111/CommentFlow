# Kế hoạch `feat/guard-facts-t1` — khu vực không khớp thẻ ship: gọi lại rồi hỏi khu vực (T1)

## Việc

Mã gap matrix: `FACT-SLOTS` · ADR 018 bước 3, lệnh tổng 10/11/2026 (M5), xếp chồng trên M4 (#320).

**Tóm tắt (2–3 câu dễ hiểu):** Khi khách nêu một tỉnh/thành mà thẻ ship của shop không có dòng nào áp dụng (vd. thẻ chỉ có "nội thành Hà Nội 20.000đ", khách ở Nghệ An) mà AI vẫn nêu phí/thời gian giao, đó là áp sai khu vực. Với cờ `cf.ai.guard_facts` bật, hệ thống gọi lại bộ soạn 1 lần kèm mã `region_mismatch`; vẫn nêu số thì thay bằng câu HỎI khu vực do code viết (hành động `clarify`, FR-147). Thêm chỉ số EVAL "Sai khu vực" (mục tiêu 0). Rủi ro: chạm guard (nhạy cảm); không thêm quá 2 lần gọi LLM/lượt; cờ TẮT y hệt cũ.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. Fixture "khách ở tỉnh, thẻ chỉ có nội thành": cờ BẬT → gọi lại đúng 1 lần kèm `region_mismatch`; lần 2 không nêu số → dùng; vẫn nêu → câu hỏi khu vực do code viết, `clarify`, không gọi lần 3 — `guard-facts-region.test.ts`.
2. Cờ TẮT: giữ nguyên câu (hành vi cũ) nhưng `regionMismatch.numberInReply` đo được; khách đúng khu vực / không nêu nơi → không can thiệp.
3. EVAL: chỉ số "Sai khu vực" (`metrics.ts`) = 0; `out/fs-b3` (bật `--guard-facts`): cổng như fs-b2 (demo 36/37, 31/32, 29/30, sự kiện 36/36; sswiftly 29/32, 11/12; sai giá / reply_empty / FR-142 / sai khu vực = 0).

## File sẽ đọc / sửa

Sửa: `packages/ai/src/pipeline/run-pipeline.ts`, `fact-plan/{compose,index}.ts`, `draft/draft-prompt.ts`; `tools/eval/src/{metrics,multi-run,run-sample}.ts` + test. Thêm: `guard-facts-region.test.ts`.

## Migration

Không.

## Test viết trước

Có.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/pipeline` · `pnpm --filter @flow/eval exec vitest run`.

## Cần kiểm chứng độc lập không?

Có — chạm guard/cổng tự gửi: tự kiểm theo `docs/workflows/verify.md` ("tự kiểm, chưa có kiểm chứng độc lập"), KHÔNG tự merge.

## Rủi ro / câu hỏi cho chủ dự án

Khi khách đã nêu tỉnh mà vẫn bị hỏi lại khu vực: là hành vi ADR 018 mô tả (shop chưa có dòng ship cho nơi đó); Owner nên thêm dòng ship toàn quốc/vùng đó vào Chính sách để AI trả lời được.
