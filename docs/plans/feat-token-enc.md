# Kế hoạch `feat/token-enc` — mã hóa token Page (AES-256-GCM) + hàm DB ghi/đọc có kiểm soát

## Việc

Mã MASTER: `TOKEN-ENC` · FR-010 · Spec: `docs/13` §5 (AES-256-GCM, nonce ngẫu nhiên, `key_version`, khóa trong env), `docs/10` §1 (`*_enc bytea` + `key_version`), ADR 007 §2 (`cf_app` không đọc/ghi cột token). Kèm **phần sửa sau kiểm chứng của CH-SCHEMA** (đã gộp vào kiểm chứng nhánh này).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Token Page là chìa khóa để trả lời/ẩn bình luận nên phải mã hóa ngay khi nhận (ở bước callback OAuth) và chỉ **job gửi của worker** mới giải mã được. Nhánh này thêm: mã hóa AES-256-GCM trong mã ứng dụng (khóa từ biến môi trường, có nhiều phiên bản để xoay khóa, ràng thêm `workspace_id + channel_id + key_version` để ciphertext copy sang kênh khác không giải mã được) và bốn hàm DB hẹp — tạo kênh, ghi token, xóa token (Owner hoặc hệ thống), **đọc ciphertext (chỉ hệ thống)**. Web không bao giờ đọc được token; lỗi giải mã làm kênh chuyển sang "cần kết nối lại" mà không log token hay ciphertext.

## Điểm chưa rõ

Không có. Quyết định của chủ dự án (05/11/2026): đồng ý khuyến nghị 1 (khóa `TOKEN_ENC_KEYS` = `v1:<64 hex>,v2:<…>`, phiên bản cao nhất mã hóa, cũ chỉ giải mã; bạn tự đặt vào `.env.local`), 3 (AAD) và 4 (chỉ hàm `reencrypt` + test, job nền sau), 5; kèm:
- **(2)** Chỉ đường hệ thống (`withJob`/worker) được ĐỌC ciphertext để giải mã; Owner/web KHÔNG có quyền đọc ciphertext — web chỉ gọi hàm DEFINER để **ghi** (mã hóa ngay ở callback OAuth) và **xóa** token khi ngắt kết nối. Gửi trả lời luôn đi qua job send của worker. Test: `withActor`/`withWorkspace` đọc cột token → bị từ chối.
- **(3)** AAD = `workspace_id` + `channel_id` + `key_version`.
- Lỗi giải mã (sai khóa/AAD) → kênh chuyển trạng thái "cần kết nối lại" (`status = 'expired'`), **không log token hay ciphertext**.
- Được sửa `docs/10` §3.2 theo đề xuất ở ADR 007 §5; báo lại nội dung đã đổi.

Quyết định thiết kế bổ sung (theo ADR 005/007, verifier kiểm lại):
1. **Chia việc theo gói (không thêm gói mới):** mã hóa/giải mã + `TokenProvider` ở `packages/connectors` (chỉ phụ thuộc `shared`, dùng `node:crypto`); lớp gọi hàm DB ở `packages/db` (không import `connectors`); ghép hai bên ở `apps/*` (test tích hợp đặt ở `apps/worker`).
2. **Tạo kênh hai bước trong cùng giao dịch:** `cf.create_channel` (upsert theo `(platform, external_id, workspace_id)`, trả `channel_id` thật — kể cả khi kênh đã có) rồi mã hóa với `channel_id` đó và `cf.set_channel_token`. Nhờ vậy AAD luôn khớp id thật của hàng.
3. **Không đưa token vào `TokenProvider` qua tham số hay log:** `getAccessToken(channel)` đọc ciphertext qua `ChannelTokenReader` được tiêm (worker dùng `withJob` + `cf.read_channel_token`).

## Tiêu chí nghiệm thu

