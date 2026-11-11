# Kế hoạch `chore/stitch-kb-html` — tải HTML Stitch của 10 màn Cơ sở kiến thức

## Việc

Mã gap matrix: `KB-SHOP-V2` / UI KB. Lệnh chủ dự án 11/11/2026: dựng giao diện theo HTML Stitch, không theo ảnh (`docs/workflows/stitch-sync.md`).

**Tóm tắt (2–3 câu dễ hiểu):** Tải mã HTML của 10 màn Cơ sở kiến thức từ Stitch (qua MCP) vào `design/stitch/`, ghi `manifest.json` và README. Để các PR dựng màn sau đọc file thay vì gọi Stitch. Rủi ro: chỉ thêm file thiết kế.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. Có `design/stitch/kb-{overview,shop,policies,faq,voice,rules,abbreviations,catalog,sandbox,testlab}.html` (+ `.png` đã có). 2. `manifest.json` có 10 mục với `stitch_id` đúng. 3. README ghi trạng thái.

## File sẽ đọc / sửa

Thêm 10 file `.html`; sửa `design/stitch/manifest.json`, `design/stitch/README.md`.

## Migration

Không.

## Test viết trước

Không áp dụng.

## Lệnh test phạm vi hẹp

`pnpm docs:build && pnpm precheck`.

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

`kb-overview.html` không được lưu tự động (kết quả MCP nhỏ hơn giới hạn) nên chép lại từ kết quả; hai đường dẫn ảnh minh họa có thể lệch ký tự (ảnh mẫu, không dùng).
