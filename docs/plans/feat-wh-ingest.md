# Kế hoạch `feat/wh-ingest` — nhận webhook bình luận Facebook (xác minh chữ ký) → job `ingest` → lưu bình luận

## Việc

Mã MASTER: `WH-INGEST` (+ phần cốt lõi của `INGEST-SKIP-OWN`) · FR-020 (chữ ký → ghi sự kiện → job → 200), FR-021 (chống trùng, lưu `webhook_events`), FR-022 (bỏ bình luận do chính Page viết) · Spec: `docs/12` §1 (webhook `feed`, `X-Hub-Signature-256`, chống vòng lặp `from.id == page_id`), `docs/09` §7.1, §9 (queue `ingest`: đồng thời 10, thử lại 5 lần backoff mũ, idempotent theo `external_id`), ADR 007 §4, `docs/CAN_BAN_CUNG_CAP.md` §2 (thử bằng Cloudflare quick tunnel).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Khi có người bình luận trên Fanpage, Meta gọi vào địa chỉ webhook của mình. Nhánh này thêm endpoint `/api/webhooks/meta` kiểm chữ ký (đúng như production), ghi sự kiện vào DB (không trùng; một Page ở nhiều workspace thì mỗi workspace một bản), đẩy job `ingest` và trả 200 ngay; worker xử lý job: lưu bài + bình luận, **bỏ bình luận do chính Page viết**. Rủi ro: đây là cửa vào không cần đăng nhập nên chữ ký sai phải bị từ chối tuyệt đối, và hàm ghi sự kiện (DEFINER) trải sự kiện sang các workspace — cần kiểm chứng độc lập.

## Điểm chưa rõ

Không có (các điểm thiết kế đều đã có ở spec/ADR/quyết định chủ dự án 06/11/2026):
- Kênh nhận sự kiện: `status = 'connected' AND webhook_subscribed = true` (chủ dự án đồng ý).
- Webhook ghi DB + enqueue rồi trả 200 (docs/09 §7.1); xử lý nặng ở worker.
- Phạm vi: chỉ `field = 'feed'`, `item = 'comment'`. `verb = add` → tạo bình luận; `edited`/`remove` → lưu sự kiện và đánh `done` không đổi gì (gap `INGEST-EDIT-REMOVE`, làm cùng `FB-HIDE`/đồng bộ trạng thái); mọi thay đổi khác (reaction, status, share…) bỏ qua ở web (vẫn trả 200). Chưa gọi Graph API (không cần mạng): `posts.message/permalink` để trống tới khi có `FB-POLL`/đồng bộ bài (gap `POST-HYDRATE`).
- Fixture payload: **mô phỏng theo tài liệu Meta** (không phải bản ghi thật); bước kiểm tra tay bằng Cloudflare tunnel xác nhận với webhook thật.

## Tiêu chí nghiệm thu

