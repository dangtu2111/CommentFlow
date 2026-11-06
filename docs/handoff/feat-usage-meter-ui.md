# Handoff `feat-usage-meter-ui` (claude, làn d)

## Đã làm
USAGE-METER-UI (FR-090): thẻ "Lượt AI trong tháng" ở `/app/settings` (Owner), chỉ đọc `usage_counters` qua `createUsageMeter().read`; 80% banner vàng, 100% banner đỏ. i18n `settings.usage.*` vi+en. Q-UMU1. Không migration.

## Đã đọc và rút ra
- `packages/shared/src/usage.ts`: `usageStatus` đã có quy tắc 80%/100% (không viết lại).
- `saas-core/billing/usage-meter.ts`: `read` trả `UsageStatus` (không trả `used` thô) → dựng lại `used = capacity − remaining`.
- `workspace` từ `requireAppUser` không có timezone → dùng `Asia/Ho_Chi_Minh` cố định.

## Còn lại
- `PLANS-SCHEMA` (làn b, migration): hạn mức theo gói + timezone thật thay `resolveAiTurnLimit`/hằng múi giờ.
- `TRIAL-UPGRADE-UI`: nút mua thêm/nâng gói. `USAGE-GATE-PIPE`: banner ở khung ứng dụng + báo Owner.
