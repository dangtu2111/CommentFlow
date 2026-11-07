# Kế hoạch `chore/eval-q-ev2-decisions` — ghi quyết định Q-EV2-1…8, sửa đáp án, cập nhật FR-160/docs 14

**Trạng thái duyệt:** Đã duyệt (chủ dự án chốt Q-EV2-1…7 và thứ tự sửa (a), 08/11/2026).

## Việc

**Tóm tắt:** Ghi quyết định đã chốt vào `QUYET_DINH_CHO_DUYET.md` (thay phương án đã chọn), cập nhật docs/05 FR-160 (thêm nhóm tuyên bố quy định/y tế/an toàn; đổi trả không là nguồn hoàn tiền) và docs/14 §4.1, thêm `altLabels` (nhãn thay thế được chấp nhận) vào schema EVAL, sửa đáp án theo quyết định (4 mẫu nhãn `price`; nhãn thay thế cho 3 mẫu -21, 2 mẫu thơ, en-22). Không đổi code lõi. Chủ dự án tự cập nhật Project (ngoài repo).

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Q-EV2-1…8 ghi quyết định đã chốt — kiểm bằng: `pnpm docs:build`.
2. FR-160 và docs/14 §4.1 cập nhật — kiểm bằng: diff docs.
3. `altLabels` được schema và metrics chấp nhận, mặc định chỉ nhãn chính — kiểm bằng: `metrics.test.ts`, `datasets.test.ts`.
4. Đáp án đúng quyết định (4 mẫu `price`; 6 mẫu có nhãn thay thế) — kiểm bằng: diff bộ mẫu.

## File sẽ sửa

`docs/05_Functional_Requirements.md`, `docs/14_Test_Plan.md`, `docs/plans/quyet-dinh/q-ev2-*.md`, `tools/eval/src/{dataset,metrics,metrics.test}.ts`, `tools/eval/datasets/synthetic-v2-*.jsonl`.

## Migration

Không có.

## Cần kiểm chứng độc lập không?

Không (tài liệu + công cụ đo).

## Rủi ro / câu hỏi cho chủ dự án

Không.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không đi ngược nguyên tắc nào.
