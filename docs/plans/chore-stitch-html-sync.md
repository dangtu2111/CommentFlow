# Kế hoạch `chore/stitch-html-sync` — Tải HTML Stitch cho mọi màn

Mã gap matrix: không có (việc thiết kế) · Spec: `design/stitch/README.md`.

**Tóm tắt:** Chủ dự án chốt (06/11/2026) dựng giao diện từ HTML của Stitch, không từ ảnh PNG. Việc này tải nguyên văn HTML từng màn về `design/stitch/<slug>.html`. Không đổi code sản phẩm; rủi ro thấp.

**Trạng thái duyệt:** Đã duyệt (chủ dự án giao việc trực tiếp)

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Mỗi file `.html` đã tải khớp nguyên văn bản Stitch — kiểm bằng: so kích thước/nội dung với `download_file`.
2. `pnpm precheck` xanh — kiểm bằng: chạy lệnh.

## File sẽ đọc

`design/stitch/manifest.json`, `design/stitch/README.md`.

## File sẽ sửa / tạo

`design/stitch/*.html` (tải về), `manifest.json`, `README.md`.

## Migration

Không có.

## Test viết trước

Không áp dụng (không có logic).

## Lệnh test phạm vi hẹp

`pnpm precheck`

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Mỗi màn tốn nhiều token để ghi lại; tiến độ ghi trong README.

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
