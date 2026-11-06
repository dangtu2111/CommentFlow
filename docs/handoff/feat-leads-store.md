# Handoff `feat-leads-store` — LEADS-STORE (agent: claude, làn b)

## Đã làm
- Plan `docs/plans/feat-leads-store.md` (đã duyệt), quyết định Q-LDS1 (`docs/plans/quyet-dinh/q-lds1.md`), docs/10 `leads` theo thực tế.
- `packages/shared/src/lead-contact.ts`: chuẩn hóa SĐT/email, `planLeadsFromContacts` (≤ 3 lead/lần), `parseLeadUpdate`; test có property-based (`fast-check` 4.10.2, MIT, thêm vào devDeps `shared`/`db`).
- `packages/db/src/lead-vault.ts`: AES-256-GCM (`LEADS_ENC_KEYS`, AAD workspace|lead|trường|phiên bản) + HMAC-SHA256 blind index (`LEADS_HASH_KEY`).
- Migration `0051_leads_store` (`cf.leads`, RLS: INSERT chỉ hệ thống; UPDATE thành viên/hệ thống cột hẹp; DELETE Owner/hệ thống; trigger DEFINER giao người), `queries/leads.ts`, `lead-sink.ts` (`createLeadContactSink`, `persistLeadsWith(db.withJob)`, `createLeadCaptureFromEnv` cờ `LEADS_CAPTURE_ENABLED` tắt).
- Test: `lead-contact.test.ts`, `lead-vault.test.ts`, `lead-sink.test.ts`, `tests/leads.int.test.ts` (15 test); `pnpm --filter @flow/db test:db` 56 file/678 test xanh (gồm check-rls.int).

## Đã đọc và rút ra
- `spam-rules` (0050) + `drafts` (0046) là mẫu RLS; `check-rls.ts` có 3 danh sách kỳ vọng (cột UPDATE bị cấm, marker policy, marker bị cấm) — đã thêm cho `cf.leads`.
- `ContactSink.save(workspaceId, contacts, {sourceId})` của `@flow/ai` không có `channelId`/loại nguồn → sink tạo theo từng nguồn (factory), db không import ai.
- Trong phiên này lệnh có tiền tố `CF_LANE=b`/`CHECK_RLS_TEST=1` bị chặn xin quyền nên test:db chạy trên DB test mặc định (cf_test); `pnpm db:check-rls` CLI trỏ DB dev chưa migrate → dựa vào `check-rls.int.test.ts`.

## Còn lại (việc sau)
- Nối `ContactSink` vào pipeline (PIPE-ROUTE…) tại chỗ gọi `maskAndCapture`; tạo sink theo kênh/nguồn, đọc cờ qua `createLeadCaptureFromEnv`.
- `LEADS-KANBAN` UI: giải mã số cho người được giao (kiểm quyền + nhật ký giải mã), giao người ghi `action_logs`; tên/địa chỉ/sản phẩm (cột riêng); `LEADS-EXPORT`.
- Xoay khóa `LEADS_ENC_KEYS` (job mã hóa lại), chính sách lưu giữ/xóa; `DEV-SEED-DEMO-MORE` thêm leads mẫu.
- Từ verifier-db (không có "Chặn merge"): (1) thêm chỉ mục `(workspace_id, created_at DESC, id DESC)` cho `listLeads` không lọc stage (migration mới, không sửa 0051 đã áp); (2) con trỏ phân trang `before` nên là khóa kép `(created_at, id)` dạng chuỗi micro giây, không qua `Date`; (3) `CHECK (key_version >= 1)`; (4) FK `channel` là NO ACTION → kênh phải được đánh dấu chứ không xóa cứng; (5) bỏ giao lead khi gỡ thành viên.
- Từ verifier-security (không "Chặn merge"; đã sửa): `getLeadCipher` kiểm thành viên/hệ thống; khóa băm không được trùng khóa mã hóa. Còn: `blindIndex` nên tự chuẩn hóa đầu vào khi thêm đường tìm theo SĐT; nơi gọi `updateLead` chỉ log mã lỗi (lỗi CHECK của Postgres kèm dòng chứa `name`/`note`).
- Chủ dự án: sinh `LEADS_ENC_KEYS`/`LEADS_HASH_KEY` khi bật (xem `CAN_BAN_CUNG_CAP` §2v).