1. `createTokenCipher({ keys })` mã hóa/giải mã AES-256-GCM: mỗi lần mã hóa nonce 12 byte ngẫu nhiên khác nhau (cùng bản rõ → ciphertext khác); giải mã đúng; ciphertext/nonce/tag bị sửa 1 bit → lỗi; sai `workspaceId`, `channelId` hoặc `keyVersion` (AAD) → lỗi; khóa sai → lỗi — kiểm bằng: test đơn vị (bảng + property: `decrypt(encrypt(x)) = x` với chuỗi Unicode/dài/rỗng).
2. `parseTokenKeys('v1:…,v2:…')`: khóa phải đúng 64 ký tự hex (32 byte), phiên bản số nguyên dương không trùng, chuỗi rỗng/sai định dạng → lỗi rõ ràng KHÔNG in giá trị khóa; phiên bản cao nhất là phiên bản mã hóa — kiểm bằng: test đơn vị (kể cả thông báo lỗi không chứa khóa).
3. Xoay khóa: bản mã hóa bằng v1, sau khi thêm v2 vẫn giải mã được; `reencrypt` đọc bằng khóa cũ, ghi bằng phiên bản mới nhất (đổi `key_version`, nonce mới), bản rõ không đổi; thiếu khóa của một phiên bản đã dùng → lỗi giải mã (kênh cần kết nối lại) — kiểm bằng: test đơn vị + tích hợp.
4. Hàm DB (migration 0020, `SECURITY DEFINER`, `search_path` cố định, chỉ `cf_app` EXECUTE): `cf.create_channel`, `cf.set_channel_token`, `cf.clear_channel_token` — chỉ Owner đang hoạt động hoặc hệ thống, chỉ trong workspace hiện tại; `cf.read_channel_token` — **chỉ hệ thống** (`withJob`), Owner/Staff/`withWorkspace` trần bị từ chối — kiểm bằng: test tích hợp ma trận vai trò × hàm + test cột: `SELECT access_token_enc/key_version` bằng `withActor`/`withWorkspace`/`withJob` đều bị từ chối.
5. Cô lập: hàm chỉ chạm kênh của `app.workspace_id` hiện tại (id kênh của workspace khác → không tìm thấy/từ chối, không đọc/ghi token chéo) — kiểm bằng: test tích hợp.
6. `create_channel` upsert: kết nối lại cùng Page trả cùng `channel_id`, đặt `status = 'connected'`, không đụng token cũ cho tới khi `set_channel_token`; `clear_channel_token` đặt token NULL, `status = 'revoked'`, `webhook_subscribed = false` — kiểm bằng: test tích hợp.
7. `ChannelTokenProvider` (`TokenProvider`): đọc ciphertext qua reader được tiêm, giải mã bằng cipher; kênh không có token hoặc giải mã lỗi → gọi `onUndecryptable(channel)` (đặt `status = 'expired'`) rồi ném `PlatformError('TOKEN_EXPIRED')` **không chứa token, ciphertext, khóa** trong thông báo/`cause`/log — kiểm bằng: test đơn vị (spy log + kiểm chuỗi) và tích hợp ở `apps/worker`.
8. Tích hợp end-to-end ở `apps/worker/tests`: web-giả (`withActor` Owner) `create_channel` → mã hóa → `set_channel_token`; worker (`withJob`) `read_channel_token` → provider giải mã ra đúng bản rõ; đổi khóa sai → kênh thành `expired`; `withActor` đọc bị từ chối — kiểm bằng: test tích hợp.
9. Phần sửa sau kiểm chứng CH-SCHEMA: được kiểm lại trong lần kiểm chứng của nhánh này (`is_system_context`/`withJob`, trigger cột, khóa ngoại ghép) — kiểm bằng: báo cáo verifier trong PR.
10. `docs/10` §3.2 cập nhật theo ADR 007 §5; `env.example` có tên biến `TOKEN_ENC_KEYS` (không giá trị); `docs/CAN_BAN_CUNG_CAP.md` hướng dẫn sinh khóa — kiểm bằng: đọc diff.
11. Công cụ xanh (đọc mã thoát từng lệnh): `pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise && pnpm check:plans && pnpm check:migrations && pnpm test && pnpm test:trace && pnpm test:coverage`, `pnpm test:db`, `pnpm db:check-rls`.

## File sẽ đọc (≤ ~8, kèm lý do)

1. `docs/13_Security_Design.md` §5, `docs/10` §1/§3.2 — yêu cầu mã hóa (đã đọc).
2. `packages/db/migrations/0019_ch_schema.sql`, `0015`/`0016` — mẫu hàm DEFINER, `is_system_context`, quyền cột.
3. `packages/db/src/{client,runtime,check-rls}.ts` — thêm wrapper hàm DB, kiểm hàm DEFINER mới.
4. `packages/connectors/src/{types,errors,index}.ts` — `TokenProvider`, `PlatformError`.
5. `apps/worker/tests/queue.int.test.ts` + `apps/worker/package.json` — mẫu test tích hợp ở worker, thêm phụ thuộc `@flow/connectors`.
6. `.dependency-cruiser.cjs` — xác nhận `apps` được import `connectors`/`db`.
7. `docs/decisions/007-kenh-binh-luan-rls.md`, `docs/CAN_BAN_CUNG_CAP.md`, `env.example`.

## File sẽ sửa / tạo

- `packages/connectors/src/token-cipher.ts` (+ test): `parseTokenKeys`, `createTokenCipher` (`encrypt`, `decrypt`, `reencrypt`), `TokenDecryptError` (không chứa dữ liệu); `src/channel-token-provider.ts` (+ test); `src/index.ts` xuất.
- `packages/db/migrations/0020_channel_token_functions.sql` (+ `meta/`): 4 hàm DEFINER + quyền; `packages/db/src/channel-tokens.ts` (wrapper nhận `tx`), `runtime.ts` xuất; `check-rls.ts` (+ test): hàm mới đủ `search_path`/quyền, `read_channel_token` chỉ hệ thống.
- `packages/db/tests/channel-token-functions.int.test.ts`; `apps/worker/tests/channel-token.int.test.ts`; `apps/worker/package.json` (+ `@flow/connectors`).
- `env.example` (`TOKEN_ENC_KEYS=`), `docs/CAN_BAN_CUNG_CAP.md`, `docs/10_Database_Design.md` §3.2 + §4, `docs/decisions/007-kenh-binh-luan-rls.md` (§2, §5 → "đã áp dụng"), `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`.

