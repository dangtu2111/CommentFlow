# Kế hoạch `chore/shared-docs-fragments` — mỗi mục một file riêng cho CAN_BAN_CUNG_CAP, KIEM_TRA_TAY và export của `@flow/ai`

> Trạng thái duyệt: **Đã duyệt** (chủ dự án yêu cầu 06/11/2026 sau khi #108/#111/#117 kẹt vì xung đột file chung).

## Việc

Mã gap matrix: không (hạ tầng quy trình) · Spec: `docs/workflows/parallel.md`.

**Tóm tắt:** ba file mọi nhánh song song cùng sửa — `docs/CAN_BAN_CUNG_CAP.md`, `docs/testing/KIEM_TRA_TAY.md`, `packages/ai/src/index.ts` — hay gây xung đột khi merge. Mở rộng cách "mỗi mục một file riêng" (đã dùng cho codemap/quyết định): hai file tài liệu được sinh từ thư mục nhỏ bằng script ghép + kiểm trong CI; `index.ts` của `@flow/ai` chỉ còn re-export từng module (mỗi module một `index.ts`). Không đổi logic sản phẩm, không đổi tên API công khai. Rủi ro: thứ tự mục trong file ghép đổi theo tên file; vài mã KT trùng phải đổi tên.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Mọi dòng không rỗng của `CAN_BAN_CUNG_CAP.md` và `KIEM_TRA_TAY.md` cũ vẫn có trong bản ghép (trừ các mã KT trùng được đổi tên, liệt kê ở Q-SDF1) — kiểm bằng: so sánh tập dòng trước/sau.
2. `pnpm cbcc:check` và `pnpm kt:check` xanh; sửa tay file ghép làm đỏ; mã KT trùng hoặc lệch tên file làm đỏ — kiểm bằng: chạy lệnh + test `scripts/lib/fragments.test.mjs`.
3. Không còn mã KT trùng trong `KIEM_TRA_TAY.md` — kiểm bằng: `pnpm kt:check` (báo "trùng mã").
4. Tập tên export của `@flow/ai` trước/sau giống hệt (396 tên) — kiểm bằng: so sánh bằng TypeScript compiler API; `pnpm --filter @flow/ai typecheck` + test xanh.
5. AGENTS.md, workflows, STANDARD, template orchestrator dặn thêm FILE RIÊNG; CI chạy hai check mới — kiểm bằng: đọc diff.
6. Mọi công cụ xanh (lint, lint:i18n, typecheck, depcruise, check:plans, test, coverage `@flow/ai`).

## File sẽ đọc (≤ ~8, kèm lý do)

`scripts/lib/fragments*.mjs`, `scripts/build-codemap.mjs`, `docs/CAN_BAN_CUNG_CAP.md`, `docs/testing/KIEM_TRA_TAY.md`, `packages/ai/src/index.ts`, `AGENTS.md`, `.github/workflows/ci.yml`, `tools/orchestrator/templates/HEAD.md`.

## File sẽ sửa / tạo

`scripts/lib/fragments.mjs` (+test, thêm `separator`, `prefix: ''`), `scripts/build-can-ban-cung-cap.mjs`, `scripts/build-kiem-tra-tay.mjs`, `package.json` (4 lệnh), `docs/can-ban-cung-cap.d/*`, `docs/testing/kiem-tra-tay.d/*`, hai file ghép, `packages/ai/src/*/index.ts` + `root-modules.ts` + `index.ts`, `AGENTS.md`, `docs/workflows/finish.md`, `docs/testing/STANDARD.md`, `tools/orchestrator/templates/HEAD.md`, `.github/workflows/ci.yml`, `docs/codemap.d/*`, `docs/plans/quyet-dinh/q-sdf1.md`.

## Migration

Không có.

## Test viết trước

`scripts/lib/fragments.test.mjs`: `separator`, `prefix` rỗng, mặc định không đổi, file rỗng.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/scripts exec vitest run lib/fragments.test.mjs`; `pnpm cbcc:check && pnpm kt:check && pnpm codemap:check && pnpm quyet:check`; `pnpm --filter @flow/ai typecheck && pnpm --filter @flow/ai test:coverage`.

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/migration/gửi).

## Rủi ro / câu hỏi cho chủ dự án

Nhánh đang mở vẫn sửa `CAN_BAN_CUNG_CAP.md`/`KIEM_TRA_TAY.md`/`index.ts` cũ sẽ xung đột một lần khi merge `main`; cách xử lý: lấy bản `main`, chuyển phần của mình thành file riêng rồi chạy `…:build`. `export *` giữa các module: tên trùng giữa hai module sẽ báo lỗi TypeScript (hiện không có).

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không thêm thư viện. Thêm `separator`/`prefix: ''` vào bộ ghép dùng chung — đã có 4 nơi dùng (codemap, quyết định, CBCC, KT).

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
