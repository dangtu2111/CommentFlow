# Kế hoạch `feat/ch-banner` — banner trạng thái kênh (CH-STATUS-BANNER)

## Việc

Mã MASTER: `CH-STATUS-BANNER` · FR-012 (trạng thái kênh connected / token_expired / disconnected; banner "Kết nối lại") · Spec: `docs/08` §3 (banner hệ thống: kênh mất kết nối), `docs/12` §1 ("Lỗi thường gặp": 190 → `expired` + banner; 10/200 → `revoked`), `docs/10` §3.2 (`channels.status`: `connected`/`expired`/`revoked`/`error`).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Khi một kênh (Fanpage) hết hạn kết nối, bị thu hồi quyền hoặc lỗi, mọi trang trong ứng dụng hiện một banner ở đầu nội dung nêu tên kênh và hướng dẫn kết nối lại (lấp khe `data-slot="banners"` của khung ứng dụng). Nút "Kết nối lại" thật chỉ có khi làm `FB-OAUTH` (cần Page thử) — bây giờ banner chỉ nêu tình trạng và ai cần làm gì, không có liên kết chết. Rủi ro thấp: chỉ đọc.

## Điểm chưa rõ

Không có. Quyết định theo spec (không bịa):
1. Hiện banner cho kênh `expired` ("hết hạn kết nối"), `revoked` ("bị thu hồi quyền/ngắt kết nối"), `error` ("đang lỗi"); `connected` thì không. Mỗi loại một banner, nêu tối đa 3 tên kênh + "và N kênh khác".
2. Owner thấy hướng dẫn "kết nối lại" (khi có `FB-OAUTH` sẽ thành nút → gap `CH-RECONNECT-ACTION`); Staff thấy "Hãy báo chủ workspace (Owner) kết nối lại" (chỉ Owner quản lý kênh, docs/13 §3.1).
3. Banner nạp ở layout của nhóm `(guarded)` (layout giữ nguyên khi chuyển trang trong nhóm nên banner cập nhật sau lần tải đầy đủ kế tiếp — chấp nhận; làm tươi theo thời gian thực thuộc `FR-117` sau).
4. Lỗi khi nạp banner (DB chập chờn) KHÔNG làm hỏng khung: bỏ qua banner, trang vẫn dựng.
5. Chưa dựng (ghi gap): banner hạn mức AI 80%/100%, dùng thử còn N ngày, gói hết hạn, AI tạm dừng (cần billing/AI), cảnh báo webhook im lặng (`POLLING-BACKFILL`).

## Tiêu chí nghiệm thu

1. `listChannelAlerts(tx, ws)` (`packages/db/src/queries/channel-alerts.ts`, chỉ đọc): trả kênh có `status` ∈ {`expired`, `revoked`, `error`} của workspace (id, tên, nền tảng, trạng thái), sắp theo tên; không có `connected`; không rò kênh workspace khác; người ngoài workspace → rỗng — test tích hợp DB.
2. `buildBannerModel(alerts, role)` (`apps/web/src/lib/channel-banner.ts`, thuần): gom theo trạng thái (thứ tự `expired` → `revoked` → `error`), tối đa 3 tên + số kênh còn lại, `audience: 'owner' | 'staff'` quyết định câu hướng dẫn, danh sách rỗng → không banner — test đơn vị.
3. Thành phần `SystemBanners` (Server Component) lấp khe trong layout: vai trò `status`/`alert` đúng (`role="alert"` cho `expired`/`revoked`), vi + en đủ khóa, màu từ token, không tràn mobile; nạp lỗi → không banner, không ném — build + kiểm tay (KT-006).
4. Công cụ xanh (đọc mã thoát): lint, lint:i18n, typecheck, depcruise, check:plans, check:migrations, test, test:trace (FR-012 có test), test:coverage, test:db, `next build`, `db:check-rls`.

## File sẽ đọc / sửa

Đọc (đã đọc): `docs/08` §3, `docs/12` §1, `(guarded)/layout.tsx`, `server/db.ts`, `packages/db/src/queries/inbox.ts` (mẫu), `globals.css`.
Tạo/sửa: `packages/db/src/queries/channel-alerts.ts` (+ `runtime.ts`), `packages/db/tests/channel-alerts.int.test.ts`; `apps/web/src/lib/channel-banner.ts` (+ test); `components/app/system-banners.tsx`; `(guarded)/layout.tsx`; `globals.css`; messages vi/en; `docs/testing/KIEM_TRA_TAY.md` (KT-006); `docs/codemap.md`; `docs/gap-matrix.md`; `docs/plans/MASTER.md`.

## Migration

Không có.

## Test viết trước

Tiêu chí 1–2. Lệnh: `pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/channel-alerts.int.test.ts` · `pnpm --filter @flow/web exec vitest run src/lib/channel-banner.test.ts` · `pnpm --filter @flow/web build`.

## Cần kiểm chứng độc lập không?

Không: chỉ đọc qua `withActor` + RLS đã kiểm chứng; không đổi policy/hàm.

## Rủi ro

Banner không thời gian thực (xem điểm 3). **Kiểm tra tay:** KT-006 (cần một kênh ở trạng thái `expired`: nhờ agent đặt thử trên `cf_dev`).

## Đề xuất thay đổi

Không.

## Complexity tracking

Không đi ngược nguyên tắc nào.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời
- [x] Mỗi tiêu chí nghiệm thu kiểm được
- [x] Logic quy tắc có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (không)
- [x] Không thư viện mới
- [x] Danh sách file đủ
- [x] Không bảng mới

## Trạng thái duyệt

**Đã duyệt** (tự duyệt theo `docs/PROMPT_BUILD_TOAN_BO.md` §2; chủ dự án giao 06/11/2026).
