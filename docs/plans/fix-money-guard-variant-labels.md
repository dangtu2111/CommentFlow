# Kế hoạch `fix/money-guard-variant-labels` — số trong nhãn biến thể không bị tính là "sai giá"

## Việc

Mã gap matrix: `FACT-SLOTS` (hồi quy mẫu en-15 của EVAL sswiftly). Lệnh chủ dự án 11/11/2026, bước 4.

**Tóm tắt (2–3 câu dễ hiểu):** Khi AI hỏi khách chọn biến thể và liệt kê mã như "WMT8050PAPER", guard tiền (kiểm số tiền bằng code) thấy số 8050 không có trong đoạn nguồn nên báo "sai giá" dù đó chỉ là mã biến thể đọc từ bảng sản phẩm. Sửa: khi guard báo vi phạm và đã nhận diện được sản phẩm, đọc nhãn biến thể của sản phẩm đó từ `product_variants` và coi là nguồn hợp lệ rồi kiểm lại. Rủi ro: chạm guard tiền (nhạy cảm) — chỉ nới đúng chuỗi nhãn của sản phẩm đã nhận diện, không nới giá; số khác trong câu vẫn bị chặn. Bộ đếm "Sai giá" của EVAL lấy từ chính kết quả guard nên tự khớp.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. Câu liệt kê nhãn biến thể của sản phẩm đã nhận diện (mẫu en-15) → `guard.violations` rỗng.
2. Số không thuộc nhãn nào (vd. "8051") vẫn bị báo — kiểm bằng `packages/ai/src/pipeline/guard-variant-labels.test.ts`.
3. Không thêm truy vấn ở đường thường (chỉ tra khi guard đã báo vi phạm).

## File sẽ đọc / sửa

Sửa: `packages/ai/src/pipeline/run-pipeline.ts`. Thêm: `guard-variant-labels.test.ts`, file quyết định.

## Migration

Không.

## Test viết trước

Có (test đỏ khi bỏ bản sửa).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/pipeline`.

## Cần kiểm chứng độc lập không?

Có: chạm guard tiền → tự kiểm theo `docs/workflows/verify.md`, KHÔNG tự merge, chủ dự án kiểm chéo.

## Rủi ro / câu hỏi cho chủ dự án

Cổng kiểm lại ngay trước khi gửi (`auto-send-gate.ts`, `sendRecheck`) vẫn dùng nguồn cũ; câu có mã biến thể có thể bị chặn tự gửi ở đó (an toàn, chỉ chuyển sang duyệt tay). Không đổi trong PR này.
