# Kế hoạch `feat-ai-try-box-ui` — Ô Thử AI chạy cả pipeline (mock), không trừ lượt (FR-059, FR-029)

## Việc

Mã gap matrix: `AI-TRY-BOX-UI` · Spec: FR-059, FR-029, US-034, BR-03 (`docs/02`), `docs/09` §4/§6.

**Tóm tắt:** Thêm trang "Thử AI" (`/app/try-ai`): người dùng gõ một bình luận mẫu, hệ thống chạy cả chuỗi đã có — che PII → lọc quy tắc → chuẩn hóa/nhận ngôn ngữ → phân loại → định tuyến → tìm nguồn → `decideAction` → soạn → độ tin cậy → "có được tự gửi không, vì sao" — rồi hiện nhãn, câu trả lời, nguồn kèm điểm, và lý do. Toàn bộ dùng mock/fixture (không LLM/DB thật), **không gọi `usageMeter.consume`** nên không trừ lượt, có giới hạn lượt thử mỗi ngày. Rủi ro: nguồn kiến thức là bộ mẫu trong bộ nhớ, chưa đọc KB thật của workspace (cần nối `KB-SEARCH-FTS`/LLM thật sau).

## Điểm chưa rõ

Không có. Tự quyết ở `QUYET_DINH_CHO_DUYET.md` (Q-ATB1).

## Tiêu chí nghiệm thu

1. `runTryPipeline` chạy đủ các bước theo thứ tự và trả `{label, route, action, reply, sources[score], confidence, autoSend{allowed, reasons[]}, billed:false}` — `try-pipeline.test.ts` (FR-059, FR-029).
2. Bình luận chỉ emoji/tag → `skipped` (không gọi extractor/drafter) — test.
3. PII trong bình luận được che trước khi vào extractor/drafter — test (nguyên tắc #6).
4. Không nguồn đạt ngưỡng → không tự gửi, lý do `no_source`; khiếu nại → handoff; số tiền lạ trong câu soạn → `guard_money` chặn tự gửi — test.
5. `decideAutoSendPreview` mỗi nhánh một test (policy `never`, chuyển người, độ tin cậy < ngưỡng 0,85, guard, tự gửi tắt, được phép) — test.
6. Giới hạn lượt thử/ngày: quá → `limit_reached`, không chạy pipeline — test; không có lệnh gọi `consume` (không import usage-meter) — test quét import.
7. Trang `/app/try-ai` qua `requireAppUser` (quét `require-app-user.scan.test.ts`), chuỗi i18n vi+en khớp khóa, `pnpm lint:i18n` xanh.

## File sẽ đọc (đã đọc)

`packages/ai/src/{index,draft/*,classify/*,confidence/*,decide/decide-action,route/*,normalize/normalize-lang}.ts`, `packages/shared/src/rule-filter.ts`, `settings/{page,actions}.tsx`, `reply-language-card.tsx`, `app-nav.ts`, `docs/09` §6.

## File sẽ sửa / tạo

- tạo `packages/ai/src/try/try-pipeline.ts`, `auto-send-preview.ts`, `demo-knowledge.ts` (+ test), `try-quota.ts` (+ test); sửa `packages/ai/src/index.ts`.
- tạo `apps/web/src/server/try-ai.ts` (+ test: dựng mock, giới hạn/ngày), `app/app/(guarded)/try-ai/{page.tsx,actions.ts}`, `components/try-ai/try-ai-form.tsx`, `try-ai-result.tsx`; sửa `lib/app-nav.ts` (+ test), `vi.json`/`en.json`.
- docs: `codemap`, `gap-matrix`, `MASTER`, `QUYET_DINH_CHO_DUYET`, `KIEM_TRA_TAY`, `CAN_BAN_CUNG_CAP`, `docs/handoff/feat-ai-try-box-ui.md`.

## Migration

Không có (chỉ làn b). `retrieval_logs`/`ai_usage` cho lượt thử không ghi (mock không gọi LLM thật) → gap `TRY-AI-REAL`.

## Test viết trước

Cổng tự gửi (preview), giới hạn/ngày, thứ tự pipeline: test đỏ trước.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/try` · `pnpm --filter @flow/web exec vitest run src/server/try-ai.test.ts src/lib/app-nav.test.ts` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Không — không chạm auth/RLS/gửi thật; `decideAutoSendPreview` chỉ hiển thị, không là cổng thật (cổng thật là `AUTO-SEND-GATE`).

## Rủi ro / câu hỏi cho chủ dự án

Bộ đếm lượt thử/ngày nằm trong bộ nhớ tiến trình (mất khi khởi động lại, mỗi instance một bộ) — chấp nhận ở mock.

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

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR hoặc ghi Q-ATB1).
