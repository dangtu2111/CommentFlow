# Handoff feat-reports-metrics (làn d, claude)

**Đã làm:** logic chỉ số FR-083 (`packages/shared/src/reports.ts`), truy vấn `loadReportRows` (`packages/db/src/queries/reports.ts`, export từ `@flow/db/runtime`), CSV. Q-RPT1, docs/03 §4 ghi mẫu số. Test: ví dụ + fast-check (shared), DB giả (db).
**Đã đọc, rút ra:** `cf.comments` có `created_time`, `replied_at`, `replied_by`, `status` (`auto_replied`), `is_own`, `deleted_at` — đủ cho mọi chỉ số; chưa có bảng tin nhắn/`drafts` đã lưu → không tính "gửi nguyên văn", đổi nhãn, chi phí AI.
**Còn lại:** `REPORTS-UI` (route + `requireAppUser` + Server Action CSV, chuỗi i18n; vai trò từ phiên → `buildReport` viewer), `REPORTS-MESSAGES`, `REPORTS-WEEKLY-EMAIL`, test tích hợp `loadReportRows` trên DB thật (làn b/`test:db`), múi giờ workspace thay mặc định UTC+7.
