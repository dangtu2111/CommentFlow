# Kế hoạch `chore/eval-diagnostics` — Chẩn đoán nguồn/claim/vi phạm tiền trong bản ghi EVAL

## Việc

Mã gap matrix: `EVAL-RELIABILITY` (công cụ đo) · liên quan ADR 017.

**Tóm tắt:** Bản ghi EVAL chưa cho biết bộ soạn đã dùng nguồn nào, từng ý (claim) trỏ nguồn nào và guard tiền báo giá trị nào, nên khó phân loại lỗi kiểu `mixed-11`. Việc này thêm trường tùy chọn `diagnostics` vào bản ghi. Chỉ đổi công cụ đo (`tools/eval`), không đổi pipeline production; rủi ro thấp.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Bản ghi `ok: true` có `diagnostics.usedSources/claims/moneyViolations`; bản ghi cũ không có trường này vẫn hợp lệ (trường tùy chọn) — kiểm bằng: `pnpm --filter @flow/eval exec vitest run` và `tsc --noEmit`.
2. Phát lại `mixed-11` 24 lần cho thấy trường điền đúng (dùng để phân loại ở ADR 017) — kiểm bằng: `tools/eval/out/m11` (không commit).

## File sẽ đọc (≤ ~8, kèm lý do)

`tools/eval/src/run-sample.ts` (dựng bản ghi).

## File sẽ sửa / tạo

`tools/eval/src/run-sample.ts`; `docs/plans/ui-thieu-thiet-ke.md` (ghi màn thiếu thiết kế cho DRAFT-FACT-SLOTS).

## Migration

Không có.

## Test viết trước

Không có logic quy tắc mới (chỉ ghi thêm trường chẩn đoán); kiểu và test hiện có bảo đảm tương thích.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/eval exec vitest run && pnpm --filter @flow/eval exec tsc --noEmit`

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Không có. Trường `diagnostics` chứa văn bản nguồn của shop mẫu (fixture), không dữ liệu khách thật.

## Đề xuất thay đổi

Không có.

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

Đã duyệt (chủ dự án yêu cầu 08/11/2026: commit phần chẩn đoán EVAL lên nhánh riêng và mở PR).