## Migration

`0020_channel_token_functions.sql` — bốn hàm `cf.create_channel(p_platform text, p_external_id text, p_name text, p_avatar_url text, p_scopes text[])`, `cf.set_channel_token(p_channel_id uuid, p_ciphertext bytea, p_key_version int, p_expires_at timestamptz)`, `cf.clear_channel_token(p_channel_id uuid)`, `cf.read_channel_token(p_channel_id uuid)`; `SECURITY DEFINER`, `SET search_path = pg_catalog, core, cf, pg_temp`, `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO cf_app`. Ghi/xóa/tạo: đòi `is_workspace_owner() OR is_system_context()`; đọc: đòi `is_system_context()`; mọi hàm chỉ tác động kênh có `workspace_id = current_workspace_id()`; vi phạm → `insufficient_privilege` (42501). Đường lùi (comment cuối file): `DROP FUNCTION` bốn hàm (không đổi bảng). Tương thích ngược: chỉ thêm hàm.

## Test viết trước

(logic quy tắc bảo mật — test đỏ trước)
- `token-cipher.test.ts`: round-trip, nonce khác nhau, sửa 1 bit, sai AAD (workspace/channel/key_version), sai khóa, xoay khóa/`reencrypt`, `parseTokenKeys` (định dạng, thông báo lỗi không lộ khóa), property Unicode.
- `channel-token-provider.test.ts`: thiếu token/giải mã lỗi → `onUndecryptable` + `TOKEN_EXPIRED` không lộ dữ liệu (spy `console` + kiểm chuỗi).
- `channel-token-functions.int.test.ts`: ma trận vai trò × hàm; cột token không đọc được; cô lập chéo workspace; upsert/clear.
- `apps/worker/tests/channel-token.int.test.ts`: end-to-end.

## Lệnh test phạm vi hẹp

```
pnpm --filter @flow/connectors test
pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/channel-token-functions.int.test.ts tests/check-rls.int.test.ts
pnpm --filter @flow/worker exec vitest run --config vitest.int.config.ts tests/channel-token.int.test.ts
pnpm db:migrate && pnpm db:check-rls
```

## Cần kiểm chứng độc lập không?

**Có — đúng một lần ở cuối nhánh** (`verifier-security` + `verifier-db`, model Opus): mã hóa (nonce, AAD, xoay khóa, lỗi không lộ dữ liệu), bốn hàm DEFINER (quyền, cô lập, `search_path`), quyền cột token, **và phần sửa sau kiểm chứng của CH-SCHEMA** (migration 0019: `is_system_context`/`withJob`, trigger `guard_channel_user_update`/`guard_comment_user_update`, khóa ngoại ghép, `SET NULL (merged_into_id)`, `check-rls`). Đầu vào: diff + mục spec, không kèm lập luận của người viết.

## Rủi ro / câu hỏi cho chủ dự án

- **Bạn phải tự sinh khóa** (`openssl rand -hex 32`) và đặt `TOKEN_ENC_KEYS=v1:<hex>` trong `.env.local` trước khi chạy callback OAuth/worker thật; mất khóa = mọi kênh phải kết nối lại. Sao lưu khóa riêng (không cùng chỗ sao lưu DB). Hướng dẫn ở `docs/CAN_BAN_CUNG_CAP.md`.
- Không có bước bấm tay (chưa có giao diện; E2E thật khi làm `FB-OAUTH`): Kiểm tra tay không áp dụng.

## Đề xuất thay đổi

`docs/10` §3.2 và §4: được phép (chủ dự án 05/11) — áp dụng đề xuất ADR 007 §5; báo lại nội dung đã đổi.

## Complexity tracking

- **Thêm bốn hàm `SECURITY DEFINER`** (đi ngược "truy vấn đi qua `withWorkspace()`" nguyên tắc #2) — cần để `cf_app` không có quyền cột token nhưng vẫn tạo/ghi/xóa/đọc có kiểm soát; phương án đơn giản hơn đã loại: cấp quyền cột token cho `cf_app` (lộ token cho mọi mã web/worker và Owner).
- Không thêm thư viện (dùng `node:crypto`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy ghi theo vai trò hay chỉ theo workspace — không có bảng mới (chỉ hàm)

## Trạng thái duyệt

**Đã duyệt** (chủ dự án, 05/11/2026: đồng ý khuyến nghị 1, 3, 4, 5 và (2)/(3)/lỗi giải mã/sửa docs/10 như ghi ở "Điểm chưa rõ").
