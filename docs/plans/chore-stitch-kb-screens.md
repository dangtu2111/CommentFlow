# Kế hoạch `chore/stitch-kb-screens` — đăng ký 10 ảnh Stitch của màn Cơ sở kiến thức

## Việc

Mã gap matrix: `KB-SHOP-V2` (PR1/5). Kế hoạch chung: `docs/plans/feat-kb-shop-v2.md`.

**Tóm tắt (2–3 câu dễ hiểu):** Thêm vào repo 10 ảnh thiết kế Stitch của các màn Cơ sở kiến thức (đang nằm ngoài git) và ghi mỗi ảnh một hàng trong `design/stitch/README.md`. Chỉ đăng ký tham chiếu, không dựng màn nào. Rủi ro: chỉ thêm file ảnh/tài liệu.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. 10 ảnh `kb-*.png` được git theo dõi. 2. README có đúng 10 hàng mới, ghi rõ chỉ có ảnh desktop và số liệu trong ảnh là dữ liệu mẫu.

## File sẽ đọc / sửa

Sửa `design/stitch/README.md`; thêm `design/stitch/kb-{overview,shop,policies,faq,voice,rules,abbreviations,catalog,sandbox,testlab}.png`.

## Migration

Không.

## Test viết trước

Không áp dụng (chỉ tài liệu/ảnh).

## Lệnh test phạm vi hẹp

`pnpm docs:build && pnpm precheck`.

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Không.
