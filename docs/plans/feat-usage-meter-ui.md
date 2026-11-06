# Kế hoạch `feat-usage-meter-ui` — Đồng hồ lượt dùng + cảnh báo 80%

## Việc

Mã gap matrix: `USAGE-METER-UI` · Spec: FR-090, US-060, BR-03/BR-06 (docs/10 §3.6).

**Tóm tắt:** Thêm thẻ "Lượt AI trong tháng" vào trang Cài đặt (chỉ Owner): thanh tiến độ đã dùng/hạn mức, chữ cảnh báo vàng từ 80%, đỏ + đề xuất mua thêm/nâng gói khi hết (100%). Đọc từ `core.usage_counters` qua `createUsageMeter().read` có sẵn (chỉ đọc, không trừ lượt). Bảng gói cước chưa có (`PLANS-SCHEMA`, cần migration, làn b) nên hạn mức tạm lấy từ biến môi trường. Rủi ro thấp: chỉ đọc, không migration.

## Điểm chưa rõ

Không có. Tự chọn theo AGENTS.md § Quy tắc hỏi: Q-UMU1 (ghi ở QUYET_DINH_CHO_DUYET.md).

## Tiêu chí nghiệm thu

1. Dưới 80%: mức `ok`; từ đúng 80%: `warning`; hết: `blocked` kèm đề xuất mua thêm/nâng gói — kiểm bằng `usage-meter-view.test.ts`.
2. Hạn mức tạm đọc từ `AI_TURNS_PLAN_LIMIT` (số nguyên ≥ 0), thiếu/sai → mặc định 500 — kiểm bằng `ai-turn-limit.test.ts`.
3. Thẻ chỉ hiện cho Owner, chưa có dòng đếm → 0 đã dùng — kiểm bằng test view + đọc code trang.
4. Khóa i18n `settings.usage.*` đủ ở vi và en, không viết cứng — `pnpm lint:i18n` + test khớp khóa.
5. Tool xanh: lint, typecheck, depcruise, check:plans, test:trace, test phạm vi.

## File sẽ đọc

`packages/shared/src/usage.ts`, `packages/saas-core/src/billing/usage-meter.ts` (đã đọc), trang settings, `server/env.ts`, `server/db.ts` (cách `getDb`).

## File sẽ sửa / tạo

- `apps/web/src/lib/usage-meter-view.ts` (+test): mô hình hiển thị thuần từ `UsageStatus`.
- `apps/web/src/lib/ai-turn-limit.ts` (+test): hạn mức tạm từ env.
- `apps/web/src/server/usage-meter.ts`: tải đồng hồ cho workspace đang chọn.
- `apps/web/src/components/settings/usage-meter-card.tsx`: thẻ giao diện.
- `settings/page.tsx`: gắn thẻ cho Owner; `vi.json`/`en.json`; `env.example`; docs (codemap, gap-matrix, MASTER, CAN_BAN_CUNG_CAP không cần — không tài nguyên ngoài, KIEM_TRA_TAY, Q).

## Migration

Không có.

## Test viết trước

`usage-meter-view.test.ts`, `ai-turn-limit.test.ts` (đỏ trước khi có mã).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/usage-meter-view.test.ts src/lib/ai-turn-limit.test.ts`

## Cần kiểm chứng độc lập không?

Không (chỉ đọc, không auth/RLS mới; dùng `withWorkspace` có sẵn).

## Rủi ro / câu hỏi cho chủ dự án

Hạn mức tạm và múi giờ cố định `Asia/Ho_Chi_Minh` đến khi có `PLANS-SCHEMA`.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-UMU1).
