# Kế hoạch `feat/fb-connector-register` — Đăng ký connector Facebook vào worker (Xong-mock)

Mã gap matrix: `FB-CONNECTOR-REGISTER`, `FB-CONNECTOR-REGISTER-PRECONDITIONS`, `SEND-FIND-REPLY-BY-PARENT` · Spec: docs/12 §1, ADR 008/010.

**Tóm tắt:** Worker hiện có sổ connector rỗng nên mọi lệnh gửi/ẩn đều ghi `connector_unavailable`. Việc này nối `createFacebookConnector` vào sổ, nhưng sau cờ `FB_CONNECTOR_ENABLED` mặc định TẮT (cờ tắt → sổ rỗng như cũ; không gọi Meta). Đồng thời đổi bước "kiểm trước khi gửi lại" sang đọc trả lời của đúng bình luận cha (`fetchReplies`), vì connector thật không hỗ trợ quét cả Page; xác nhận giới hạn thân 256 KB ở webhook Meta bằng test; và ghi log (không ghi cột) khi Meta chặn gửi (mã 368). Rủi ro: chưa thử với Page thật (KT-012) — nên cờ tắt mặc định.

## Điểm chưa rõ

Không có. (Quyết định tự chọn: QC1–QC3 trong `QUYET_DINH_CHO_DUYET.md`.)

## Tiêu chí nghiệm thu

1. Cờ tắt/không đặt → sổ connector rỗng, không đọc `META_*`/`TOKEN_ENC_KEYS` — test `FR-016 loadConfig FB_CONNECTOR_ENABLED`, `buildConnectorRegistry` (`apps/worker/src/config.test.ts`, `channels/connector-registry.test.ts`).
2. Cờ `true` mà thiếu/sai `META_APP_ID`/`META_APP_SECRET`/`TOKEN_ENC_KEYS` → lỗi cấu hình nêu tên biến, không lộ giá trị — cùng test.
3. Cờ bật đủ cấu hình → sổ có connector `facebook` (dựng bằng `createFacebookConnector`, token qua `createWorkerTokenProvider`; không gọi mạng khi dựng) — test registry.
4. `findExistingReply` dùng `fetchReplies(channel, comment_external_id)` khi connector có; chỉ nhận câu của Page cùng nội dung (đã trim); không có `fetchReplies` thì dùng `fetchComments` (connector giả); lỗi truyền ra — `apps/worker/src/jobs/send.test.ts`.
5. Thân webhook đúng 256 KB không bị 413, 256 KB + 1 → 413 — `apps/web/src/server/meta-webhook.test.ts`.
6. Gửi gặp `BLOCKED` → log cảnh báo chỉ có mã + id kênh (không nội dung/token), yêu cầu `failed BLOCKED`, kênh không bị đổi — `send.int.test.ts` (test:db) + unit hook trong `send.test.ts`.
7. Lint/typecheck/depcruise/check:plans/test:trace xanh; coverage không hạ.

## File sẽ đọc

`apps/worker/src/{main,config,jobs/send}.ts`, `channels/token-provider.ts`, `packages/connectors/src/{types,facebook/connector}.ts`, `apps/web/src/server/meta-webhook{,.test}.ts` (đã đọc).

## File sẽ sửa / tạo

- `apps/worker/src/config.ts` (+test): cờ + cấu hình Facebook.
- `apps/worker/src/channels/connector-registry.ts` (+test): `buildConnectorRegistry`.
- `apps/worker/src/jobs/send.ts` (+`send.test.ts`): `findExistingReply` theo cha; hook `onBlocked`.
- `apps/worker/src/main.ts`: dùng registry thật chung cho send/hide; kiểm khóa khi cờ bật.
- `apps/web/src/server/meta-webhook.test.ts`: ca biên 256 KB.
- `env.example`, `docs/CAN_BAN_CUNG_CAP.md`, `docs/testing/KIEM_TRA_TAY.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/codemap.md`, `docs/handoff/`.

## Migration

Không có (làn c không được thêm migration). Phần ghi cột `send_suspended_until` khi 368 cần hàm Admin/DEFINER → `SEND-SUSPEND-ADMIN` (đã ở gap matrix), chỉ log ở đây.

## Test viết trước

Config/registry/`findExistingReply`/hook BLOCKED viết đỏ trước khi code.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/worker exec vitest run src` · `pnpm --filter @flow/web exec vitest run src/server/meta-webhook.test.ts`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` (token Page, gửi, khóa bí mật).

## Rủi ro / câu hỏi cho chủ dự án

Bật cờ ở staging chỉ sau khi có Page thử (KT-012). `SEND-SWEEP`/`HIDE-SWEEP` (làn b) vẫn cần xong trước khi bật cờ ở môi trường thật.

## Đề xuất thay đổi

Không đổi docs/01–16.

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

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong ADR 008/010 và QC1–QC3).
