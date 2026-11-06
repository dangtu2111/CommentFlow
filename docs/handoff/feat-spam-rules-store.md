# Bàn giao `feat-spam-rules-store` (claude, làn b)

## Đã làm
- Migration 0049: `cf.rules` (CHECK, index `(workspace_id, created_at)`, RLS Owner/hệ thống ghi, GRANT cột; nội dung bất biến).
- Truy vấn `packages/db/src/queries/spam-rules.ts`; kho DB nối vào `apps/web/src/server/spam-rules.ts`; Server Action trả `limit_reached`; chuỗi i18n vi/en.
- Test: `packages/db/tests/spam-rules.int.test.ts` (RLS/CHECK/trần/bất biến), `apps/web/src/server/spam-rules.test.ts`.
- Docs: docs/10, Q-SRS1, codemap, gap-matrix, MASTER, KT-SPR.

## Đã đọc + điều rút ra
- Mẫu RLS: 0047/0048; policy ghi hệ thống dùng `num_nonnulls(col) = 0` (check-rls cấm chuỗi `IS NULL`).
- Quy tắc nội dung bất biến; `UPDATE` chỉ `enabled`/`shadow_until`/`updated_at`.

## Còn lại
- `SPAM-RULES-LIST-UI`: danh sách/bật-tắt/xóa trên giao diện (truy vấn đã có + test).
- Chạy quy tắc trên bình luận mới (pipeline, `shadow_until`), `rule_matches`, `AUTO-HIDE`.
- Chưa chạy được `CF_LANE=b pnpm test:db` + `db:check-rls` trong phiên không tương tác (lệnh có tiền tố biến môi trường cần duyệt): chạy trước khi merge.
- Khi làm chạy quy tắc: chạy lại `parseSpamRule`/`isSafeRegex` trên mẫu đọc từ DB (DB chỉ giới hạn độ dài), giữ cắt văn bản; verifier khuyến nghị.
