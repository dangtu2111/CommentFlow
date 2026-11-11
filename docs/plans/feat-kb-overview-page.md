# Kế hoạch `feat/kb-overview-page` — đo nền ui:fidelity cho 7 màn KB hiện có (Phần 4a, bước 0)

## Việc

Mã gap matrix: `KB-SHOP-V2` / UI KB (Phần 4a). Lệnh chủ dự án 11/11/2026: mỗi màn KB dựng từ `.html` Stitch, có kết quả `ui:fidelity`.

**Tóm tắt (2–3 câu dễ hiểu):** Đo `pnpm ui:fidelity --geometry` cho 7 màn KB đã có trang (tổng quan, chính sách, FAQ, giọng văn, Thử AI, bộ kiểm thử, danh mục) trên TRANG THẬT làm số đo nền, lưu vào `docs/plans/ui-fidelity/kb-baseline/`. Cổng chỉ tính hình học (`q-kb-ui-fidelity.md`). Kết quả này để các PR từng màn sau so trước/sau.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

Có báo cáo đo nền của 7 màn; ghi rõ màn nào chưa có trang.

## File sẽ đọc / sửa

Thêm: `docs/plans/ui-fidelity/kb-baseline/fidelity-2026-11-11.md`.

## Migration

Không.

## Test viết trước

Không áp dụng.

## Lệnh test phạm vi hẹp

`node e2e/support/ui-completeness.mjs --geometry --batch <file.json> --base http://localhost:3000`.

## Cần kiểm chứng độc lập không?

Không.

## Số đo nền (hình học lệch / tổng chỉ số, chưa trừ lệch khung ứng dụng ~7 chỉ số)

| Màn | Trang thật | Lệch hình học | Ghi chú |
|---|---|---|---|
| kb-overview | `/app/kb` | 11/35 | Nội dung đã dựng từ cùng thiết kế; còn lệch chủ yếu khung ứng dụng |
| kb-policies | `/app/kb/policies` | 13/45 | |
| kb-faq | `/app/kb/faq` | 16/45 | |
| kb-voice | `/app/kb/voice` | 13/45 | |
| kb-sandbox | `/app/try-ai` | 16/35 | |
| kb-testlab | `/app/kb-testset` | 19/45 | |
| kb-catalog | `/app/products` | 14/25 | **Chưa có trang** (chỉ có `/app/products/import`): đo trên trang không tồn tại; cần trang Danh mục sản phẩm thật |
| kb-rules, kb-abbreviations | — | — | **Chưa có trang** (mục "Sắp có" ở rail): cần tính năng nền trước (quy tắc & giới hạn; từ điển viết tắt có ở worker nhưng chưa có giao diện KB) |

## Rủi ro / câu hỏi cho chủ dự án

Ba màn không có trang nền (danh mục, quy tắc, từ điển viết tắt) cần quyết định phạm vi: dựng trang giao diện trống + nút tắt hay làm tính năng thật (migration/logic).
