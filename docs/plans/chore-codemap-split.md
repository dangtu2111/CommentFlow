# Kế hoạch `chore/codemap-split` — tách codemap và QUYET_DINH thành file nhỏ

> Trạng thái duyệt: **Đã duyệt** (chủ dự án chốt 06/11/2026: giảm xung đột file chung giữa các nhánh song song).

## Việc

Mã gap matrix: không (hạ tầng quy trình) · Spec: `docs/workflows/parallel.md`.

**Tóm tắt:** `docs/codemap.md` và `docs/plans/QUYET_DINH_CHO_DUYET.md` là hai file mọi nhánh cùng sửa nên hay xung đột. Tách mỗi hàng/quyết định thành một file riêng (`docs/codemap.d/`, `docs/plans/quyet-dinh/`) và dùng script ghép ra file cũ; CI đỏ nếu file ghép lệch. Rủi ro: quên chạy `pnpm codemap:build` → CI báo lệch (sửa bằng chạy lệnh rồi commit).

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Mọi dòng không rỗng của `codemap.md` và `QUYET_DINH_CHO_DUYET.md` cũ vẫn có trong bản ghép — kiểm bằng: so sánh tập dòng trước/sau (giống hệt).
2. `pnpm codemap:check` và `pnpm quyet:check` xanh; sửa tay file ghép làm cả hai đỏ — kiểm bằng: chạy lệnh và test `scripts/lib/fragments.test.mjs`.
3. Ghép xác định (không phụ thuộc thứ tự đọc file/locale) — kiểm bằng: test Vitest.
4. CI có bước kiểm cạnh `check:plans`; AGENTS.md và workflows hướng dẫn thêm file vào thư mục nhỏ — kiểm bằng: đọc diff.
5. Mọi công cụ xanh (lint, typecheck, test, check:plans) — kiểm bằng: chạy lệnh.

## File sẽ đọc (≤ ~8, kèm lý do)

`scripts/check-plans.mjs`, `docs/codemap.md`, `docs/plans/QUYET_DINH_CHO_DUYET.md`, `docs/workflows/{feature,finish,parallel}.md`, `AGENTS.md`, `.github/workflows/ci.yml`.

## File sẽ sửa / tạo

`scripts/lib/fragments.mjs` (+ test), `scripts/lib/fragments-cli.mjs`, `scripts/build-codemap.mjs`, `scripts/build-quyet-dinh.mjs`, `docs/codemap.d/*`, `docs/plans/quyet-dinh/*`, `docs/codemap.md`, `docs/plans/QUYET_DINH_CHO_DUYET.md` (nay là file sinh ra), `package.json`, `.github/workflows/ci.yml`, `AGENTS.md`, `docs/workflows/{feature,finish,parallel}.md`, `.claude/commands/codemap-init.md`.

## Migration

Không có.

## Test viết trước

`scripts/lib/fragments.test.mjs`: ghép xác định, hàng nhiều dòng, CRLF, file mồ côi/rỗng/thiếu phần đầu, so khớp.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/scripts exec vitest run lib/fragments.test.mjs`; `pnpm codemap:check && pnpm quyet:check`.

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/migration/gửi).

## Rủi ro / câu hỏi cho chủ dự án

Thứ tự hàng trong file ghép nay theo tên file (không còn theo thứ tự thêm); một hàng bảng lạc trong mục "Bẫy" được chuyển vào bảng "Cây thư mục"; dòng trống giữa các gạch đầu dòng bị bỏ. Dòng "Cập nhật lần cuối" nằm ở `docs/codemap.d/_00-dau.md`.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không thêm thư viện, không vi phạm nguyên tắc nào.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt.**
