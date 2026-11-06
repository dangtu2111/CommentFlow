# Handoff `feat-pii-mask-pipe` (claude, làn c)

## Đã làm
- `extractPii` (shared, chung regex với `maskPii`); `packages/ai/src/pii/mask-pipe.ts`: `maskAndCapture` (lưu liên hệ gốc qua `ContactSink` TRƯỚC khi trả bản che; lưu lỗi → vẫn trả bản che + `PII_CONTACT_SAVE_FAILED`), `maskForTrace` (Langfuse, che đệ quy), `fillOrderIntentPhone`.
- Test ví dụ + property (`fast-check`, seed cố định); `src/pii/*` ép ≥95% nhánh. Q-PMP1.

## Đã đọc và rút ra
- `maskPii` chỉ che di động VN + email; `extract-result.ts` bỏ `order_intent.phone` do LLM trả (luôn null) — nay kiểu `string | null`.

## Còn lại
- Nối vào pipeline (`PIPE-ROUTE…`): gọi `maskAndCapture` đầu pipeline, `fillOrderIntentPhone` sau extract, bọc `maskForTrace` quanh dữ liệu Langfuse.
- `ContactSink` thật ghi Khách tiềm năng — cần `LEADS-KANBAN` (bảng + migration làn b).
- `PII-MASK-EXT`: số máy bàn, tên, địa chỉ chưa che.
- Verifier-security: không chặn merge. Đã sửa: vòng tham chiếu/kiểu lạ ở maskForTrace, lookbehind email. Còn lại ghi ở gap PII-MASK-EXT.
