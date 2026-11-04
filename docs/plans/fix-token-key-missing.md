# Kế hoạch `fix/token-key-missing` — thiếu khóa cho key_version = lỗi cấu hình, kiểm lúc khởi động

## Việc

Gap `TOKEN-KEY-MISSING` (verifier TOKEN-ENC). Chủ dự án đã quyết (06/11/2026): thiếu khóa cho một `key_version` → **lỗi cấu hình** (không đổi trạng thái kênh, báo vận hành); sai khóa/AAD → vẫn `expired`. Thêm kiểm tra lúc khởi động: mọi `key_version` đang có trong `channels` phải có khóa trong `TOKEN_ENC_KEYS`, thiếu → dừng khởi động với thông báo rõ (chỉ nêu số phiên bản, không in khóa).

**Tóm tắt:** Trước đây worker thiếu khóa v2 thì mọi kênh vừa kết nối lại bị đánh "cần kết nối lại" hàng loạt. Nay thiếu khóa là lỗi cấu hình: job lỗi (không đụng kênh) và worker từ chối khởi động nếu env thiếu khóa cho phiên bản đang dùng. Kiểm tra khởi động ở **web** sẽ gắn khi web bắt đầu dùng `TOKEN_ENC_KEYS` (`FB-OAUTH`; hiện web chưa phụ thuộc `@flow/db`/`@flow/connectors` và chưa đọc khóa) — ghi gap `TOKEN-KEY-STARTUP-WEB`.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. `decrypt` với `keyVersion` không có khóa → `TokenKeyMissingError` (là `TokenConfigError`, không phải `TokenDecryptError`), thông báo chỉ nêu số phiên bản — test đơn vị.
2. `ChannelTokenProvider`: `TokenKeyMissingError` nổi lên nguyên dạng, KHÔNG gọi `onUndecryptable` (kênh không đổi trạng thái); sai khóa/AAD vẫn `expired` — test đơn vị + tích hợp worker (kênh vẫn `connected`).
3. `assertTokenKeysCoverVersions`: không kênh nào + không đặt khóa → qua; có kênh dùng phiên bản thiếu khóa → ném lỗi nêu các phiên bản thiếu (không in khóa); khóa sai định dạng → ném; đủ khóa → qua — test đơn vị.
4. Hàm DB `cf.channel_key_versions()` (migration 0021, DEFINER, search_path cố định, chỉ `cf_app` EXECUTE) trả các `key_version` đang dùng xuyên workspace (chỉ số nguyên, không dữ liệu nào khác) — test tích hợp.
5. Worker khởi động gọi kiểm tra này; thiếu khóa → thoát mã 1 với thông báo rõ — test tích hợp hàm + test đơn vị `loadConfig`.
6. Công cụ xanh (lint, i18n, typecheck, depcruise, check:plans, check:migrations, test, test:trace, test:coverage, test:db, db:check-rls).

## File sẽ đọc / sửa

Đọc: `packages/connectors/src/{token-cipher,channel-token-provider}.ts`, `apps/worker/src/{main,config}.ts`, `packages/db/src/channel-tokens.ts`.
Sửa/tạo: `token-cipher.ts` (+test), `channel-token-provider.test.ts`, `token-startup-check.ts` (+test), `index.ts`, `migrations/0021_channel_key_versions.sql`, `packages/db/src/channel-tokens.ts`/`runtime.ts`, `apps/worker/src/{main,config}.ts` (+test), `apps/worker/tests/channel-token.int.test.ts`, `packages/db/tests/channel-token-functions.int.test.ts`, `docs/{codemap,gap-matrix}.md`, `docs/plans/MASTER.md` (WORKER-DB-ROLE bắt buộc trước staging).

## Migration

`0021_channel_key_versions.sql`: `cf.channel_key_versions() RETURNS SETOF integer` (SECURITY DEFINER, `search_path = pg_catalog, core, cf, pg_temp`, REVOKE PUBLIC, GRANT cf_app). Đường lùi: `DROP FUNCTION cf.channel_key_versions()`.

## Cần kiểm chứng độc lập không?

Không: chỉ thêm hàm đọc số nguyên và đổi loại lỗi; check-rls (marker hàm DEFINER) + test bao phủ. Gộp vào kiểm chứng của nhánh nhạy cảm kế tiếp nếu cần.

## Rủi ro

Worker có kênh dùng phiên bản mà env thiếu khóa sẽ không khởi động — đúng ý (báo rõ thay vì làm hỏng kênh).

## Complexity tracking

Thêm một hàm DEFINER đọc xuyên workspace (đi ngược nguyên tắc #2) — chỉ trả số nguyên `key_version`, cần vì `cf_app` không có quyền cột `key_version`.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời
- [x] Mỗi tiêu chí nghiệm thu kiểm được
- [x] Logic quy tắc có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (không cần verifier)
- [x] Không thư viện mới; vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách file đủ
- [x] Không có bảng mới

## Trạng thái duyệt

**Đã duyệt** (chủ dự án, 06/11/2026: "Đồng ý … làm ở nhánh nhỏ").
