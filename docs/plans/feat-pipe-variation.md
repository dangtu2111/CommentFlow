# Kế hoạch `feat-pipe-variation` — Đa dạng cách diễn đạt, giữ nguyên nội dung (FR-161)

## Việc

Mã gap matrix: `PIPE-VARIATION` · Spec: FR-161, US-105 (`docs/04`/`05`), `docs/09` §4 (`draft`, `pickVariant`), `docs/10` (`drafts.variants`, Redis `…:recent`), NFR-C7.

**Tóm tắt:** Trong **một** lần gọi LLM soạn câu, AI trả thêm 2–4 cách diễn đạt khác của cùng nội dung (`variants[]`). Code kiểm từng biến thể: không được thêm/bớt số tiền, ngày, SĐT, link so với câu gốc và mọi số phải có trong nguồn (dùng `checkGuardMoney`); biến thể trùng chữ bị loại. Hàm `pickVariant` chọn biến thể chưa dùng gần đây dưới bài; hết biến thể → báo "chuyển Chờ duyệt". LLM dùng mock/fixture, không gọi dịch vụ thật. Rủi ro: lưu "đã dùng" vào Redis và ghi `drafts.variants` chưa làm ở đây (cần nối pipeline/migration của làn b).

## Điểm chưa rõ

Không có. Tự quyết ở `QUYET_DINH_CHO_DUYET.md` (Q-PV1).

## Tiêu chí nghiệm thu

1. Schema soạn nhận `variants` (mặc định `[]`, bỏ rỗng/khoảng trắng) — kiểm bằng `draft-result.test.ts`.
2. Biến thể đổi/thêm/bớt số tiền, %, ngày, SĐT, link so với câu gốc, hoặc có số không có trong nguồn → bị loại — kiểm bằng `variation.test.ts` (kể cả property-based).
3. Biến thể trùng chữ (bỏ hoa/thường, dấu câu, khoảng trắng) với câu gốc hoặc nhau → loại; tối đa 5 (gồm câu gốc); câu gốc luôn là biến thể đầu — kiểm bằng `variation.test.ts`.
4. `pickVariant` không trả biến thể có dấu vết trong tập "đã dùng"; hết → `null`; chọn xác định theo `random` tiêm vào — kiểm bằng `variation.test.ts`.
5. `createLlmDrafter` vẫn đúng MỘT lần `llm.call`, nhiệt độ 0,3, `prompt_version` `draft@2`, đầu ra có `variants` đã lọc; `needs_human` → `variants=[]` — kiểm bằng `drafter.test.ts`.
6. Prompt yêu cầu `variants` và chỉ giữ nội dung/số/link — kiểm bằng `draft-prompt.test.ts`.

## File sẽ đọc (đã đọc)

`packages/ai/src/draft/{draft-result,drafter,draft-prompt,fixture-drafter}.ts`, `guard-money.ts` (chữ ký), `index.ts`.

## File sẽ sửa / tạo

- tạo `packages/ai/src/variation/variation.ts` (+ `.test.ts`): `replyFingerprint`, `guardVariants`, `pickVariant`.
- sửa `draft/draft-result.ts` (trường `variants`), `draft/draft-prompt.ts` (hướng dẫn), `draft/drafter.ts` (nhiệt độ 0,3, `draft@2`, lọc biến thể), các test tương ứng, `index.ts`.
- docs: `codemap`, `gap-matrix`, `MASTER`, `QUYET_DINH_CHO_DUYET`, `KIEM_TRA_TAY` (KT-PV), `docs/handoff/feat-pipe-variation.md`, `docs/CAN_BAN_CUNG_CAP.md` §2f (dùng chung khóa LLM, không tài nguyên mới).

## Migration

Không có (chỉ làn b). Ghi `drafts.variants`/`chosen_variant` và Redis `cf:{ws}:post:{id}:recent` → gap `VARIATION-WIRE`.

## Test viết trước

Toàn bộ logic quy tắc (guard biến thể, loại trùng, chọn biến thể) viết test đỏ trước.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/variation src/draft` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Không — không chạm auth/RLS/cổng tự gửi/`sendRecheck`/che PII. (Dùng `checkGuardMoney` như hộp đen đã kiểm.)

## Rủi ro / câu hỏi cho chủ dự án

Chất lượng đa dạng thật chỉ đo được khi có khóa LLM (EVAL-RUNNER). Không có câu hỏi.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR hoặc ghi Q-PV1).
