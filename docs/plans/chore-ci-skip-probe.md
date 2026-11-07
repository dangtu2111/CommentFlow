# Kế hoạch `chore-ci-skip-probe` — PR thử xác nhận bộ lọc CI

> Trạng thái duyệt: **Đã duyệt** (chủ dự án yêu cầu 07/11/2026, bước 2).

## Việc

Mã gap matrix: không · Spec: `docs/decisions/015-ci-path-filter.md`.

**Tóm tắt:** PR chỉ sửa một dòng tài liệu để xác nhận job E2E/Database/Python bị bỏ qua ("skipped") vẫn được tính là thành công cho check bắt buộc và PR merge được. Không đổi mã chạy.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. E2E, Database, Python hiển thị skipped — kiểm bằng: `gh pr checks`.
2. PR ở trạng thái mergeable, không bị chặn bởi check bắt buộc — kiểm bằng: `gh pr view --json mergeStateStatus`.

## File sẽ đọc

`docs/decisions/015-ci-path-filter.md`.

## File sẽ sửa / tạo

`docs/decisions/015-ci-path-filter.md`, `docs/plans/chore-ci-skip-probe.md`.

## Migration

Không có.

## Test viết trước

Không áp dụng (chỉ tài liệu).

## Lệnh test phạm vi hẹp

`pnpm check:plans`
