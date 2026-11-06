# Kế hoạch `feat-cli-parseenv` — CLI đọc env qua parseEnv

## Việc

Mã gap matrix: `CLI-PARSEENV` · Spec: nguyên tắc AGENTS.md (Zod ở mọi ranh giới vào/ra).

**Tóm tắt:** Các CLI migrate/check-rls/test-reset/queue-install đang đọc `process.env` thô. Đổi sang `parseEnv` (kiểm bằng Zod; lỗi chỉ nêu tên biến, không lộ giá trị) qua một module chung `packages/db/src/cli-env.ts`. Hành vi không đổi (biến thiếu vẫn do cổng migration-guard báo lỗi); chỉ các biến cần thiết được lọc ra. Rủi ro thấp, không chạm DB.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Không CLI nào trong `packages/db/src/cli` và `apps/worker/src/cli` còn `process.env` — kiểm bằng: grep trả rỗng.
2. Schema chỉ cho lọt đúng các biến CLI cần; check-rls chọn URL đúng theo `CHECK_RLS_TEST` — kiểm bằng: `cli-env.test.ts`.
3. Lint, typecheck, depcruise, coverage `@flow/db` không giảm — kiểm bằng: lệnh phạm vi hẹp.

## File sẽ đọc

CLI của db (4 file) và worker (2 file), `staging-migrate.ts` (kiểu `StagingMigrateEnv`), `packages/shared/src/env.ts`.

## File sẽ sửa / tạo

`packages/db/src/cli-env.ts` (+ test), `packages/db/src/index.ts`, 4 CLI db, 2 CLI worker, codemap, gap-matrix, MASTER, handoff.

## Migration

Không có.

## Test viết trước

`packages/db/src/cli-env.test.ts`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db exec vitest run src/cli-env.test.ts`; `pnpm --filter @flow/db test:coverage`.

## Cần kiểm chứng độc lập không?

Không (không đổi logic cổng; chỉ đổi nguồn đọc biến, kiểu giữ nguyên).

## Rủi ro / câu hỏi cho chủ dự án

Không có.

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
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — không có bảng mới

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong AGENTS.md).