1. `verifyMetaSignature(rawBody, header, appSecret)`: đúng chữ ký → true; sai khóa/sửa 1 byte thân/thiếu header/sai tiền tố (`sha256=`)/độ dài hex sai/ký tự không hex/khóa rỗng → false; so sánh thời gian hằng (`timingSafeEqual`), không ném lỗi với đầu vào bậy — test đơn vị (bảng + property).
2. `parseMetaWebhook(body)` → `NormalizedEvent[]`: bình luận mới cấp 1 (`parent_id == post_id` → `parentExternalId = null`), trả lời lồng (`parent_id` là comment), `from.id == entry.id` → `isFromPage = true`, `edited`/`remove` → `comment_edited`/`comment_deleted`, đa `entry`/`changes`; bỏ qua `item != comment`, `field != feed`, bản ghi thiếu trường bắt buộc; `object != 'page'` hoặc JSON sai cấu trúc → `[]`/lỗi rõ ràng không chứa nội dung — test đơn vị với fixture.
3. `eventHashOf(...)`: ổn định (cùng sự kiện → cùng hash), khác `comment_id`/`verb`/page → khác hash — test đơn vị.
4. Endpoint `GET /api/webhooks/meta` (bắt tay): đúng `hub.mode=subscribe` + `hub.verify_token` (so sánh thời gian hằng) → 200 trả nguyên `hub.challenge`; sai → 403; thiếu cấu hình `META_WEBHOOK_VERIFY_TOKEN` → 503 (không bao giờ chấp nhận khi chưa cấu hình) — test route.
5. Endpoint `POST`: thiếu/sai chữ ký → **401, không ghi DB, không enqueue**; thiếu `META_APP_SECRET` → 503; thân > 256 KB → 413; JSON hỏng (đã đúng chữ ký) → 400; đúng chữ ký → ghi sự kiện + enqueue `ingest` cho từng dòng mới → 200; sự kiện không quan tâm (không phải bình luận) → 200 không ghi; lỗi DB/queue → 500 để Meta gửi lại (không nuốt). Log không chứa payload/chữ ký/khóa — test route (phụ thuộc được tiêm).
6. Hàm DB `cf.record_webhook_event` (migration 0022, DEFINER, `search_path` cố định, chỉ `cf_app` EXECUTE): chỉ chạy khi KHÔNG có workspace và KHÔNG có người dùng trong ngữ cảnh (đường `withSystem` của route webhook); `withWorkspace`/`withActor`/`withJob` → 42501. Với Page đã map: mỗi kênh `connected + webhook_subscribed` ở mỗi workspace → một dòng `webhook_events` (workspace đó) và trả `(event_id, workspace_id)` cho dòng MỚI; gửi lại cùng sự kiện → không dòng mới (idempotent); Page chưa map/ngắt/chưa đăng ký → một dòng `workspace_id = NULL` (không enqueue); một Page ở 2 workspace → 2 dòng — test tích hợp DB.
7. Worker job `ingest` (`workspaceJob`/`withJob`): sự kiện `received`/`failed` → `processing` → tạo bài (nếu chưa có) + bình luận (`status = 'new'`, `is_own = false`), tăng `comment_count`/`pending_count` đúng một lần; chạy lại/trùng → không thêm; `isFromPage` → KHÔNG tạo bình luận (sự kiện `done`); `edited`/`deleted` → `done` không đổi gì; sự kiện đã `done` → bỏ qua; lỗi → `failed` + `attempts` + mã lỗi (không PII) rồi ném để pg-boss thử lại; kênh không còn `connected` → `done` bỏ qua — test tích hợp worker.
8. Hàng đợi `ingest` có trong `QUEUES` (retry 5, backoff mũ, `singletonKey = event_id` chống enqueue trùng), `queue:install` tạo được; worker đăng ký handler (đồng thời 10) — test.
9. Chạy thử đầu-cuối ở máy dev: POST đã ký bằng `META_APP_SECRET` giả (script/test) → bình luận xuất hiện trong DB — test tích hợp (route + DB + worker gộp ở mức hàm) và hướng dẫn kiểm tay (KT-004: tunnel thật).
10. Công cụ xanh (đọc mã thoát từng lệnh): lint, i18n, typecheck, depcruise, check:plans, check:migrations, test, test:trace (FR-020/021/022 có test), test:coverage, test:db, `db:check-rls`.

## File sẽ đọc (đã đọc khi lập kế hoạch) / file sẽ sửa

Đọc: `docs/12` §1, `docs/09` §7.1/§9, ADR 007, `packages/connectors/src/{types,index}.ts`, `apps/worker/src/{main,config}.ts` + `queue/*` + `jobs/run-job.ts`, `apps/web/src/app/api/health/route.ts`, `apps/web/src/server/{env,auth}.ts`, `packages/db/src/{channel-tokens,runtime,client}.ts`, schema `cf/{posts,comments,webhook-events}.ts`.

