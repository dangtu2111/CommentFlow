# Handoff `feat-kb-samples` (KB-SAMPLES, FR-132) — claude (làn d)

## Đã làm
- `packages/ai/src/examples/`: `example-template.ts` (che PII, placeholder giá/tồn, điền lại), `example-store.ts` (interface + kho bộ nhớ), `answer-examples.ts` (capture/pick/setStatus). Test cùng thư mục (22 ca, có property). Ngưỡng 95% nhánh cho `src/examples/*.ts`.
- Quyết định: Q-KSM1 (`QUYET_DINH_CHO_DUYET.md`). Plan: `docs/plans/feat-kb-samples.md`.

## Đã đọc + rút ra
- `extractClaims` (guard-money.ts) trả `index/raw` trên văn bản NFKC; khoảng giá cho 2 claim cùng `index`. `maskPii` chỉ che di động VN + email → tổng đài/link phải từ chối.
- `maskAndCapture` KHÔNG dùng (sẽ lưu SĐT của shop thành Khách tiềm năng).

## Còn lại
- `KB-SAMPLES-PERSIST` (gap matrix): bảng `kb_answer_examples` + RLS Owner (làn b), `ExampleStore` DB, embedding, nối vào luồng gửi và bước soạn, API `/kb/examples`, UI Owner.
