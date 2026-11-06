# Handoff `feat-da-order-in-comment` (claude, làn c)

## Đã làm
- `packages/ai/src/decide/order-comment-rules.ts`: `evaluateOrderInComment`, `handleOrderInComment` (lưu khách TRƯỚC bằng `maskAndCapture`), `checkOrderReplyLeak`, câu mẫu cố định `ORDER_RECEIVED_REPLIES` (FR-156, Q-DOC1); test + property-based; export ở `decide/index.ts`.
- Docs: plan, `q-doc1.md`, codemap fragment, `kt-doc.md`/`tt-doc.md`, gap-matrix (dòng DA-ORDER-IN-COMMENT), MASTER.

## Đã đọc và rút ra
- `maskAndCapture` đã lưu-trước-che-sau; `ContactSink` thật là `createLeadContactSink` (`packages/db/src/lead-sink.ts`); chỉ lưu SĐT/email, chưa lưu địa chỉ/sản phẩm/số lượng.
- `maskPii` chỉ che SĐT/email, chưa che địa chỉ → `maskedText` đi LLM vẫn có địa chỉ.
- FR-157 đã làm ở `DA-RULES-STOCK`.

## Còn lại
- `DA-ORDER-IN-COMMENT-WIRE`: nối pipeline, `ContactSink` thật, cờ `order_intent`, gửi câu mẫu qua cổng + `sendRecheck`, nút Ẩn do người bấm.
- `DA-ORDER-IN-COMMENT-DB` (làn b): cột/bảng cho địa chỉ/sản phẩm/số lượng của `cf.leads`.
- `PII-MASK-ADDRESS`: che địa chỉ trước LLM/Langfuse.
- Tinh chỉnh từ khóa/địa chỉ theo dữ liệu thật; chưa bắt SĐT đọc bằng chữ.
