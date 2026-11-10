# Kế hoạch `feat/kb-distill-m3-2` — M3-2: chắt lọc kiến thức thô + tab "Chờ duyệt"

## Việc

Mã gap matrix: `KB-DISTILL` · ADR 018, lệnh tổng 10/11/2026 (M3 giai đoạn 4–5), chồng lên M3-1 (#317) và migration (#316). Kế hoạch tổng: `docs/plans/feat-kb-distill.md`.

**Tóm tắt (2–3 câu dễ hiểu):** Sau mỗi lần đồng bộ kiến thức, nếu Owner bật cờ `cf.ai.distill`, máy đọc từng đoạn thô (mô tả, chính sách, ghi chú sản phẩm) MỘT lần mỗi bản nội dung và đề xuất câu hỏi–đáp kèm câu trích nguyên văn làm bằng chứng. Code kiểm cứng từng gợi ý (trích đúng nguyên văn, mọi chữ số có trong trích dẫn, không có số tiền) rồi lưu ở trạng thái nháp; Owner duyệt ở tab "Chờ duyệt" thì mới vào kiến thức. Rủi ro: tốn tiền LLM (trần 0,20 USD/workspace/lần chạy) và gợi ý sai (chặn bằng kiểm cứng + duyệt tay + trigger DB không cho hệ thống tự duyệt).

## Điểm chưa chốt

Không có. Đã tự chọn (ghi `q-kb-distill-m3-2.md`): model dùng `DISTILL_LLM_MODEL`, chưa đặt thì `DRAFT_LLM_MODEL`; `policy_field` KHÔNG làm ở PR này (chỉ `faq`/`product_attr`); chắt lọc chạy trong handler kb-sync SAU khi giao dịch đồng bộ chốt (không thêm hàng đợi mới, không cần cài lại queue).

## Tiêu chí nghiệm thu

1. Kiểm cứng: trích dẫn không nguyên văn, chữ số lạ, số tiền, chỗ giữ chỗ → bị loại và đếm — kiểm bằng `packages/ai/src/kb-distill/kb-distill.test.ts`.
2. Mỗi đoạn tối đa một lần gọi LLM mỗi `content_hash`; trần chi phí dừng bước; đầu ra hỏng không đánh dấu; PII che trước khi gửi — cùng file test.
3. Nháp không vào danh sách/đếm/độ sẵn sàng/AI thử; Owner duyệt/từ chối; staff không duyệt được; job hệ thống bị trigger chặn — kiểm bằng `packages/db/tests/kb-distill.int.test.ts`, `kb-faq-published-only.int.test.ts`.
4. Worker: cờ tắt/thiếu cấu hình → không gọi; LLM lỗi không làm hỏng đồng bộ — `apps/worker/src/jobs/kb-distill.test.ts`.
5. Web: duyệt → xếp đồng bộ; từ chối không xếp; id lạ → not_found — `apps/web/src/server/distill-drafts.test.ts`.

## File sẽ đọc / sửa

Tạo: `packages/ai/src/kb-distill/*`, `packages/db/src/queries/kb-distill.ts`, `apps/worker/src/jobs/kb-distill.ts`, `apps/worker/src/cli/kb-distill.ts`, `apps/web/src/server/distill-drafts.ts`, `components/kb-gaps/draft-faq-row.tsx`. Sửa: `kb-sync.ts` (worker), `main.ts`, `flag-keys.ts`, trang/ actions `kb-gaps`, i18n vi/en, `env.example`.

## Migration

Không (dùng cột/trigger của 0084 ở #316).

## Test viết trước

Có (lõi kiểm cứng/trần chi phí/một lần mỗi bản nội dung theo test đơn vị với LLM giả cắm qua tham số).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/kb-distill` · `pnpm --filter @flow/db test:db` (hai file int) · `pnpm --filter @flow/worker exec vitest run src/jobs/kb-distill.test.ts` · `pnpm --filter @flow/web exec vitest run src/server/distill-drafts.test.ts`.

## Cần kiểm chứng độc lập không?

Không chạm cổng tự gửi/guard/RLS/PII mới (che PII dùng `maskPii` sẵn có; quyền duyệt dựa trigger đã nằm ở #316).

## Rủi ro / câu hỏi cho chủ dự án

Chi phí LLM mỗi lần đồng bộ khi cờ bật; cờ mặc định TẮT, chỉ bật cho `[EVAL]` để đo (không bật shop thật).

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
