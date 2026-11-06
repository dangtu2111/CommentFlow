# MASTER — toàn bộ tính năng theo thứ tự giai đoạn

> Lập 04/11/2026 (`chore/build-system`) từ `docs/gap-matrix.md` + `docs/16` §3.2 + `docs/05`. Nguồn sự thật về trạng thái chi tiết vẫn là gap matrix; file này là **thứ tự làm và phạm vi từng việc**. Quy trình mỗi việc: `docs/PROMPT_BUILD_TOAN_BO.md` §1 (plan → test trước → `/finish` → **kiểm tra tay** → merge). Chuẩn test: `docs/testing/STANDARD.md`. **Kiểm tra tay dồn:** [`docs/testing/KIEM_TRA_TAY.md`](../testing/KIEM_TRA_TAY.md).

**Cách đọc**
- Mỗi tính năng ≤ 1–2 ngày công (2–4 giờ/ngày); việc lớn đã tách. Đang làm dở mà thấy quá cỡ → tách thêm dòng, không kéo dài.
- **Nhạy cảm:** `S` = cần `verifier-security`, `DB` = cần `verifier-db`, `S+DB` = cả hai, `—` = không (kiểm chứng độc lập chỉ cho diff nhạy cảm, `AGENTS.md`). Quyết định cuối nằm ở plan của việc đó.
- **Ngoài:** có = cần tài nguyên/quyết định ngoài repo (Meta App, Google Cloud, khóa LLM trả phí, tên miền, bộ bình luận thật, Shopify dev store…) → **DỪNG và hỏi chủ dự án** (PROMPT §2). Việc "có" không chặn các việc khác không phụ thuộc nó; chọn việc kế tiếp theo cột Phụ thuộc.
- **Xong-mock (05/11/2026):** việc cần tài nguyên ngoài (cột Ngoài = có) được xây hết sau interface + fixture, flag mặc định TẮT; không còn DỪNG chờ. Cột Ngoài nay nghĩa: cần tài nguyên để **bật đường thật** (xem `docs/CAN_BAN_CUNG_CAP.md`). Ký hiệu: 🧪 Xong-mock · ⛔ Chờ tài nguyên (chưa xây được cả mock, vd. cần quyết định sản phẩm).
- **Trạng thái:** ✅ Xong · 🔧 Đang làm · ⏳ Chưa · ⛔ Chờ ngoài/quyết định.
- US = `docs/04`, UF = `docs/07`, FR = `docs/05`. Cổng giai đoạn: `docs/16` §3, `docs/14` §8 — **dừng chờ chủ dự án xác nhận** ở mỗi cổng.

## Năm việc làm kế tiếp (theo thứ tự)

