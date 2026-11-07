# Kế hoạch `feat-settings-channels-hub` — Cài đặt › Kênh đã kết nối (số liệu thật, ngắt kết nối, kiểm tra kết nối) + khung tab dùng chung

> Trạng thái duyệt: **Đã duyệt** (chủ dự án giao việc 07/11/2026: dựng theo thiết kế Stitch `settings-channels`, gắn chức năng đã có, làm chức năng còn thiếu, đẩy CI).

## Việc

Mã gap matrix: `CH-HUB-UI` (mới) · Spec: `docs/12_Platform_Integration.md` §1, FR-010/012, `design/stitch/settings-channels.{png,html}`.

**Tóm tắt:** (1) Trang Kênh dựng lại bằng Tailwind theo Stitch: thẻ số liệu thật (kênh, OAuth, tương tác 24 giờ, tỉ lệ AI tự trả lời), nhóm theo nền tảng, banner kênh mất kết nối. (2) Gắn chức năng đã có: ngôn ngữ trả lời theo kênh ("Cài đặt nâng cao"), Kết nối lại. (3) Làm mới: **Ngắt kết nối** (dùng hàm DB `cf.clear_channel_token` sẵn có) và **Kiểm tra toàn bộ kết nối** (job `channel-check` ở worker gọi Meta bằng token Page, ghi kết quả vào hai cột mới, migration 0063). (4) Mọi tab Cài đặt dùng chung thanh tab và đầu trang (`settings.pages.*`); thẻ "Mã khôi phục dự phòng" theo Stitch kèm **Xem lại mã** / **Tải file .txt** (nhập lại mật khẩu).

## Điểm chưa rõ

Không có (đã chốt với chủ dự án: một Meta App chung, khóa nằm ở `.env`; chưa làm Super Admin; Instagram/TikTok để sau).

## Tiêu chí nghiệm thu

1. Trang `/app/channels` hiển thị số liệu đúng từ DB (kênh, tương tác 24 giờ, tỉ lệ AI 7 ngày) — kiểm bằng: test tích hợp `channel-activity.int.test.ts` + xem trang.
2. Ngắt kết nối chỉ Owner, xóa token, đặt `revoked` — kiểm bằng: `channel-disconnect.test.ts`, `channel-token-functions.int.test.ts`.
3. Cột kết quả kiểm chỉ hệ thống ghi được — kiểm bằng: `channel-health-check.int.test.ts` (Owner bị chặn, `withJob` ghi được).
4. Job `channel-check`: token hỏng → hạ trạng thái, lỗi tạm không hạ, một kênh lỗi không dừng kênh khác, không log id/token — kiểm bằng: `channel-check.test.ts`.
5. Xem lại mã dự phòng cần mật khẩu, cùng hạn mức thử như tạo lại mã — kiểm bằng: `backup-codes.test.ts` + kiểm tay KT-WCH.
6. Tiêu đề/mô tả cả 6 tab lấy từ `settings.pages.*`, vi/en khớp biến — kiểm bằng: `message-utils.test.ts`, `pnpm lint:i18n`.
7. Công cụ xanh — kiểm bằng: `pnpm precheck`, E2E hiện có (`gate0`, `settings-security`, `settings-profile`).

## File sẽ đọc

`design/stitch/settings-channels.*`, `packages/db/migrations/0019/0020`, `apps/web/src/app/app/(guarded)/channels/*`, `apps/worker/src/{main.ts,jobs/polling.ts,channels/*}`, `packages/connectors/src/{types.ts,facebook/connector.ts}`.

## File sẽ sửa / tạo

Migration `0063_channel_health_check.sql`; `packages/db/src/queries/channels.ts` + test; `apps/worker/src/jobs/channel-check.*`, `main.ts`, `queue/definitions.ts`; `packages/connectors/src/{types.ts,facebook/connector.ts}`; `packages/shared/src/queues.ts`; web: `components/settings/{channels-hub,settings-frame,language-card,…}`, `channels/{page,actions}.tsx`, `server/channel-disconnect.*`, `lib/channel-check.*`, `components/security/two-factor-card.tsx`, `packages/saas-core/src/auth/{backup-codes,two-factor}.ts`, i18n vi/en, `design/stitch/settings-channels.*`.

## Migration

`0063_channel_health_check.sql` — thêm `channels.last_checked_at`, `last_check_result` + CHECK + quyền cột + cập nhật trigger `guard_channel_user_update`. Đường lùi ghi đầu file migration.

## Test viết trước

`channel-activity.int.test.ts`, `channel-health-check.int.test.ts`, `channel-check.test.ts`, `channel-disconnect.test.ts`, `backup-codes.test.ts` (readBackupCodes), `lib/channel-check.test.ts`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/db exec vitest run -c vitest.int.config.ts tests/channel-activity.int.test.ts tests/channel-health-check.int.test.ts` · `pnpm --filter @flow/worker exec vitest run src/jobs/channel-check.test.ts` · `pnpm --filter @flow/web exec vitest run src/server src/lib`
