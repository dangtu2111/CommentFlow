# Kế hoạch `feat/try-ai-brand-voice` — `brand_voice` thật trong ô Thử AI (Bước 2 lõi AI)

**Trạng thái duyệt:** Đã duyệt (chủ dự án chốt 07/11/2026: "Tiếp theo brand_voice → metafield Shopify → PIPE-ORCHESTRATOR + drafts. Làm liên tục").

## Việc

Mã gap matrix: `TRY-AI-BRAND-VOICE` (mới) · Spec: FR-142 (xưng hô), `docs/10` (`brand_voice`), `docs/09` §4.

**Tóm tắt:** Ô Thử AI đang dùng giọng văn mẫu cố định ("shop"/"bạn", không quy tắc). Nhánh này đọc `brand_voice` thật của workspace (một dòng/ngôn ngữ) và dùng giọng đúng ngôn ngữ khách viết cho cả bước soạn lẫn bộ chặn xưng hô; thiếu giọng cho ngôn ngữ đó thì quay về giọng mẫu. Rủi ro thấp: chỉ đọc dữ liệu của chính workspace, không migration.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Dòng `brand_voice` → `DraftVoice` (tone/greeting/signOff/do/dont/xưng hô); xưng hô hay cách gọi không hợp lệ cho ngôn ngữ → bỏ dòng, không đoán; quy tắc rỗng bị lọc, tối đa 20 — kiểm bằng: `brand-voice.test.ts`.
2. Pipeline chọn giọng theo ngôn ngữ nhận ra; thiếu → giọng mặc định; bộ soạn và bộ chặn xưng hô dùng CÙNG giọng — kiểm bằng: `try-pipeline.test.ts`.
3. Runner kiến thức nạp `voices` ở mức `shop`/`kb`, rỗng ở `demo` — kiểm bằng: `try-ai-knowledge.test.ts`.
4. Kết quả báo `voice: shop|demo` và giao diện hiển thị một dòng trạng thái (vi/en) — kiểm bằng: `try-ai.test.ts`, `pnpm lint:i18n`.
5. `pnpm precheck` xanh; gói `ai` giữ coverage 100% lines/functions.

## File sẽ đọc (≤ ~8, kèm lý do)

`apps/web/src/server/try-ai.ts`, `try-ai-knowledge.ts`, `packages/ai/src/try/try-pipeline.ts`, `draft/draft-prompt.ts` (`DraftVoice`), `packages/db/src/queries/kb-content.ts` (`listBrandVoices`), `shared/src/reply-style.ts` (`isValidAddress`).

## File sẽ sửa / tạo

`packages/ai/src/try/brand-voice.ts` (+test, mới), `try/try-pipeline.ts` (+test), `try/index.ts`; `apps/web/src/server/try-ai.ts`, `try-ai-knowledge.ts` (+test), `components/try-ai/try-ai-form.tsx`, `packages/shared/src/i18n/messages/{vi,en}.json`; tài liệu: `docs/gap-matrix.md`, `docs/codemap.d`, `docs/handoff`, Q-TBV1.

## Migration

Không có.

## Test viết trước

Mapper (hợp lệ/không hợp lệ/lọc), chọn giọng theo ngôn ngữ, bộ chặn dùng giọng đã chọn, runner nạp giọng, kết quả `voice`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run --coverage` · `pnpm --filter @flow/web exec vitest run src` · `pnpm lint:i18n` · `pnpm precheck`

## Cần kiểm chứng độc lập không?

Không: không chạm auth/RLS/cổng tự gửi/migration; đọc qua `withActor` sẵn có.

## Rủi ro / câu hỏi cho chủ dự án

Giọng thật chỉ nạp khi nguồn là `shop`/`kb` (workspace có dữ liệu thật); ở `demo` vẫn giọng mẫu.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào.
