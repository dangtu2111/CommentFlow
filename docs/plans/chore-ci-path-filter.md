# Kế hoạch `chore-ci-path-filter` — CI lọc theo đường dẫn

> Trạng thái duyệt: **Đã duyệt** (chủ dự án 07/11/2026).

## Việc

Mã gap matrix: không (cải tiến quy trình) · Spec: `docs/decisions/015-ci-path-filter.md`.

**Tóm tắt:** CI chạy cả 5 job cho mọi PR nên PR chỉ sửa tài liệu vẫn chờ E2E 5–10 phút. Thêm job `changes` đọc danh sách file đổi và bỏ qua E2E/Database/Python khi không liên quan. Rủi ro: PR bị bỏ qua job không bắt được lỗi ở đó — bù bằng chạy đủ khi vào `main` và nhãn `ci-full`.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. `decideJobs` đúng bảng luật — kiểm bằng: `pnpm --filter @flow/scripts exec vitest run ci-changes`.
2. Tên 5 job không đổi; E2E/Database/Python có `needs: changes` + `if` — kiểm bằng: diff `ci.yml`.
3. PR đụng `.github` chạy đủ — kiểm bằng: CI của chính PR này.
4. PR chỉ sửa docs: E2E/Database/Python skipped và merge được — kiểm bằng: PR `chore/ci-filter-check` sau khi merge.

## File sẽ đọc

`.github/workflows/ci.yml`, `scripts/check-gitleaks-allowlist.mjs` (mẫu), `scripts/package.json`.

## File sẽ sửa / tạo

`.github/workflows/ci.yml`, `scripts/ci-changes.mjs` (+ `.test.mjs`), `docs/decisions/015-ci-path-filter.md`, `docs/plans/chore-ci-path-filter.md`, `docs/codemap.d/lenh-ci-changes.md`.

## Migration

Không có.

## Test viết trước

Test bảng luật `scripts/ci-changes.test.mjs`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/scripts exec vitest run ci-changes`

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Check bắt buộc có tính job skipped là thành công không — kiểm bằng PR thật (bước 6).

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.
