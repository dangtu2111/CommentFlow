# Handoff `feat-ai-try-box-ui` (claude, làn a)

## Đã làm
Ô Thử AI (FR-059, FR-029, US-034): `packages/ai/src/try/` (pipeline đầy đủ qua interface + mock, preview cổng tự gửi, hạn mức/ngày) và trang `/app/try-ai` (Owner) + i18n vi/en + menu. Xong-mock, không migration, không trừ lượt. Quyết định: Q-ATB1.

## Đã đọc và rút ra
- `decideAction` cần `topics[{topic,sourced}]`, `products{candidates,missingAxes}`; `assessDraft` cần `allowedSourceIds`; drafter LLM không gọi LLM khi `handoff`/không nguồn.
- `ruleFilter` ở `@flow/shared`; `maskPii` trả `MaskedText`; `@flow/ai` trước đây không là phụ thuộc của web (đã thêm + `transpilePackages`).
- Test quét `require-app-user.scan.test.ts` buộc mọi page/action trong `app/app/**` gọi `requireAppUser(`.

## Còn lại (`TRY-AI-REAL`)
Nối `TryKnowledge` vào `searchKbChunks`/`findActiveVariants` + `brand_voice` thật; `createLlmDrafter/Extractor` sau cờ (tắt mặc định); ghi `retrieval_logs`; bộ đếm lượt thử bền; `AUTO-SEND-GATE` thay preview; E2E vi+en.