1. `MEMBER-DIRECT-ADD` — ✅ xong (PR #13)
2. `CONNECTOR-IFACE` — ✅ xong (giao diện connector chung + khai báo khả năng, FR-016)
3. `CH-SCHEMA` — ✅ xong (bảng + RLS, ADR 007)
4. `WH-INGEST` — ✅ webhook (xác minh chữ ký) → job `ingest`, chống trùng, bỏ bình luận của chính Page
5. `INBOX-LIST` — ✅ trang Bình luận (tab, lọc, tìm)

**Bắt buộc trước khi lên staging:** `WEBHOOK-PAYLOAD-RETENTION` (job dọn payload webhook > 14 ngày — ✅ đã làm ở `feat/comment-tombstone`; phải CHẠY trên staging: worker bản mới + `pnpm db:migrate`, kiểm hàng đợi/log "đã dọn payload"), `WORKER-DB-ROLE` (✅ code + test ở `feat/worker-db-role`, ADR 011/migration 0030, chờ chủ dự án duyệt; phải CHẠY trên staging: tạo role `cf_worker` TRƯỚC migrate rồi worker mới — `docs/staging/H5-CHECKLIST.md`; web/`cf_app` không đọc được ciphertext token) — chủ dự án chốt 06/11/2026. Kiểm tra khóa lúc khởi động ở web gắn cùng `FB-OAUTH` (gap `TOKEN-KEY-STARTUP-WEB`).

Kèm theo: chủ dự án đã có Meta App dev (redirect `http://localhost:3000/...`, App ID/Secret ở `.env.local`; hướng dẫn `docs/CAN_BAN_CUNG_CAP.md`) nên `FB-OAUTH` không còn chờ tên miền; vẫn cần **Page thử** khi kiểm tra tay các tính năng gọi Graph API. Chạy E2E cổng 0 lần đầu — chủ dự án.

---

## GĐ0 — Khung dự án & saas-core (✅ xong; còn thủ tục cổng 0)

| Mã | FR | US/UF | Phụ thuộc | Nhạy cảm | Ngoài | Trạng thái |
|---|---|---|---|---|---|---|
| GĐ0-MONOREPO | — (09 §3, CI) | — | — | — | không | ✅ |
| GĐ0-COMPOSE-DEV | — (7 dịch vụ, ADR 001) | — | MONOREPO | — | không | ✅ |
| GĐ0-DB | FR-092 (bảng), 117 (bảng), 118 | — | COMPOSE-DEV | S+DB | không | ✅ |
| GĐ0-AUTH-CORE | FR-001–005 (lõi) | US-001, 005 | DB | S | không | ✅ |
| UI-AUTH | FR-001, 119 | US-001, UF-1 | AUTH-CORE | — | không | ✅ |
| AUTH-2FA | FR-001 (TOTP + mã dự phòng) | US-005 | AUTH-CORE | S | không | ✅ |
| AUTH-SESSIONS-UI | FR-001 (thiết bị) | US-005 | AUTH-2FA | — | không | ✅ (trang tạm) |
| AUTH-RATELIMIT | FR-001 (giới hạn đăng nhập) | — | AUTH-CORE | S | không | ✅ (M1; xô 2FA ở M3 xong) |
| AUTH-FORGOT, AUTH-PWNED | FR-001 | US-001 | AUTH-CORE | S | không | ✅ |
| GĐ0-TENANCY | FR-002–005 | US-001, 004, 006 | AUTH-CORE | S+DB | không | ✅ (trừ `FR-005-COUNT`) |
| AUTH-INVITE | FR-003 | US-004 | TENANCY | S+DB | không | ✅ |
| RLS-ACTOR-CTX | FR-003, 004 (DB) | — | TENANCY | S+DB | không | ✅ |
| GĐ0-FLAGS | FR-117 (mã) | — | DB | S | không | ✅ |
| GĐ0-AI-WRAPPER | FR-034 (lớp bọc) | — | DB | — | không | ✅ |
| GĐ0-QUEUE | — (pg-boss) | — | DB | — | không | ✅ |
| GĐ0-I18N, DESIGN-TOKENS | FR-119 (khung) | — | — | — | không | ✅ |
| LANES | — (song song làn) | — | — | — | không | ✅ |
| E2E-GATE0 | — (cổng 0) | UF-1 | UI-AUTH, TENANCY | — | không | ✅ viết xong; ⛔ chưa chạy trên Chromium (chủ dự án chạy `pnpm e2e` lần đầu) |
| BUILD-SYSTEM | — (MASTER, STANDARD, `test:trace`, coverage) | — | — | — | không | 🔧 nhánh `chore/build-system` |
| **CỔNG 0** | đăng ký → 2FA → workspace → mời Staff → chuyển workspace ở vi + en; RLS chéo xanh; CI xanh | | tất cả trên | | chủ dự án xác nhận | ⛔ chờ `KT-001` + E2E chạy thật |
| META-BIZ-VERIFY | — (Business Verification, Meta App dev, Page thử, IG Business, TikTok API) | — | tên miền (Q6) | — | **có** | ⛔ song song, chủ dự án |

---

## GĐ1 — Kết nối Facebook & inbox

Cổng 1: bình luận thật trên Page thử hiện trong inbox < 1 phút; trả lời và ẩn thành công; không trùng khi webhook gửi lại; token hết hạn → banner đúng.

### 1A. Dọn nền (làm xen kẽ, không chặn nhau)

| Mã | FR | US/UF | Phụ thuộc | Nhạy cảm | Ngoài | Trạng thái |
|---|---|---|---|---|---|---|
| MEMBER-DIRECT-ADD | FR-003 (chỉ `accept_invitation` thêm thành viên) | US-004 | AUTH-INVITE | S+DB | không (đã có đề xuất của verifier; chủ dự án đã chọn hướng) | ✅ |
| MEMBER-LEAVE | FR-003 | US-004 | TENANCY | S+DB | verifier-security + verifier-db | ✅ (`feat/member-leave`, migration 0028) |
| LOG-STAFF-SYSTEM-ROWS | FR-092 | — | TENANCY | S+DB | verifier-security + verifier-db | ✅ (`feat/log-on-behalf-of`, migration 0029) |
| WORKER-DB-ROLE | ADR 007 §2 (token Page), ADR 011 | — | LOG-STAFF-SYSTEM-ROWS | S+DB | verifier-security + verifier-db | 🟡 (`feat/worker-db-role`, migration 0030; chờ duyệt + KT-015) |
| ACTION-LOGS-ACTOR-INDEX | 05 FR-092, 10 §3.1 | — | LOG-STAFF-SYSTEM-ROWS | DB | verifier-db | 🟡 (`feat-action-logs-actor-index`, migration 0032; chờ verifier-db + KT-016) |
| SEND-SWEEP + HIDE-SWEEP | ADR 008, ADR 009 §3 (quét yêu cầu gửi/ẩn kẹt `queued`/`sending` hết thuê; điều kiện trước connector thật) | — | FB-REPLY, FB-HIDE, WORKER-DB-ROLE | S+DB | verifier-security + verifier-db | 🟡 Xong-mock (`feat-send-hide-sweep`, migration 0031; chờ CI + KT-016) |
| CFG-APPNAME | FR-125 (`APP_NAME`, logo, domain, email gửi cấu hình được) | — | — | — | không (tên thật = Q6, dùng giá trị tạm) | ✅ |
| AUTH-CHANGE-PW-UI | FR-001 (đổi mật khẩu + `AUTH-PWNED`) | US-001 | AUTH-2FA | S | không | ✅ (feat-auth-change-pw-ui) |
| AUTH-LANG-PREF | FR-119 (`users.locale` từ Cài đặt) | — | I18N | — | không | 🟡 (`feat-auth-lang-pref`; chờ KT-017) |
| SETTINGS-PAGE | FR-001, 119 (gom bảo mật/ngôn ngữ vào Cài đặt theo Stitch `settings-security`) | US-005 | AUTH-CHANGE-PW-UI, AUTH-LANG-PREF | — | không | 🟡 (`feat-settings-page`: 2FA + phiên + ngôn ngữ xong; đổi mật khẩu/`users.locale` chờ AUTH-CHANGE-PW-UI, AUTH-LANG-PREF; KT-016) |
| AUTH-HARDEN-4a | FR-001 (REDIS_KEY_PREFIX bắt buộc, Zod ở Server Action bảo mật, `checkAdminInsertGuard` chính xác) | — | — | S | không | ✅ `feat-auth-harden-4a` |
| AUTH-HARDEN-4b | FR-001 (`UNIQUE(user_id)` two_factors, test tự seed, cập nhật `docs/10` §3.1 — chờ duyệt spec) | — | — | S+DB | không | ✅ `feat-auth-harden-4b` |
| FLAGS-RECONNECT | FR-117 (LISTEN lùi dần + cảnh báo) | — | FLAGS | — | không | ✅ |
| CLI-PARSEENV | — (CLI qua `parseEnv`) | — | — | — | không | ✅ Xong (`feat-cli-parseenv`; chờ CI) |
| E2E-CI | — (E2E trên CI: Valkey + Mailpit + Chromium) | UF-1 | E2E-GATE0 | — | không | ✅ xanh 6/6 trên CI (nguyên nhân gốc: cookie phiên cũ sau xoay phiên — đã sửa ở fix/2fa-backup-codes) |
| FR-005-SEARCH | FR-005 (ô tìm kiếm của bộ chuyển workspace; số việc cần xử lý tách thành `FR-005-COUNT`) | US-006 | INBOX-LIST | — | không | ✅ (tìm kiếm) |
| TEST-COVERAGE-GAP | — (nâng coverage `saas-core` 41% → 85%, ratchet; 06/11: 63% dòng/53% nhánh) | — | — | — | không | ⏳ (liên tục) |
| TRACE-DEBT | — (xóa dần `trace-baseline.json`: baseline đã về 0 mã, 06/11/2026; không thêm nợ mới) | — | — | — | không | ✅ (`feat-trace-debt`) |

### 1B. Kênh, webhook, inbox

| Mã | FR | US/UF | Phụ thuộc | Nhạy cảm | Ngoài | Trạng thái |
|---|---|---|---|---|---|---|
| CONNECTOR-IFACE | FR-016 (connector khai báo cửa sổ + hành động được phép; `12` §9) | — | — | — | không | ✅ |
| CH-SCHEMA | FR-010 (bảng `channels`, `reply_language`), FR-021 (`webhook_events`), `posts`, `comments` + RLS | — | CONNECTOR-IFACE | S+DB | không | ✅ |
| TOKEN-ENC | FR-010 (mã hóa Page token, 13 §5; khóa theo ADR) | US-002 | CH-SCHEMA | S | không | ✅ |
| WH-INGEST | FR-020 (chữ ký → job `ingest` → 200), FR-021 (chống trùng `(channel_id, external_comment_id)`) | UF-2 | CH-SCHEMA | S | không (fixture đã ghi) | ✅ |
| INGEST-SKIP-OWN | FR-022 (bỏ bình luận của chính Page, gồm câu AI gửi) | UF-2 | WH-INGEST | — | không | ✅ một phần (bỏ theo `from.id == page_id` ở WH-INGEST; còn bỏ câu do AI gửi khi có `FB-REPLY`) |
| INBOX-LIST | FR-040 (tab trạng thái, lọc, tìm, sắp xếp) | US-010, UF-3 | CH-SCHEMA | — | không | ✅ (danh sách + tab + tìm/lọc/sắp xếp; còn: chi tiết, nhãn AI, giao việc, sidebar — xem gap) |
| INBOX-DETAIL-LOCK | FR-041 (khóa mềm `locked_until`, cảnh báo người thứ hai) | US-013 | INBOX-LIST | — | không | ✅ (chi tiết + khóa 2 phút; hành động Gửi/Ẩn/Bỏ qua ở `FB-REPLY`/`FB-HIDE`) |
| FB-OAUTH | FR-010 (Facebook Login for Business, liệt kê Page, chọn trong giới hạn gói, đăng ký webhook) | US-002, UF-1 | TOKEN-ENC | S | **có** — Page thử (Meta App dev đã có; redirect localhost; xem `docs/CAN_BAN_CUNG_CAP.md`) | ✅ Xong-mock (feat/fb-oauth; chưa thử Page thật — KT-014; cờ `FB_OAUTH_ENABLED` tắt) |
| CH-STATUS-BANNER | FR-012 (connected / token_expired / disconnected; banner Kết nối lại) | US-002 | FB-OAUTH | — | không | ✅ (banner theo trạng thái kênh; nút "Kết nối lại" chờ FB-OAUTH — gap `CH-RECONNECT-ACTION`) |
| FB-BACKFILL | FR-011 (lấy bình luận cũ 3/7/30 ngày khi kết nối) | US-002 | FB-OAUTH, WH-INGEST | — | **có** — Page thử | ✅ Xong-mock phần lõi (feat-polling-backfill: `backfillChannel` 3/7/30 ngày; nút chọn ngày khi kết nối = gap `FB-BACKFILL-UI`) |
| FB-REPLY | FR-042 (gửi trả lời tay; thành công/lỗi + lý do; timeout kiểm lại) | US-011, 016, UF-3 | FB-OAUTH, INBOX-DETAIL-LOCK | S (dùng token) | **có** — Page thử | ✅ backend (outbox + job `send` + `sendRecheck`, test bằng connector giả — feat/reply-backend); + giao diện hộp soạn/Gửi/Thử lại (feat/reply-ui); connector Facebook (hợp đồng + fixture) xong ở feat/fb-connector (ADR 010); đăng ký vào worker **Xong-mock** (feat/fb-connector-register: cờ `FB_CONNECTOR_ENABLED` tắt mặc định, `findExistingReply` theo cha); còn Page thử (KT-016) |
| FB-RETRY-UI | FR-042 (Gửi lỗi + Thử lại, lý do dễ hiểu) | US-016 | FB-REPLY | — | không | ✅ (cùng feat/reply-ui: lý do dễ hiểu + Thử lại; thử lại có kiểm trước) |
| FB-HIDE | FR-044 (ẩn/bỏ ẩn `is_hidden`, không có xóa) | US-015 | FB-REPLY | — | **có** — Page thử | ✅ (feat/fb-hide, connector giả; thử Page thật: KT-010) |
| COMMENT-EDIT-DELETE | FR-048 (bình luận sửa → cập nhật; xóa → ẩn khỏi inbox, giữ log) | — | WH-INGEST | — | không | ✅ (feat/comment-sync: sửa → cập nhật nội dung; xóa → `deleted_at` ẩn khỏi inbox; còn phân loại lại sau sửa) |
| POLLING-BACKFILL | FR-023 (polling bù sót; cảnh báo webhook im lặng) | UF-2 | FB-OAUTH, WH-INGEST | — | **có** — Page thử | ✅ Xong-mock (feat-polling-backfill; cờ `POLLING_ENABLED` tắt; chờ `POLLING-CHANNEL-LIST` — KT-016) |
| ATTACHMENTS-STORE | FR-143 (lưu loại + link tệp đính kèm) | — | CH-SCHEMA | DB | không | ✅ (feat-attachments-store, migration 0035) |
| ADS-POSTS-LIST | FR-123 (bài quảng cáo/dark post của Page + bài thường) | — | FB-OAUTH | — | **có** — Meta App | ⛔ |
| LOG-PAGE | FR-092 (trang Nhật ký: lọc, trước/sau, Staff chỉ thấy của mình) | — | GĐ0-DB | DB | không | ✅ (`/app/activity`: danh sách + lọc tác nhân/hành động/ngày + trước/sau; Staff chỉ của mình ép ở truy vấn VÀ ở RLS từ migration 0028 — gap `LOG-RLS-STAFF` ✅) |
| STAGING-DB-LOOPBACK | — (Postgres staging chỉ `127.0.0.1:5434` cho runner migrate) | — | STAGING-MIGRATE | S | không | ✅ (`feat/staging-db-loopback`; còn chủ dự án deploy compose staging) |
| STAGING-H5-H6 | — (H5 web staging; H6 che `/invite/*` trong log) | — | STAGING-DEPLOY | S | **có** — tên miền (hoãn) | ⛔ |
| **CỔNG 1** | xem đầu mục GĐ1 | | tất cả 1B | | chủ dự án xác nhận | ⏳ |

---

## GĐ2 — AI gợi ý & kiến thức ⚠️

Cổng 2: **≤ $2 / 1.000 lượt** trên bộ đánh giá; mọi nhóm ngôn ngữ đạt `14` §4.2; **0 sai giá**.

### 2A. Cơ sở kiến thức

| Mã | FR | US/UF | Phụ thuộc | Nhạy cảm | Ngoài | Trạng thái |
|---|---|---|---|---|---|---|
| KB-SCHEMA | FR-050, 055 (bảng `kb_*`, `kb_versions`, `kb_chunks` có `halfvec`) | US-003 | CH-SCHEMA | DB | không | ✅ (feat/kb-schema; HNSW + chỉ mục `embedding_model` ở KB-EMBED-COL (xong)) |
| KB-SHOP-POLICY-FAQ | FR-050 (thông tin shop, chính sách, FAQ, giọng văn theo ngôn ngữ, quy tắc) | US-003, UF-1 | KB-SCHEMA | — | không | ✅ (feat-kb-shop-policy-faq, migration 0036: `shop_profiles`/`policy_items`/`faq_items`/`brand_voice` + `@flow/shared` kiểm đầu vào + `queries/kb-content.ts`; giao diện → `KB-CONTENT-UI`, phạm vi kênh → `KB-SCOPE-CHANNEL`) |
| PRODUCTS-VARIANTS | FR-129 (`products`, `product_variants`, `products.rev`), FR-056 (giá/tồn không vào vector), FR-058 (thẻ sản phẩm) | US-101 | KB-SCHEMA | DB | không | ✅ (feat-products-variants, migration 0034) |
| PRODUCT-ALIAS | FR-128 (bí danh sản phẩm) | US-100 | PRODUCTS-VARIANTS | DB | không | Xong-mock (feat-product-alias, migration 0043, Q-PA1; còn API/UI tab Bí danh, gợi ý chờ xác nhận, nối pipeline) |
| SIZE-TABLE | FR-149 (bảng size có cấu trúc) | US-102 | PRODUCTS-VARIANTS | DB | không | Xong-mock (feat-size-table, migration 0044, Q-ST1; còn API/UI "Bảng size", nối pipeline) |
| ABBREV-DICT | FR-025 (từ điển viết tắt: hệ thống + workspace) | — | KB-SCHEMA | — | không | ✅ Xong-mock (feat-abbrev-dict, migration 0041; chưa nối pipeline/giao diện) |
| KB-IMPORT-EXCEL | FR-051 (Excel/CSV: tải → khớp cột → xem lỗi → xác nhận) | US-003 | PRODUCTS-VARIANTS | — | không | ✅ Xong (feat-kb-import-excel, Q-KBIX1, không migration; parse đồng bộ trong web → KB-IMPORT-EXCEL-WORKER; KT-KBIX) |
| KB-PUBLISH-VERSION | FR-054 (nháp → xuất bản → khôi phục), UF-8 | US-035 | KB-SHOP-POLICY-FAQ | — | không | ✅ Xong-mock (feat-kb-publish-version, Q-KPV1; con trỏ phiên bản/snapshot nguồn/hạ nhãn → gap matrix) |
| KB-TESTSET | FR-054 (bộ câu kiểm thử trước khi xuất bản) | US-034 | KB-PUBLISH-VERSION | — | không | ✅ Xong-mock (feat-kb-testset, Q-KTS1; bộ câu chạy tay, chưa lưu/chặn Xuất bản → gap `KB-TESTSET-PERSIST`, cần migration làn b) |
| KB-CHUNKING | FR-055, 130 (cắt đoạn, `context_header`, `content_hash`), FR-131 (hạn hiệu lực) | — | KB-SCHEMA | DB | không | ✅ Xong-mock (feat-kb-chunking; embedding thật → KB-EMBED-LITELLM) |
| KB-SEARCH-FTS | FR-057 (toàn văn `simple`+`unaccent`/`english`, `pg_trgm`), FR-127 (gần đúng), FR-135 (cache không trả giá cũ: `product_revs`) | US-100 | KB-CHUNKING, PRODUCTS-VARIANTS | DB | không | Xong-mock (feat-kb-search-fts, migration 0037; embedding bản fixture, còn bí danh/rerank/ngưỡng/trần token → PIPE-RETRIEVE) |
| RETRIEVAL-LOG | FR-134 (`retrieval_logs`, kb_gaps) | US-106, UF-11 | KB-SEARCH-FTS | DB | không | ✅ Xong (feat-retrieval-log, migration 0040; chưa có nơi ghi → `RETRIEVAL-LOG-WIRE`; `test:db` chạy ở CI) |
| KB-TRYAI | FR-059 (ô Thử AI hiện đoạn tìm được + điểm) | US-034 | KB-SEARCH-FTS | — | không | ✅ Xong-mock (feat-kb-tryai, Q-KTA1; cờ `TRY_AI_KB_REAL` TẮT; còn `TRY-AI-REAL`) |
| KB-SAMPLES | FR-132 (câu mẫu của shop, đã che PII) | — | RETRIEVAL-LOG | S (PII) | không | 🟡 Xong-mock (`feat-kb-samples`; lõi + kho bộ nhớ, bảng/API/UI → `KB-SAMPLES-PERSIST` cần migration làn b; KT-KSM) |
| KB-EMBED-COL | FR-133 (cột `embedding_model`; job tạo lại làm ở GĐ5), FR-139 (cột `halfvec(1024)` + HNSW) | — | KB-SCHEMA | DB | không | ✅ (feat-kb-embed-col, migration 0042; job tạo lại → GĐ5) |
| GSHEETS-LINK | FR-121 (Google Sheets liên kết + đồng bộ định kỳ) | US-003 | KB-IMPORT-EXCEL | S (OAuth) | **có** — Google Cloud | ⛔ |
| KB-INJECTION-GUARD | FR-164 (chống cài lệnh qua kiến thức nhập vào) | — | KB-CHUNKING | S | không | ✅ Xong-mock (feat-kb-injection-guard; duyệt/xuất bản → KB-INJECTION-REVIEW, KB-PUBLISH) |

### 2B. Bài viết, gợi ý, giao diện

| Mã | FR | US/UF | Phụ thuộc | Nhạy cảm | Ngoài | Trạng thái |
|---|---|---|---|---|---|---|
| POSTS-LIST | FR-060 (danh sách bài, lọc, gắn/chưa gắn) | US-032, UF-7 | CH-SCHEMA | — | không | ✅ (danh sách + lọc nền tảng/kênh/loại + tìm + sắp xếp + phân trang; còn lọc gắn/chưa gắn — cần `post_products`, xem gap `POSTS-LIST-LINK-FILTER`) |
| POSTS-LINK-PRODUCT | FR-061 (gắn nhiều sản phẩm, sản phẩm chính, gắn hàng loạt; AI gợi ý cần xác nhận) | US-032 | POSTS-LIST, PRODUCTS-VARIANTS | — | không | ⏳ |
| POST-NOTES | FR-062 (ghi chú có hạn; ghi đè chế độ tự động theo bài) | US-033 | POSTS-LIST | DB | không | Xong-mock (feat-post-notes, migration 0045, Q-PN1; còn API/UI, nối `DATA-PRIORITY` và cổng tự gửi) |
| DATA-PRIORITY | FR-063 (thứ tự ưu tiên dữ liệu khi trả lời) | — | POST-NOTES, KB-SEARCH-FTS | — | không | ⏳ |
| SUGGEST-UI | FR-043 (lưu bản AI và bản gửi; đổi nhãn ghi lại), chip nguồn | US-011, 012, 014 | PIPE-DRAFT, INBOX-DETAIL-LOCK | — | không | 🟡 Xong-mock phần không cần cột mới (`feat-suggest-ui`; còn `SUGGEST-UI-PERSIST` cần bảng `drafts` — làn b; KT-SUI) |
| BULK-ACTIONS | FR-045 (Bỏ qua, Ẩn có xác nhận, Đổi nhãn; không gửi hàng loạt) + phím tắt | US-010 | INBOX-LIST, FB-HIDE | — | không | ✅ (feat/bulk-actions) |
| INBOX-MOBILE | FR-040 (Bình luận trên mobile 390px) | US-010 | INBOX-LIST | — | không | ✅ (feat-inbox-mobile; còn Playwright 390px, KT-016) |
| REPLY-LANG-SETTING | FR-120 (cài `reply_language`/xưng hô), FR-142 (xưng hô shop/khách) | US-104, 036 | KB-SHOP-POLICY-FAQ | — | không | 🟡 (`feat-reply-lang-ui`: `reply_language` theo kênh xong; xưng hô chờ `brand_voice` → gap `REPLY-ADDRESS-UI`) |
| AI-READINESS | FR-146 (thanh Độ sẵn sàng của AI, yêu cầu tối thiểu onboarding) | US-107 | KB-SHOP-POLICY-FAQ, PRODUCTS-VARIANTS | — | không | Xong-mock (feat-ai-readiness, không migration; lưu `readiness_checks` → AI-READINESS-PERSIST làn b; KT-AR) |
| KB-GAPS-UI | FR-134 (danh sách câu AI chưa trả lời + bổ sung kiến thức), UF-11 | US-106 | RETRIEVAL-LOG | — | không | ✅ Xong-UI (feat-kb-gaps-ui, Q-KG1; còn mở đúng mục KB → KB-CONTENT-UI) |

### 2C. Pipeline AI (lọc → nhận ngôn ngữ → cache → phân loại → tìm → soạn → kiểm)

| Mã | FR | US/UF | Phụ thuộc | Nhạy cảm | Ngoài | Trạng thái |
|---|---|---|---|---|---|---|
| PIPE-RULE-FILTER | FR-024 (emoji/sticker/tag → Bỏ qua, không trừ lượt) | — | WH-INGEST | — | không | ✅ Xong (lõi hàm thuần; chưa nối pipeline) |
| PIPE-NORMALIZE-LANG | FR-025 (NFC, viết thường, viết tắt), FR-120 (nhận vi/en), FR-159 (ngôn ngữ khác → `other`) | US-036 | ABBREV-DICT | — | không | ✅ Xong-mock (lõi hàm thuần; từ điển + lingua qua interface; chưa nối pipeline) |
| PII-MASK-PIPE | FR-033 (che SĐT/email trước LLM/Langfuse; lưu số vào Khách tiềm năng trước khi che) | — | PIPE-NORMALIZE-LANG | S | không | 🟡 Xong-mock (`feat-pii-mask-pipe`; hàm thuần, chưa nối pipeline/DB; KT-PMP) |
| PIPE-CACHE-EXACT | FR-026 (khớp chính xác; khóa chứa `workspace_id`, bài, `kb_version`, `product_revs`) | — | KB-SEARCH-FTS | S+DB | không | ✅ Xong-mock (`feat-pipe-cache-exact`, không cần migration; Redis thật nối ở PIPE-ORCHESTRATOR; KT-PCX) |
| PIPE-CLASSIFY-EXTRACT | FR-027 (6 nhãn bằng model nhỏ), FR-145 (`labels[]`), FR-162 (một bước `extract`) | US-100–103 | PII-MASK-PIPE, AI-WRAPPER | — | **có** — khóa LLM trả phí | 🟡 Xong-mock (`feat-pipe-classify-extract`; cờ `CLASSIFY_LLM_ENABLED` tắt; chưa có nhánh ml; KT-030) |
| PIPE-REWRITE-CTX | FR-137 (viết lại câu hỏi theo ngữ cảnh), FR-144 (nhớ 5 lượt gần nhất) | — | PIPE-CLASSIFY-EXTRACT | — | không | 🟡 Xong-mock (`feat-pipe-rewrite-ctx`; cờ `REWRITE_LLM_ENABLED` tắt; chưa nối pipeline; KT-034) |
| PIPE-ROUTE | FR-136 (định tuyến theo ý định: giá/size/màu/tồn → tra DB) | US-101 | PIPE-CLASSIFY-EXTRACT, PRODUCTS-VARIANTS | — | không | ✅ (lõi hàm thuần, `feat-pipe-route`; ghi `retrieval_logs.route` chờ bảng; KT-PR) |
| PIPE-RETRIEVE | FR-028 (tìm kiến thức cho nhãn cần trả lời; Khiếu nại không soạn) | — | KB-SEARCH-FTS, PIPE-ROUTE | — | không | 🟡 Xong-mock (lõi + cổng `retrieveKnowledge`, `feat-pipe-retrieve`; embedder fixture; còn rerank/ghi chú bài/`retrieval_logs`/nối pipeline; KT-RT) |
| PIPE-DRAFT | FR-029 (JSON `{reply, lang, sources[], needs_human, reason}`), FR-138 (prompt caching), FR-140 (`claims[]` trích nguồn từng ý), FR-142 (xưng hô) | US-011, 012 | PIPE-RETRIEVE | — | **có** — khóa LLM | 🟡 Xong-mock (`feat-pipe-draft`; cờ `DRAFT_LLM_ENABLED` tắt; nguồn là đầu vào, chờ PIPE-RETRIEVE nối; KT-031) |
| PIPE-GUARD-MONEY | FR-030 (mọi số tiền/%/ngày/SĐT/link phải có trong nguồn — kiểm bằng code) | US-103 | PIPE-DRAFT | S | không | ✅ (lõi; nối pipeline ở PIPE-DRAFT) |
| PRICE-SNAPSHOT | FR-111 (lưu `drafts.price_snapshot` khi soạn) | US-045 | PIPE-GUARD-MONEY | S+DB | không | Xong-mock (feat-price-snapshot, migration 0046, Q-PS1; còn nối pipeline soạn + job gửi) |
| PIPE-CONFIDENCE | FR-163 (độ tin cậy do code tính), FR-032 (kết quả không đọc được → 0, chuyển người) | US-041 | PIPE-DRAFT | S | không | ✅ (lõi hàm thuần, `feat-pipe-confidence`; nối cổng 5 ở AUTO-SEND-GATE; KT-PC) |
| PIPE-DECIDE-ACTION | FR-147 (`decideAction`: trả lời/hỏi lại/chuyển hướng/chuyển người), FR-141 (gợi ý một phần, không tự tính) | UF-2b | PIPE-CONFIDENCE | S | không | ✅ (lõi hàm thuần, `feat-pipe-decide-action`; cờ rủi ro chờ `DA-RULES-*`; nối pipeline/cổng ở AUTO-SEND-GATE; KT-DA) |
| DA-RULES-PRICE | FR-150 (lệch giá quảng cáo ↔ kho → chuyển người), FR-158 (khoảng giá khi chưa rõ biến thể) | US-108 | PIPE-DECIDE-ACTION | S | không | ✅ lõi thuần (feat-da-rules-price); lưu DB → `DA-RULES-PRICE-DB` |
| DA-RULES-STOCK | FR-151 (độ tươi tồn kho), FR-157 mẫu ngưng/hết hàng (phần gợi ý; tự gửi ở GĐ4) | — | PIPE-DECIDE-ACTION | — | không | ✅ lõi thuần (feat-da-rules-stock); nối DB/pipeline → `DA-RULES-STOCK-WIRE` |
| DA-RULES-ORDER-HOURS | FR-153 (hỏi đơn hàng → chuyển hướng + chuyển người), FR-152 (câu mời theo giờ làm việc) | — | PIPE-DECIDE-ACTION | — | không | ✅ lõi thuần (feat-da-rules-order-hours, Q-DROH1; nối giờ làm việc DB/pipeline → `DA-RULES-ORDER-HOURS-WIRE`; KT-DROH) |
| DA-RULES-LEGAL | FR-160 (cam kết pháp lý/uy tín bắt buộc có nguồn) | — | PIPE-DECIDE-ACTION | S | không | ⏳ |
| DA-HANDOFF-RULES | FR-143 (quy tắc chuyển người cho ảnh/video/sticker kèm chữ) | — | ATTACHMENTS-STORE, PIPE-DECIDE-ACTION | — | không | ✅ lõi thuần (feat-da-handoff-rules); nối pipeline → `DA-HANDOFF-WIRE` |
| PIPE-VARIATION | FR-161 (đa dạng diễn đạt, giữ nguyên nội dung) | US-105 | PIPE-DRAFT | — | không | ✅ Xong-mock (lõi hàm thuần, `feat-pipe-variation`; còn `VARIATION-WIRE`: Redis `…:recent` + ghi `drafts.variants`, và `VARIATION-NAME`: chèn tên khách) |
| PIPE-MERGE-BURST | FR-148 (gộp bình luận liên tiếp < 30 giây) | US-109 | WH-INGEST | — | không | ✅ Xong (lõi hàm thuần; ghi `merged_into_id` chờ migration làn b) |
| PIPE-CACHE-SEMANTIC-STUB | FR-026 (semantic cache LiteLLM — cấu hình tối thiểu; phần đầy đủ ở GĐ5) | — | PIPE-CACHE-EXACT | — | không | ⏳ |

### 2D. Hạn mức, chi phí, đánh giá

| Mã | FR | US/UF | Phụ thuộc | Nhạy cảm | Ngoài | Trạng thái |
|---|---|---|---|---|---|---|
| USAGE-COUNTERS | FR-090 (`usage_counters`, hạn mức, chặn 100%) | US-060 | GĐ0-AI-WRAPPER | S+DB | không | ✅ (feat-usage-counters, migration 0039; chưa nối pipeline AI → `USAGE-GATE-PIPE`; `test:db` chạy ở CI) |
| USAGE-METER-UI | FR-090 (đồng hồ lượt, cảnh báo 80%) | US-060 | USAGE-COUNTERS | — | không | ✅ (feat-usage-meter-ui, Q-UMU1; hạn mức tạm env `AI_TURNS_PLAN_LIMIT`, múi giờ cố định — gói thật + timezone ở `PLANS-SCHEMA`, nút mua/nâng gói ở `TRIAL-UPGRADE-UI`) |
| AI-VIRTUALKEY | FR-034 (khóa ảo LiteLLM theo workspace, ngân sách riêng) | — | USAGE-COUNTERS | S | **có** — khóa LLM | ⛔ |
| AI-TRY-BOX-UI | FR-059 + FR-029 (Thử AI chạy cả pipeline, không trừ lượt) | US-034 | PIPE-DRAFT | — | không | ✅ Xong-mock (`feat-ai-try-box-ui`; còn `TRY-AI-REAL`: KB/LLM thật, bộ đếm bền, E2E; KT-ATB) |
| EVAL-SET-REAL | FR-165 (~300 bình luận thật đã che PII; mỗi mẫu có hành động đúng) | — | — | S (PII) | **có** — chủ dự án cung cấp | ⛔ |
| EVAL-RUNNER | FR-120 (bộ đánh giá 4 nhóm ngôn ngữ), FR-165, `14` §4 (promptfoo, chạy CI) | — | EVAL-SET-REAL, PIPE-DECIDE-ACTION | — | **có** — khóa LLM; cài promptfoo (nêu giấy phép) | ⛔ |
| COST-GATE | — (đo ≤ $2/1.000 lượt từ `ai_usage`) | — | EVAL-RUNNER | — | không | ⏳ |
| AUTH-2FA-RECOVERY | FR-001 (khôi phục khi mất điện thoại + mã dự phòng) | US-005 | AUTH-2FA | S | **có** — quyết định sản phẩm | ⛔ |
| **CỔNG 2** | xem đầu mục GĐ2 | | tất cả 2A–2D | | chủ dự án xác nhận | ⏳ |

---

## GĐ3 — Thanh toán, Admin, triển khai

Cổng 3: chạy trên staging 7 ngày với bình luận thật; 0 sai giá; luồng QR trọn; endpoint xóa dữ liệu trả mã xác nhận; khôi phục sao lưu thành công.

| Mã | FR | US/UF | Phụ thuộc | Nhạy cảm | Ngoài | Trạng thái |
|---|---|---|---|---|---|---|
| PLANS-SCHEMA | FR-090 (gói cước, dùng thử, mua thêm lượt: bảng `plans`/`subscriptions`) | US-060, UF-9 | USAGE-COUNTERS | S+DB | **có** — bảng giá | ⛔ |
| TRIAL-UPGRADE-UI | FR-090 (dùng thử, nâng gói, mua thêm) | US-060 | PLANS-SCHEMA | S | không | ⏳ |
| QR-PAYMENT | FR-091 (QR + nội dung định danh; chờ xác nhận) | US-061, UF-9 | PLANS-SCHEMA | S+DB | **có** — tài khoản nhận tiền | ⛔ |
| INVOICES | FR-091 (lịch sử hóa đơn, thông tin xuất hóa đơn) | US-061 | QR-PAYMENT | S | không | ⏳ |
| ADMIN-SHELL | FR-100 khung, FR-118; `AUTH-ADMIN-SESSION` (phiên 8 giờ, role DB Admin) | US-081 | AUTH-2FA | S+DB | không | ⏳ |
| ADMIN-OVERVIEW | FR-100 (MRR, workspace theo trạng thái, chi phí AI, lãi gộp) | US-081 | ADMIN-SHELL | — | không | ⏳ |
| ADMIN-WORKSPACES | FR-101 (bảng + chi tiết, gia hạn dùng thử, cộng lượt, đổi gói, tạm khóa, trần chi phí) | US-081 | ADMIN-SHELL | S | không | ⏳ |
| ADMIN-PAYMENTS | FR-102 (xác nhận chuyển khoản, cảnh báo lệch tiền) | US-080 | QR-PAYMENT, ADMIN-SHELL | S | không | ⏳ |
| ADMIN-AI-COST | FR-103 (chi phí AI phân rã; cấu hình model, phiên bản prompt) | US-081 | ADMIN-SHELL | — | không | ⏳ |
| ADMIN-FLAGS | FR-117 (trang Feature flags: override, kill switch, theo gói, rollout %; nhật ký) | US-085 | ADMIN-SHELL, FLAGS | S | không | ⏳ |
| META-DATA-DELETE | FR-093 (callback xóa dữ liệu Meta: signed request → mã xác nhận) + trang tra cứu | US-070, UF-10 | CH-SCHEMA | S | **có** — Meta App | ⛔ |
| DATA-EXPORT | FR-094 (xuất dữ liệu workspace) | US-071 | GĐ0-DB | S+DB | không | ⏳ |
| WORKSPACE-DELETE | FR-094 (xóa workspace nhiều bước), `DB-MAINTENANCE-ROLE` | US-071 | DATA-EXPORT | S+DB | không | ⏳ |
| RETENTION-JOB | FR-126 (12 tháng; `ai_usage` gộp 90 ngày) | — | DB-MAINTENANCE-ROLE | S+DB | không | ⏳ |
| PUBLIC-PAGES | FR-125 (landing, chính sách quyền riêng tư, điều khoản, DPA) | — | CFG-APPNAME | — | **có** — tên miền (Q6), pháp lý | ⛔ |
| ONBOARDING-WIZARD | FR-146 (wizard 5 bước, điều kiện sẵn sàng AI) | UF-1 | AI-READINESS, FB-OAUTH | — | không | ⏳ |
| PRICE-QUOTE-MENTION | FR-150 (khách nhắc giá khác giá kho) | US-108 | DA-RULES-PRICE | S | không | ⏳ |
| DB-BOOTSTRAP | — (extension/role cho staging) | — | — | DB | không | ⏳ |
| QUEUE-PROD-INSTALL | — (cài pg-boss cho staging/production, CI có duyệt tay) | — | STAGING-DEPLOY | S+DB | không | ⏳ |
| STAGING-DEPLOY | — (compose `cf-staging`, Dockerfile web/worker, runner, Cloudflare Tunnel) | — | PUBLIC-PAGES | S | **có** — tên miền + VPS | 🟡 khung xong (chore/h5-staging-prep), chưa chạy — `docs/staging/H5-CHECKLIST.md` |
| BACKUP-RESTORE | — (sao lưu hằng ngày + thử khôi phục) | — | STAGING-DEPLOY | DB | **có** — VPS | ⛔ |
| MONITORING | — (theo dõi lỗi + uptime) | — | STAGING-DEPLOY | — | **có** — dịch vụ ngoài | ⛔ |
| PILOT-REAL-PAGE | — (chạy thử 1–3 shop thật, 7 ngày) | — | tất cả trên | — | **có** — shop thử | ⛔ |
| **CỔNG 3** | xem đầu mục GĐ3 | | tất cả GĐ3 | | chủ dự án xác nhận | ⏳ |

---

## GĐ4 — Tự động hóa, Instagram, Shopify

Cổng 4: unit test 11 cổng + R1–R9 + test đua xanh; AI tự gửi an toàn trên Page thử (Chạy thử ≥ 50 mẫu, tỷ lệ sửa ≤ 10%); bình luận Instagram vào inbox và trả lời được; đối soát 7 đêm không lỗi; App Review đã nộp.

| Mã | FR | US/UF | Phụ thuộc | Nhạy cảm | Ngoài | Trạng thái |
|---|---|---|---|---|---|---|
| AUTO-SEND-GATE | FR-031 (11 cổng theo `09` §6, AI chỉ thêm điều kiện "cần duyệt"), FR-141 (tự gửi một phần) | US-040, UF-5 | PIPE-DECIDE-ACTION | S | không | ✅ (lõi hàm thuần `decideAutoSend`, `feat-auto-send-gate`; nối pipeline/`automation_settings`/`automation_events` ở AUTO-MATRIX-UI + PIPE-ROUTE; Stryker → `MUTATION-STRYKER`; KT-ASG) |
| SEND-RECHECK | FR-110 (R1–R9 ngay trước khi gọi API; bị chặn → lý do hiển thị) | US-045 | AUTO-SEND-GATE, FB-REPLY | S | không | ✅ (lõi hàm thuần `sendRecheck` + job `send` gọi R1–R3/R9, lý do `recheck:R1–R9` vi/en, Stryker 95,2% — `feat-send-recheck`; dữ liệu thật R4–R8 cho tự gửi → `SEND-RECHECK-WIRE`; KT-SR) |
| AUTO-MATRIX-UI | FR-070 (Tắt/Chạy thử/Tự động theo kênh × nhãn), FR-071 (ngưỡng, khoảng trễ, giới hạn/ngày, giờ hoạt động, từ khóa chặn, chữ ký) | US-040, UF-5 | AUTO-SEND-GATE | S | không | ⏳ |
| AUTO-DELAY-CANCEL | FR-071 (khoảng trễ có hủy) | US-042 | AUTO-MATRIX-UI | S | không | ⏳ |
| AUTO-CALIBRATION | FR-072 (50/10%/15/0,80; đề xuất kèm lý do), FR-163 (hiệu chuẩn độ tin cậy) | US-041 | AUTO-MATRIX-UI | S | không | ⏳ |
| EMERGENCY-STOP | FR-073 (dừng khẩn cấp toàn workspace) | US-043 | AUTO-MATRIX-UI | S | không | ⏳ |
| AUTO-PAUSE | FR-073 (tự tạm dừng khi bất thường) | US-044 | EMERGENCY-STOP | S | không | ⏳ |
| AI-SENT-HISTORY | FR-075 (lịch sử AI đã gửi + Đánh dấu sai) | US-040 | AUTO-SEND-GATE | — | không | ✅ Xong-mock (feat-ai-sent-history; phần DB ở AI-SENT-HISTORY-DB) |
| AUTOSEND-LANG-PARTIAL | FR-120 (tự gửi theo ngôn ngữ), FR-147 (tự gửi hỏi lại/chuyển hướng) | — | AUTO-SEND-GATE | S | không | ⏳ |
| RATE-LIMIT-PAGE | FR-114 (giới hạn gửi theo Page/bài/nội dung lặp; mức dùng Meta App) | — | SEND-RECHECK | S | không | ⏳ |
| ABUSE-JOB | FR-115 (phát hiện lạm dụng: Đánh dấu sai, câu bị xóa, lỗi 368, tăng đột biến) | — | AI-SENT-HISTORY | S | không | ⏳ |
| ADMIN-SEND-LOCK | FR-116 (Admin tạm khóa gửi; trang Sức khỏe Meta App) | US-084 | ADMIN-SHELL, ABUSE-JOB | S | không | ⏳ |
| DA-HOLDER | FR-154 (người đang giữ chuỗi — AI không chen) | US-110 | AUTO-SEND-GATE | S | không | ⏳ |
| DA-IMPERSONATION | FR-155 (chống mạo danh Page/shop) | US-111 | AUTO-SEND-GATE | S | không | ⏳ |
| DA-ORDER-IN-COMMENT | FR-156 (đặt hàng trong bình luận → Khách tiềm năng), FR-157 (mẫu ngưng/hết hàng khi tự gửi) | US-112 | LEADS-KANBAN | S (PII) | không | ⏳ |
| SPAM-RULES | FR-080 (quy tắc spam, xem trước số bình luận khớp 7 ngày) | US-050 | INBOX-LIST | — | không | ✅ Xong-mock (feat-spam-rules, Q-SPR1: xem trước thật; Lưu chờ bảng `rules` — làn b, `SPAM-RULES-DB`) |
| AUTO-HIDE | FR-081 (Tự ẩn SĐT/link sau khi chạy đánh dấu; lưu khách trước khi ẩn); **AI không tự ẩn** | US-050, UF-4 | SPAM-RULES, FB-HIDE | S | không | ⏳ |
| LEADS-KANBAN | FR-082 (Khách tiềm năng: trích SĐT/địa chỉ/sản phẩm, Kanban, giao người) | US-051 | PII-MASK-PIPE | S (PII) | không | ⏳ |
| LEADS-EXPORT | FR-082 (xuất Excel/CSV) | US-051 | LEADS-KANBAN | S (PII) | không | ⏳ |
| IG-CONNECTOR | FR-013 (bình luận Instagram: đọc, trả lời, ẩn; cùng Meta App) | UF-2 | CONNECTOR-IFACE, FB-OAUTH | S | **có** — IG Business thử | ⛔ |
| SHOPIFY-IMPORT | FR-052 (chỉ đọc sản phẩm/biến thể/giá/tồn/chính sách), FR-122 (nguồn Shopify) | US-030 | PRODUCTS-VARIANTS | S (OAuth) | **có** — Shopify dev store | ⛔ |
| SHOPIFY-RECONCILE | FR-112 (đối soát hằng đêm + Đối soát ngay), FR-113 (kiểm/đăng ký lại webhook) | US-046 | SHOPIFY-IMPORT | S | **có** — Shopify dev store | ⛔ |
| POLICY-URL-IMPORT | FR-053 (nhập link website, tôn trọng robots.txt), FR-055 (đồng bộ nguồn, `content_hash`) | US-031 | KB-CHUNKING | S (chống SSRF) | không | ⏳ |
| ADMIN-INTEGRATION-HEALTH | FR-104 (sức khỏe tích hợp, hàng đợi & dead letter) | US-083 | ADMIN-SHELL | — | không | ⏳ |
| OAUTH-TOKEN-ENC | — (mã hóa `accounts.*token` khi bật OAuth, 13 §5) | — | TOKEN-ENC | S+DB | không | ⏳ |
| APP-REVIEW-DOSSIER | — (hồ sơ App Review Facebook + Instagram) | — | IG-CONNECTOR, PUBLIC-PAGES | — | **có** — Meta | ⛔ |
| **CỔNG 4** | xem đầu mục GĐ4 | | tất cả GĐ4 | | chủ dự án xác nhận | ⏳ |

---

## GĐ5 — TikTok, tin nhắn, mở rộng

Cổng: theo từng tính năng (`docs/14` §8).

| Mã | FR | US/UF | Phụ thuộc | Nhạy cảm | Ngoài | Trạng thái |
|---|---|---|---|---|---|---|
| TIKTOK-CONNECTOR | FR-015 (đọc + trả lời bình luận; ẩn chỉ khi có API) | — | CONNECTOR-IFACE | S | **có** — quyền TikTok (Q5) | ⛔ |
| MESSENGER-WEBHOOK | FR-014 (webhook `messages`, gửi trong cửa sổ) | UF-6 | FB-OAUTH | S | **có** — Meta App Review | ⛔ |
| IG-DM | FR-013 (tin nhắn Instagram) | UF-6 | IG-CONNECTOR | S | **có** — Meta | ⛔ |
| MSG-INBOX | FR-047 (hội thoại: cửa sổ 24 giờ/7 ngày, AI theo hội thoại, tối đa lượt AI, chuyển người) | US-020–023 | MESSENGER-WEBHOOK | S | không | ⏳ |
| PRIVATE-REPLY | FR-046 (nhắn riêng từ bình luận, 1 tin ≤ 7 ngày) | US-017 | MESSENGER-WEBHOOK | S | không | ⏳ |
| MSG-GREETINGS | FR-074 (tin chào, ngoài giờ, báo chuyển nhân viên theo ngôn ngữ) | — | MSG-INBOX | — | không | ⏳ |
| REPORTS | FR-083 (báo cáo theo khoảng/kênh, CSV, email tuần) | US-062 | GĐ4 | — | không | ⏳ |
| PUSH-EMAIL | FR-084 (thông báo đẩy PWA + email, giờ yên lặng) | — | REPORTS | — | **có** — nhà cung cấp email (SMTP thật) | ⛔ |
| ADMIN-REST | FR-104 (gói & mã giảm giá, nội dung hệ thống, quản trị viên), Admin Console tiếng Anh | — | ADMIN-SHELL | S | không | ⏳ |
| ADMIN-IMPERSONATE | FR-105 ("Xem như khách": lý do, chỉ đọc, ≤ 30 phút, nhật ký; `admin_impersonations`) | US-082 | ADMIN-SHELL | S+DB | không | ⏳ |
| ML-SERVICE | FR-027 (bộ phân loại tự host), FR-025 (chuẩn hóa/nhận ngôn ngữ ở `ml`) | — | COST-GATE | — | không | ⏳ |
| PGVECTOR-HYBRID | FR-055, 057 (vector + hybrid), FR-133 (job tạo lại embedding), FR-139 | — | ML-SERVICE, KB-EMBED-COL | DB | không | ⏳ |
| SEMANTIC-CACHE | FR-026 (semantic cache LiteLLM đầy đủ) | — | PIPE-CACHE-SEMANTIC-STUB | S | không | ⏳ |
| LITELLM-LANGFUSE | — (LiteLLM nhiều nhà cung cấp, Langfuse trace) | — | AI-VIRTUALKEY | S | **có** — thêm nhà cung cấp | ⛔ |
| SRC-HARAVAN | FR-122 (Haravan) | — | SHOPIFY-IMPORT | S | **có** — tài khoản dev | ⛔ |
| SRC-SAPO | FR-122 (Sapo) | — | SRC-HARAVAN | S | **có** | ⛔ |
| SRC-KIOTVIET | FR-122 (KiotViet) | — | SRC-SAPO | S | **có** | ⛔ |
| SRC-PANCAKE | FR-122 (Pancake POS) | — | SRC-KIOTVIET | S | **có** | ⛔ |
| AUTO-PAYMENT-CONFIRM | FR-124 (xác nhận thanh toán tự động: SePay/Casso…) | — | QR-PAYMENT | S+DB | **có** — nhà cung cấp | ⛔ |
| ATTACH-VISION | FR-143 (đọc ảnh, tùy chọn) | — | ATTACHMENTS-STORE | S (PII) | **có** — khóa LLM đa phương thức | ⛔ |

---

## GĐ6 — Mở rộng (sau GĐ5)

| Mã | FR | US/UF | Phụ thuộc | Nhạy cảm | Ngoài | Trạng thái |
|---|---|---|---|---|---|---|
| POST-SCHEDULE-MODEL | FR-166 (bảng bài hẹn giờ, job pg-boss, `capabilities.publish`) | US-113 | CONNECTOR-IFACE, GĐ5 | DB | không | ⏳ |
| POST-COMPOSE-AI | FR-166 (AI gợi ý caption từ thẻ sản phẩm + giọng văn) | US-113 | POST-SCHEDULE-MODEL | — | **có** — khóa LLM | ⛔ |
| POST-PUBLISH-FB | FR-166 (đăng Facebook; bài tự gắn sản phẩm) | US-113 | POST-COMPOSE-AI | S | **có** — App Review đăng bài | ⛔ |
| POST-PUBLISH-IG-TIKTOK | FR-166 (Instagram, sau đó TikTok) | US-113 | POST-PUBLISH-FB | S | **có** | ⛔ |

---

## Bảo trì file này

- Xong một việc → đổi trạng thái ở đây **và** dòng gap matrix cùng commit (`/finish`); thêm việc phát sinh vào đúng GĐ, giữ ≤ 1–2 ngày công.
- Dòng `⛔` chỉ chuyển ⏳ khi chủ dự án cung cấp tài nguyên/quyết định; ghi lại trong handoff.
- Việc cơ học (dịch chuỗi, đổi tên hàng loạt, cập nhật bản đồ) → issue nhãn `mech` cho máy phụ, không tính vào bảng này.
