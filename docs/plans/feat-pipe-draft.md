# Kế hoạch `feat-pipe-draft` — Soạn trả lời bằng LLM (JSON + claims + prompt caching)

## Việc

Mã gap matrix: `PIPE-DRAFT` · Spec: FR-029, FR-138, FR-140, FR-142 (`docs/05`), `docs/09` §4 dòng `draft`, `docs/10` `drafts.claims`/`sources`.

**Tóm tắt:** Thêm vào `packages/ai` bước "soạn câu trả lời": nhận câu hỏi đã che PII + các đoạn nguồn (kiến thức, dòng sản phẩm…) + giọng văn/xưng hô của shop, gọi LLM MỘT lần, nhận JSON `{reply, lang, sources[], claims[], unanswered_topics[], needs_human, reason}` (Zod kiểm). Không có nguồn đạt ngưỡng → không gọi LLM, chuyển "Cần nhân viên". Mỗi ý `fact` phải trỏ tới nguồn đã đưa vào prompt, thiếu → `needs_human` "Thiếu nguồn". Prompt xếp ổn định từ ít đổi đến hay đổi và đánh dấu cache nhà cung cấp (prompt caching). LLM thật nằm sau interface `Drafter`, có bản fixture; cờ `DRAFT_LLM_ENABLED` mặc định TẮT. Rủi ro: chưa có khóa LLM → "Xong-mock"; PIPE-RETRIEVE chưa xong nên nguồn do người gọi truyền vào.

## Điểm chưa rõ

Không có. Tự quyết (Q-PD1 ở `QUYET_DINH_CHO_DUYET.md`): (a) nguồn là đầu vào (`DraftSource[]`), chưa nối retrieve (PIPE-RETRIEVE) hay `guard` đầy đủ (PIPE-GUARD-MONEY: số tiền/link/SĐT); chỉ kiểm nguồn của `claims` (FR-140) ở đây; (b) `variants[]` (FR-161) để PIPE-VARIATION; (c) đánh dấu cache bằng cờ `cache` trên `LlmMessage` → `llm-client` gửi khối `cache_control`; (d) đầu ra hỏng → `AppError LLM_UNAVAILABLE`, không gọi lại (NFR-C7); (e) ngưỡng liên quan mặc định 0.35 là tham số hàm, chưa hiệu chuẩn (chờ EVAL).

## Tiêu chí nghiệm thu

1. Schema đầu ra đúng FR-029/140: `reply`, `lang` (vi/en), `sources[]`, `claims[{text, source_ids[], kind}]` (fact/greeting/question_back/handoff), `unanswered_topics[]`, `needs_human`, `reason`; thiếu/sai kiểu → `LLM_UNAVAILABLE` — kiểm bằng: `draft-result.test.ts` (FR-029, FR-140).
2. Ý `fact` không có `source_ids`, hoặc trỏ id không thuộc nguồn đã đưa vào prompt → `needs_human=true`, lý do "Thiếu nguồn", `reply` rỗng; ý khác loại không cần nguồn — kiểm bằng: `draft-result.test.ts` (FR-140).
3. Không có nguồn đạt ngưỡng → KHÔNG gọi `llm.call`, trả `needs_human` — kiểm bằng: `drafter.test.ts` (FR-029).
4. Gọi đúng MỘT lần với step `draft`, `promptVersion`, văn bản `MaskedText`; nguồn nằm trong khối có thẻ id; xưng hô theo giọng văn (không đoán giới tính); thứ tự tin nhắn: hướng dẫn hệ thống → giọng văn/chính sách (`kb_version`) → nguồn + câu hỏi, hai khối đầu đánh dấu `cache` — kiểm bằng: `draft-prompt.test.ts`, `drafter.test.ts` (FR-138, FR-142).
5. `llm-client` gửi `cache_control: {type:'ephemeral'}` cho tin nhắn có `cache`, không đổi gì khi không có — kiểm bằng: `llm-client.test.ts` (FR-138, FR-034).
6. Cờ `DRAFT_LLM_ENABLED` mặc định tắt (chỉ `true` mới bật), model mặc định `mock-llm` — kiểm bằng: `draft-config.test.ts`.
7. Bản mock fixture không gọi mạng; không khớp → `needs_human` — kiểm bằng: `fixture-drafter.test.ts`.
8. Ngưỡng coverage `packages/ai` đạt; cổng chung xanh — kiểm bằng: `pnpm --filter @flow/ai test:coverage`, lint, lint:i18n, typecheck, depcruise, check:plans, test:trace.

## File sẽ đọc (≤ ~8, kèm lý do)

Đã đọc: `packages/ai/src/{index,llm-client,llm-client.test}.ts`, `classify/*` (mẫu), `packages/shared/src/reply-style.ts` (xưng hô), `docs/05` FR-029/138/140/142, `docs/09` §4, `docs/10` drafts, `env.example`, `CAN_BAN_CUNG_CAP.md`, `KIEM_TRA_TAY.md`.

## File sẽ sửa / tạo

- Tạo `packages/ai/src/draft/{draft-result,draft-prompt,drafter,draft-config,fixture-drafter}.ts` + `.test.ts` tương ứng.
- Sửa `packages/ai/src/llm-client.ts` (+ test): cờ `cache` trên `LlmMessage`; `index.ts` (xuất); `env.example`; `docs/CAN_BAN_CUNG_CAP.md`; `docs/testing/KIEM_TRA_TAY.md` (KT-031); `docs/plans/{MASTER,QUYET_DINH_CHO_DUYET}.md`; `docs/gap-matrix.md`; `docs/codemap.md`; `docs/handoff/feat-pipe-draft.md`.

## Migration

Không có (lưu `drafts.claims`/`sources` thuộc việc nối pipeline; cột đã có theo `docs/10`).

## Test viết trước

Mọi test ở mục File tạo viết trước, chạy thấy đỏ (module chưa có) rồi mới viết mã (kiểm nguồn của claims, ngưỡng không gọi LLM, thứ tự prompt).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/draft src/llm-client.test.ts` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Không — chưa nối cổng tự gửi/`sendRecheck`/RLS; PII chỉ qua kiểu `MaskedText`.

## Rủi ro / câu hỏi cho chủ dự án

Cần khóa LLM trả phí + model soạn để bật thật (mục 2f `CAN_BAN_CUNG_CAP.md`). Chưa đo chất lượng; tỉ lệ cache ≥ 50% (NFR-C6) chỉ đo được khi chạy thật.

## Đề xuất thay đổi

Không đổi `docs/01–16`.

## Complexity tracking

Không có (interface `Drafter` có 2 cài đặt: LLM + fixture; không thêm thư viện).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec + Q-PD1).
