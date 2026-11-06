# Handoff `feat-push-email` (claude, làn c)

## Đã làm
- Lõi thuần FR-084 ở `packages/shared/src/notification-{prefs,digest,channels}.ts` (+test): lựa chọn sự kiện×kênh, giờ yên lặng (múi giờ, qua đêm), gom, nội dung không PII, `PushProvider`/`EmailProvider` + mock, `readNotificationConfig` (cờ `PUSH_EMAIL_ENABLED` TẮT, VAPID cả bộ), `createNotificationDispatcher`.
- Q-PE1, mục cần-bạn-cung-cấp, KT-PE, codemap, gap-matrix/MASTER, `env.example` (chỉ tên biến).

## File đã đọc + điều rút ra
- `lead-export.ts` là mẫu cờ/config; coverage `@flow/shared` ngưỡng 100% (dòng/câu lệnh) — nhánh không tới được phải bỏ.

## Còn lại (gap cho làn khác)
- `PUSH-EMAIL-STORE` (làn b, migration): `notification_prefs`, `push_subscriptions`, hàng đợi gom; RLS theo người dùng.
- `PUSH-EMAIL-PROVIDERS` (Web Push VAPID thật, SMTP qua `MailTransport`), `PUSH-EMAIL-UI` (Cài đặt › Thông báo + service worker), `PUSH-EMAIL-WORKER` (xả hàng đợi gom/hoãn).
