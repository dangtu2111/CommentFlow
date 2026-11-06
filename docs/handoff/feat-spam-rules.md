# Bàn giao feat-spam-rules (SPAM-RULES, FR-080) — claude

**Đã làm:** Zod + khớp + xem trước thuần (`packages/shared/src/spam-rules.ts`), truy vấn đọc 7 ngày (`packages/db/src/queries/spam-preview.ts`; test tích hợp đã viết nhưng CHƯA chạy cục bộ — cần `.env`/máy phụ, CI job `database` chạy), dịch vụ web + Server Action + trang Owner-only + i18n vi/en + menu.

**Đã đọc và rút ra:** `rule-filter.ts` (reason `emoji`/`mention` dùng cho emoji_only/tag_only); mẫu kb-gaps (page/actions/server/form).

**Còn lại:** `SPAM-RULES-DB` (làn b): bảng `rules`/`rule_matches` (docs/10 §3.5) + RLS ghi `withActor` Owner + bản DB của `SpamRuleStore` (truyền `store` vào `createSpamRulesService` ở `server/spam-rules.ts`); danh sách/bật-tắt/xóa quy tắc; chạy quy tắc trên bình luận mới (nối pipeline, `shadow_until`); `AUTO-HIDE`.
