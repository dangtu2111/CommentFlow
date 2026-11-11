# Kế hoạch `fix/secondary-complaint-needs-human` — Câu đổi trả thường có nhãn phụ "khiếu nại" phải qua người duyệt

## Việc

Mã gap matrix: không (M1 trong lệnh tổng 10/11/2026 của chủ dự án).

**Tóm tắt (2–3 câu dễ hiểu):** Khi khách hỏi đổi trả thông thường nhưng bình luận có dấu hiệu phàn nàn (nhãn phụ "complaint"), hệ thống bỏ nhãn đó để vẫn trả lời từ chính sách. Nay câu trả lời loại này bắt buộc có người duyệt và không bao giờ tự gửi (`needsHuman`, `autoSendPolicy = never`), kèm lý do `secondary_complaint_waived`. Rủi ro: chạm cổng tự gửi nên là diff nhạy cảm; thay đổi chỉ làm chặt hơn.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Có nhãn phụ complaint + đổi trả thường → `answer`, `needsHuman = true`, `autoSendPolicy = 'never'`, `riskReasons.review = ['secondary_complaint_waived']`, cả cờ `fact_slots` bật và tắt — kiểm bằng: `packages/ai/src/pipeline/fact-plan-no-flag.test.ts`.
2. Không có nhãn phụ complaint → `needsHuman = false`, không có `review` — cùng file test.
3. Ca bảo hành đúng phạm vi (vi-12) vẫn chỉ ghi `defect_warranty_scope`, không ghi trùng — cùng file test.
4. Tự kiểm theo `verify.md` (nhãn "tự kiểm"): chỉ thêm điều kiện chặt hơn, không đổi đường tự gửi khác.

## File sẽ đọc

`packages/ai/src/pipeline/run-pipeline.ts` (dòng ~686–735, ~1040), `fact-plan-no-flag.test.ts`, `docs/plans/quyet-dinh/q-adr017-label-secondary.md`.

## File sẽ sửa / tạo

Sửa: `run-pipeline.ts`, `fact-plan-no-flag.test.ts`, `q-adr017-label-secondary.md`. Tạo: plan này.

## Migration

Không.

## Test viết trước

Có: test đỏ trước khi sửa mã (đã chạy, 2 test đỏ), rồi xanh.

## Lệnh test phạm vi hẹp

`cd packages/ai && npx vitest run src/pipeline`

## Cần kiểm chứng độc lập không?

Có (chạm `autoSendPolicy`): tự kiểm, chưa có kiểm chứng độc lập; chủ dự án kiểm chéo, không tự merge.

## Rủi ro / câu hỏi cho chủ dự án

Nhánh tách từ `feat/plan-khong-phu-thuoc-co` (#312 chưa vào main); khi #312 merge thì merge main vào nhánh này.

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