Tạo/sửa:
- `packages/connectors/src/facebook/{webhook,webhook.fixtures}.ts` (+ test): `verifyMetaSignature`, `parseMetaWebhook`, `eventHashOf`, `index.ts` xuất.
- `packages/db/migrations/0022_record_webhook_event.sql` (+ `meta/`); `packages/db/src/webhook-events.ts` (`recordWebhookEvent`, `runtime.ts` xuất); `check-rls.ts` (hàm mới đúng điều kiện ngữ cảnh) (+ test).
- `apps/web`: `src/app/api/webhooks/meta/route.ts` (+ `route.test.ts`), `src/server/webhook-runtime.ts` (db + pg-boss, đọc `DATABASE_URL`/`META_*`), `next.config.ts` (`serverExternalPackages: ['pg-boss']`), `package.json` (+ `@flow/connectors`, `@flow/db`, `pg-boss` đã dùng ở repo — MIT).
- `apps/worker`: `src/jobs/ingest.ts` (+ test), `src/queue/definitions.ts` (queue `ingest`), `src/main.ts` (đăng ký), tests tích hợp `tests/ingest.int.test.ts`.
- `packages/shared` hoặc `definitions`: hằng tên queue `ingest` dùng chung web+worker (đặt ở `@flow/shared`, nhỏ).
- `env.example` (không đổi: đã có `META_*`), `docs/testing/KIEM_TRA_TAY.md` (KT-004), `docs/CAN_BAN_CUNG_CAP.md` (cập nhật nếu cần), `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, ADR 007 §4 (đã khớp).

## Migration

`0022_record_webhook_event.sql`: `cf.record_webhook_event(p_platform text, p_page_external_id text, p_event_hash text, p_payload jsonb) RETURNS TABLE (event_id uuid, event_workspace_id uuid)` — `SECURITY DEFINER`, `search_path = pg_catalog, core, cf, pg_temp`, REVOKE PUBLIC, GRANT EXECUTE `cf_app`. Điều kiện: `core.current_workspace_id() IS NULL AND core.current_user_id() IS NULL AND core.is_system_context() IS NOT TRUE`, ngược lại 42501 (chống đường người dùng/job tiêm sự kiện sang workspace khác). Thân: chèn `webhook_events` cho mỗi kênh `connected AND webhook_subscribed` khớp `(platform, external_id)` (`ON CONFLICT (event_hash, workspace_id) DO NOTHING`, trả dòng mới), nếu không có kênh nào → một dòng `workspace_id NULL` (`ON CONFLICT DO NOTHING`, không trả). Đường lùi: `DROP FUNCTION cf.record_webhook_event(text, text, text, jsonb)` (không đổi bảng).

## Test viết trước

(Toàn bộ logic chữ ký/parse/idempotency/fan-out — test đỏ trước.) Xem tiêu chí 1–9. Lệnh phạm vi hẹp:
```
pnpm --filter @flow/connectors test
pnpm --filter @flow/web exec vitest run src/app/api/webhooks
pnpm --filter @flow/worker exec vitest run src/jobs/ingest.test.ts
pnpm --filter @flow/db exec vitest run --config vitest.int.config.ts tests/webhook-events.int.test.ts tests/check-rls.int.test.ts
pnpm --filter @flow/worker exec vitest run --config vitest.int.config.ts tests/ingest.int.test.ts
pnpm db:migrate && pnpm db:check-rls
```

## Cần kiểm chứng độc lập không?

**Có — đúng một lần ở cuối nhánh** (`verifier-security` + `verifier-db`, Opus): chữ ký webhook, so sánh thời gian hằng, giới hạn thân, hàm DEFINER trải sự kiện sang workspace (điều kiện ngữ cảnh, cô lập tenant, idempotency), không rò PII ở log/`error`, không tiêm sự kiện chéo workspace. Đầu vào: diff + mục spec, không kèm lập luận người viết.

## Rủi ro / câu hỏi cho chủ dự án

- Hàm `record_webhook_event` là điểm cuối **không đòi đăng nhập** ở tầng DB (chữ ký kiểm ở mã web, như mọi webhook); nếu tiến trình web bị chiếm thì kẻ đó ghi được sự kiện giả cho Page bất kỳ — cùng mô hình ADR 005 §3 / gap `WORKER-DB-ROLE` (role DB riêng cho web webhook/worker, bắt buộc trước staging). Hàm không cấp quyền đọc gì.
- pg-boss chạy trong Next (web) là phụ thuộc mới ở web (đã có ở repo, MIT); nếu bundling lỗi sẽ chuyển sang worker quét `received` (không đổi tiêu chí).
- **Kiểm tra tay** (KT-004, ≤ 10 bước, sau khi có Page thử + tunnel): ghi vào `docs/testing/KIEM_TRA_TAY.md`; bạn thử khi "dồn".

## Đề xuất thay đổi

Không (không đụng `docs/01–16`).

## Complexity tracking

- Thêm hàm DEFINER cho đường không đăng nhập (đi ngược "truy vấn qua `withWorkspace()`", nguyên tắc #2) — cần vì webhook đến trước khi biết workspace nào sở hữu Page; phương án đơn giản hơn đã loại: cho `cf_app` quyền INSERT trực tiếp `webhook_events` (mọi code path ghi được sự kiện chéo workspace).
- Web phụ thuộc `@flow/db`/`@flow/connectors`/`pg-boss` (cùng giấy phép MIT, đã có ở repo).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (mục "Điểm chưa rõ" = không có)
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier)
- [x] Thư viện mới: không (pg-boss đã dùng, MIT); vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Bảng mới: không có (chỉ hàm); `webhook_events` giữ policy chỉ-hệ thống ghi

## Trạng thái duyệt

**Đã duyệt** (tự duyệt theo `docs/PROMPT_BUILD_TOAN_BO.md` §2: mọi quyết định đã có ở spec/ADR/chủ dự án 06/11/2026; chủ dự án đồng ý tiêu chí chọn kênh).
