# Kế hoạch `feat-auto-config-store` — Lưu cấu hình tự gửi vào DB

Mã gap matrix: `AUTO-CONFIG-STORE` (phần lưu của `AUTO-MATRIX-DB`) · Spec: FR-070, FR-071 (`docs/05`), `docs/09` §6, `docs/10` `automation_settings` · Quyết định: Q-ACS1.

**Tóm tắt:** Thêm hai bảng lưu cấu hình tự gửi theo workspace — `cf.automation_settings` (ngưỡng, trễ, giới hạn/ngày, giờ hoạt động, từ khóa chặn, chữ ký) và `cf.automation_rules` (mức Tắt/Chạy thử/Tự động của từng ô kênh × đối tượng × nhãn) — và cắm vào `AutomationSettingsStore` mà trang Cài đặt tự gửi (PR #105) đã định nghĩa, thay cho kho bộ nhớ. Chỉ Owner ghi (RLS). Rủi ro: cấu hình này CHƯA được cổng tự gửi đọc (nối pipeline làm sau) nên không thể tự gửi thật; mặc định mọi ô Tắt, ngưỡng có sàn 0,80 cả ở DB.

## Điểm chưa rõ

Không có (mọi chỗ tự chọn phương án an toàn ở Q-ACS1).

## Tiêu chí nghiệm thu

1. Migration 0047 tạo `cf.automation_settings` + `cf.automation_rules` có RLS bật; `pnpm db:check-rls` không báo vi phạm (kỳ vọng thêm ở `check-rls.ts`) — kiểm bằng `check-rls` + test `check-rls.test.ts`.
2. Chỉ Owner ghi: Staff, người ngoài, `withWorkspace` trần ghi bị 42501; đọc được cho thành viên — test `automation-settings.int.test.ts`.
3. Chéo workspace: Owner workspace B không đọc/ghi của A; ô trỏ kênh của workspace khác bị FK chặn (23503) và giao dịch hoàn tác — test tích hợp.
4. DB giữ sàn: ngưỡng < 0,80 hoặc > 1, trễ ngoài {0,60,120,300}, giới hạn/ngày ngoài 1–1000, nhãn Khiếu nại, mức lạ, chữ ký rỗng, > 50 từ khóa bị CHECK chặn — test tích hợp.
5. `updated_by` không giả danh: Owner chỉ ghi chính mình; hệ thống chỉ ghi null — test tích hợp.
6. Lưu → đọc lại đúng từng trường, lưu lại thay thế đúng bộ ô — test tích hợp + `automation-settings-store.test.ts`.
7. Store DB: chưa lưu → mặc định mọi ô Tắt; dữ liệu hỏng/dưới sàn → báo lỗi, không âm thầm dùng; `lastChange` có người + giờ — test `automation-settings-store.test.ts`.
8. Trang `/app/automation` dùng store DB (không còn bộ nhớ), cảnh báo i18n cập nhật vi/en — typecheck + `lint:i18n` + test cũ của trang.

## File sẽ đọc

`packages/ai/src/automation/{settings,settings-store}.ts`, `apps/web/src/server/automation-settings.ts` (interface #105, đã đọc), `migrations/0045_post_notes.sql` + `queries/post-notes.ts` + `schema/cf/post-notes.ts` + `tests/post-notes.int.test.ts` (mẫu Owner-ghi, đã đọc), `check-rls.ts` (các mảng kỳ vọng), `docs/10` dòng `automation_settings`.

## File sẽ sửa / tạo

- Tạo `packages/db/migrations/0047_auto_config_store.sql` (+ journal/snapshot), `schema/cf/automation.ts` (+ export), `queries/automation-settings.ts` (+ export ở `runtime.ts`), `tests/automation-settings.int.test.ts`.
- Sửa `packages/db/src/check-rls.ts` (kỳ vọng RLS/GRANT cột).
- Tạo `apps/web/src/server/automation-settings-store.ts` + test; sửa `server/automation-settings.ts` (đổi store).
- Sửa i18n `automation.notWired` vi/en; docs: `10_Database_Design.md`, `gap-matrix.md`, `plans/MASTER.md`, `QUYET_DINH_CHO_DUYET.md`, `codemap.md`, `CAN_BAN_CUNG_CAP.md`, `testing/KIEM_TRA_TAY.md`, `docs/handoff/feat-auto-config-store.md`.

## Migration

Có — `0047_auto_config_store.sql` (làn b). Chỉ tạo bảng mới + RLS + GRANT; không đụng bảng cũ; không cần phối hợp worker (chưa có nơi đọc trong pipeline). Đường lùi: `DROP TABLE cf.automation_rules, cf.automation_settings`, đổi store web về bộ nhớ.

## Test viết trước

`automation-settings.int.test.ts` (RLS/CHECK/FK/chéo workspace), `automation-settings-store.test.ts`; viết trước mã `queries/` và store.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/server/automation-settings-store.test.ts src/server/automation-settings.test.ts` · `pnpm --filter @flow/db exec vitest run src/check-rls.test.ts` · `CF_LANE=b pnpm test:db` · `pnpm db:check-rls`

## Cần kiểm chứng độc lập không?

Có — `verifier-db` (migration + RLS) và `verifier-security` (cấu hình cổng tự gửi: quyền Owner, sàn ngưỡng, kênh chéo workspace), mỗi bên một lần.

## Rủi ro / câu hỏi cho chủ dự án

Cấu hình chưa nối cổng tự gửi (`AUTO-CONFIG-WIRE`); ghi `action_logs`, ghi đè theo bài và `lang`/`allow_partial`/`allow_clarify` chưa làm (ghi gap matrix).

## Đề xuất thay đổi

Sửa `docs/10` mục `automation_settings` cho khớp Q-ACS1 (tách thành hai bảng) — ghi ở "Thay đổi docs/01–16" của Q-ACS1.

## Complexity tracking

Không có (hai bảng thay vì một bảng theo scope: tránh trộn cài đặt chung với ô ma trận trong cùng hàng, giữ CHECK chặt; đảo ngược được).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò — `automation_settings`/`automation_rules`: Owner hoặc hệ thống ghi, Staff đọc

## Trạng thái duyệt

Đã duyệt (tự duyệt — mọi quyết định ở Q-ACS1).
