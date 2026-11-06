# Kế hoạch `chore-ci-precheck` — CI bớt chạy lặp + `pnpm precheck` trước khi push

> Trạng thái duyệt: **Đã duyệt** (chủ dự án yêu cầu 06/11/2026 sau khi #108/#111/#117 kẹt lâu).

## Việc

Mã gap matrix: không (cải tiến quy trình) · Spec: `docs/workflows/finish.md`.

**Tóm tắt:** CI hiện chạy cả khi push nhánh lẫn khi mở PR nên mỗi commit chạy hai lần và xếp hàng lâu. Sửa để CI chỉ chạy ở `pull_request` và push vào `main`, hủy lần chạy cũ cùng nhánh. Thêm lệnh `pnpm precheck` (các kiểm tra nhanh, dừng ở lỗi đầu) để agent chạy trước mỗi lần push, bắt lỗi rẻ trước khi tốn lượt CI. Rủi ro: tên 5 job phải giữ nguyên vì sẽ thành check bắt buộc.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. CI chỉ kích hoạt ở `pull_request` và `push` vào `main`; có `concurrency` với `cancel-in-progress` — kiểm bằng: đọc `.github/workflows/ci.yml`.
2. Tên 5 job (Node, Database, E2E, Python, gitleaks) không đổi — kiểm bằng: diff `ci.yml` không đụng dòng `name:` của job.
3. `pnpm precheck` chạy lint, format check, typecheck, check:migrations, check:plans, codemap:check, quyet:check và dừng ở lỗi đầu — kiểm bằng: chạy `pnpm precheck`; test `scripts/lib/precheck.test.mjs` cho danh sách bước.
4. AGENTS.md và `docs/workflows/finish.md` hướng dẫn chạy `pnpm precheck` trước mỗi lần push (không hook) — kiểm bằng: đọc diff.
5. Công cụ xanh (lint, typecheck, check:plans, codemap:check, quyet:check) — kiểm bằng: chạy lệnh.

## File sẽ đọc

`.github/workflows/ci.yml`, `package.json`, `docs/workflows/finish.md`, `AGENTS.md`.

## File sẽ sửa / tạo

`.github/workflows/ci.yml`, `package.json`, `scripts/precheck.mjs` (+ `scripts/lib/precheck.test.mjs`), `AGENTS.md`, `docs/workflows/finish.md`, `docs/codemap.d/lenh-precheck.md`, `docs/plans/quyet-dinh/qci1.md`.

## Migration

Không có.

## Test viết trước

Test danh sách bước precheck (đúng thứ tự, chạy tuần tự, dừng ở lỗi đầu).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/scripts exec vitest run lib/precheck.test.mjs`; `pnpm precheck`.

## Cần kiểm chứng độc lập không?

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn điểm chưa rõ
- [x] Tiêu chí nghiệm thu kiểm được
