# Kế hoạch `chore-stitch-settings-modals` — thêm 3 màn thiết kế Stitch cho Cài đặt

> Trạng thái duyệt: **Đã duyệt** (chủ dự án yêu cầu 07/11/2026: mục "Sắp có" trong Tài khoản & Bảo mật phải bổ sung hết; màn chưa có thiết kế thì dùng Stitch).

## Việc

Mã gap matrix: không (chỉ tài liệu thiết kế) · Spec: `design/stitch/README.md`.

**Tóm tắt:** thêm 3 file HTML thiết kế tải từ Stitch (chỉnh sửa thông tin, xác minh số điện thoại, chế độ tối) làm nguồn dựng giao diện cho lát gắn chức năng Cài đặt. Không đổi mã chạy. Dòng "Tiêu chuẩn: ISO 27001" trong bản tối là minh họa của Stitch, không dựng vào giao diện vì chưa có chứng nhận.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Có 3 file `design/stitch/cai-dat-*.html` và `manifest.json` được cập nhật — kiểm bằng: đọc diff.
2. Không đụng mã trong `apps/`, `packages/`, `services/` — kiểm bằng: diff chỉ nằm trong `design/` và `docs/plans/`.
3. Công cụ xanh (precheck, gitleaks) — kiểm bằng: CI.

## File sẽ đọc

`design/stitch/manifest.json`.

## File sẽ sửa / tạo

`design/stitch/manifest.json`, 3 file HTML mới trong `design/stitch/`, `docs/plans/chore-stitch-settings-modals.md`.

## Migration

Không có.

## Test viết trước

Không áp dụng (chỉ tài liệu thiết kế).

## Lệnh test phạm vi hẹp

`pnpm check:plans`
