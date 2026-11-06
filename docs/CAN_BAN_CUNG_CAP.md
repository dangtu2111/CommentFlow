# Cần bạn cung cấp / thiết lập (chủ dự án)

> `PII-MASK-PIPE` (FR-033): không cần tài nguyên ngoài (hàm thuần); không có biến môi trường mới.

> Những thứ agent **không tự làm được** vì cần tài khoản, bí mật hoặc thao tác ngoài repo. Agent chỉ thêm **tên biến** vào `env.example`; **giá trị thật bạn tự đặt trong `.env.local`** (không bao giờ commit, không gửi cho agent). Cập nhật file này khi có mục mới.

## 1. Meta App (đăng nhập Facebook + webhook bình luận) — `FB-OAUTH`, `WH-INGEST`

Bạn đã có Meta App ở chế độ **Development** (không cần tên miền thật, chưa cần App Review khi thử với tài khoản quản trị/tester của chính App).

### 1.1 Cấu hình App (một lần)
1. Trong Meta for Developers → App → **Facebook Login for Business** (hoặc Facebook Login): thêm vào **Valid OAuth Redirect URIs**:
   `http://localhost:3000/api/channels/facebook/callback`
   (Meta cho phép `http://localhost` ở chế độ Development. Cổng/đường dẫn đúng như trên; nếu tôi đổi đường dẫn khi code, sẽ cập nhật mục này.)
2. Thêm sản phẩm **Webhooks** → đối tượng **Page** → đăng ký trường `feed` (bình luận trên bài của Page; xem `docs/12` §1). Trường `messages` để sau (GĐ5).
3. Quyền cần xin khi thử (chế độ Development chỉ dùng được với người có vai trò trong App): `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_engagement`, `pages_manage_metadata` (xem `docs/12` §1). Người thử phải là **Admin/Developer/Tester của App** và quản trị **Page thử**.
4. Chuẩn bị **một Page thử** (Page thật của bạn hoặc Page lập riêng để thử) có vài bài viết.

### 1.2 Biến môi trường (bạn đặt giá trị vào `.env.local`)
Tên biến có trong `env.example` (không có giá trị):

| Biến | Là gì | Lấy ở đâu |
|---|---|---|
| `META_APP_ID` | ID của Meta App | App → Settings → Basic |
| `META_APP_SECRET` | App Secret (dùng đổi token + **xác minh chữ ký webhook**) | App → Settings → Basic → Show |
| `META_WEBHOOK_VERIFY_TOKEN` | Chuỗi bí mật do **bạn tự chọn** (dài, ngẫu nhiên) để Meta xác minh endpoint webhook | Tự sinh, ví dụ `openssl rand -hex 24`; dán cùng giá trị vào ô "Verify token" ở Meta |
| `META_OAUTH_REDIRECT_URL` | Redirect URI dùng khi đăng nhập (mặc định `http://localhost:3000/api/channels/facebook/callback`) | Phải **trùng khớp từng ký tự** với mục 1.1.1 |

Không dán App Secret/verify token vào chat, issue, log hay commit.

### 1.3 Khóa mã hóa token Page (`TOKEN_ENC_KEYS`) — `TOKEN-ENC`, `FB-OAUTH`
Token Page được mã hóa AES-256-GCM trước khi vào DB; **mất khóa = mọi kênh phải kết nối lại**.

1. Sinh khóa: `openssl rand -hex 32` (64 ký tự hex). Không có `openssl`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Khóa **dev**: đặt vào `.env.local` (máy code): `TOKEN_ENC_KEYS=v1:<64 hex>`. **Chỉ** ở máy code — **không** đặt trên máy ảo, không commit, không dán vào chat/issue/log.
3. **Sao lưu khóa riêng** (trình quản lý mật khẩu), tách khỏi nơi sao lưu DB — có DB mà không có khóa thì token vô dụng.
4. Xoay khóa (sau này): thêm `v2:<hex mới>` phía sau (`v1:…,v2:…`); token mới mã hóa bằng v2, token cũ vẫn đọc được bằng v1; chỉ gỡ v1 sau khi mọi kênh đã mã hóa lại.
5. Staging/production: khóa **riêng** cho từng môi trường, không dùng lại khóa dev. Khóa **staging** do script `infra/scripts/gen-staging-env.sh` sinh ngay trên máy ảo (`docs/STAGING_SETUP.md` bước B), chỉ nằm ở file `.env.cf-staging` trên máy ảo + **một** bản sao trong trình quản lý mật khẩu của chủ dự án. **Không chép chéo**: khóa dev không lên máy ảo, khóa staging không về máy code. Production: secret manager riêng (làm khi tới `DEPLOY`).

### 1.4 Meta OAuth + Page thử — `FB-OAUTH` (mã KT-014)

Code đã xong ở chế độ "Xong-mock" (test bằng dữ liệu mẫu theo tài liệu Meta v27.0; **chưa gọi Meta thật**). Muốn chạy thật:

- **Là gì:** Meta App (Facebook Login for Business) + một Page thử, để Owner bấm "Kết nối Facebook" lấy token Page và đăng ký webhook.
- **Lấy ở đâu (từng bước):**
  1. Làm mục 1.1 (Redirect URI, Webhooks `feed`, quyền). Với **Facebook Login for Business**, vào Meta → App → Facebook Login for Business → **Configurations** → tạo cấu hình có các quyền ở 1.1.3, lấy **Configuration ID** (nếu dùng Facebook Login thường thì bỏ qua, hệ thống xin quyền bằng `scope`).
  2. Trang **Page thử**: bạn là quản trị (Admin) Page, và là Admin/Developer/Tester của App.
- **Đặt vào đâu:** dev → `.env.local`; staging → file `.env.cf-staging` trên máy ảo (do chủ dự án; khóa `TOKEN_ENC_KEYS` riêng, mục 1.3). Biến (đã có tên trong `env.example`): `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URL`, `TOKEN_ENC_KEYS`; mới: `FB_OAUTH_ENABLED=true`, tùy chọn `FB_LOGIN_CONFIG_ID` (Configuration ID ở trên), `CHANNELS_LIMIT_DEFAULT` (số kênh tối đa mỗi workspace, mặc định 1 vì chưa có bảng gói cước).
- **Lệnh kiểm sau khi đặt:** khởi động lại `pnpm --filter @flow/web dev` — web phải lên bình thường (thiếu biến hoặc `TOKEN_ENC_KEYS` thiếu khóa cho phiên bản đang dùng → web dừng và nêu **tên** biến/phiên bản). Mở `http://localhost:3000/api/channels/facebook/start` khi đã đăng nhập bằng Owner → chuyển sang Facebook. Sau khi kết nối: `curl http://localhost:3000/api/health` vẫn `ok`.
- **Cờ cần bật:** `FB_OAUTH_ENABLED=true` (mặc định TẮT: tắt thì `/api/channels/facebook/*` trả 404 và UI ẩn nút).
- **Mở khóa:** kết nối Page thật, nhận bình luận thật (`WH-INGEST`), gửi trả lời/ẩn thật (`FB-REPLY`, `FB-HIDE`), nút Kết nối lại.
- **Mã KT:** `docs/testing/KIEM_TRA_TAY.md` KT-014. Lưu ý: `META_OAUTH_REDIRECT_URL` phải khớp từng ký tự với Valid OAuth Redirect URIs; chế độ Development cho phép `http://localhost`.

## 2. Thử webhook thật bằng Cloudflare quick tunnel

Webhook của Meta phải gọi được tới máy bạn qua HTTPS công khai. Dùng **quick tunnel** của Cloudflare (không cần tài khoản, không cần tên miền; địa chỉ đổi mỗi lần chạy).

1. Cài `cloudflared` (một lần): `winget install --id Cloudflare.cloudflared`.
2. Chạy web: `pnpm --filter @flow/web dev` (cổng 3000).
3. Ở cửa sổ khác: `cloudflared tunnel --url http://localhost:3000` → in ra địa chỉ dạng `https://<ngẫu-nhiên>.trycloudflare.com`.
4. Ở Meta App → Webhooks → Page → **Edit subscription**:
   - **Callback URL:** `https://<ngẫu-nhiên>.trycloudflare.com/api/webhooks/meta`
   - **Verify token:** đúng giá trị `META_WEBHOOK_VERIFY_TOKEN` trong `.env.local` của bạn.
   Meta gửi `GET` kèm `hub.verify_token`/`hub.challenge`; code so khớp verify token rồi trả `hub.challenge`.
5. Sau đó mọi `POST` từ Meta mang `X-Hub-Signature-256` (HMAC-SHA256 của thân thô bằng `META_APP_SECRET`); code **xác minh chữ ký bằng so sánh thời gian hằng trước khi xử lý** như production — sai chữ ký trả 401, không xử lý.
6. Bình luận mới trên bài của Page thử → webhook → job `ingest` → hiện ở trang Bình luận.

Lưu ý an toàn:
- Địa chỉ quick tunnel **mở web dev của bạn ra internet** khi còn chạy. Chỉ bật khi cần thử; tắt (`Ctrl+C`) khi xong. Đừng đăng nhập tài khoản thật có dữ liệu khách trên bản dev đó.
- Địa chỉ đổi mỗi lần chạy → phải cập nhật lại Callback URL ở Meta mỗi lần (OAuth vẫn dùng `localhost`, không đổi).
- Không commit địa chỉ tunnel. Không đặt tunnel vào `BETTER_AUTH_URL` (đăng nhập vẫn chạy ở `http://localhost:3000`).
- `CLIENT_IP_SOURCE` giữ `none` ở dev (không tin header IP của tunnel).

## 2d. Quét bù bình luận (`POLLING-BACKFILL`, `FB-BACKFILL`, `FB-FETCH-PAGE-WIDE`)

Code đã xong-mock (connector giả/fixture). Để bật đường thật trên staging bạn cần:
1. Page thử có vài bài viết + bình luận, đã kết nối qua mục 1 (kênh `connected`, `webhook_subscribed`).
2. Đặt `POLLING_ENABLED=true` cho **worker** (cần `META_APP_ID`, `META_APP_SECRET`, `TOKEN_ENC_KEYS`). Mặc định TẮT.
3. Chờ `POLLING-CHANNEL-LIST` (migration của làn b: hàm liệt kê kênh xuyên workspace) — chưa có thì worker chỉ báo lỗi cấu hình và không quét.
4. Kiểm trên Page thật giả định: `updated_time` của bài tăng khi có bình luận mới (nếu không, đổi cách chọn bài — QP1).
Không cần khóa mới nào ngoài mục 1. Kiểm tay: KT-021.

## 2c. Bật connector Facebook ở worker — `FB-CONNECTOR-REGISTER` (Xong-mock)

Code đã nối `createFacebookConnector` vào worker nhưng cờ **tắt mặc định**. Bạn cần cung cấp (chỉ khi muốn thử với Page thật; dùng Page thử, không dùng Page khách):
- Một Page thử đã kết nối qua `FB-OAUTH` (mục 1) — token Page nằm mã hóa trong DB.
- Trên **máy chạy worker** đặt biến: `FB_CONNECTOR_ENABLED=true`, `META_APP_ID`, `META_APP_SECRET` (cùng Meta App ở mục 1), `TOKEN_ENC_KEYS` (cùng khóa với web). Không commit giá trị; chỉ tên biến có trong `env.example`.
- Điều kiện trước khi bật ở môi trường thật: `SEND-SWEEP`/`HIDE-SWEEP` đã merge (tránh yêu cầu kẹt `sending`). Kiểm tay: KT-016/KT-012.

## 2b. Tên sản phẩm, logo, tên miền, email gửi — `CFG-APPNAME` (FR-125, mã KT-018)

Code đã đọc cấu hình, đang chạy bằng **giá trị tạm** (`CommentFlow AI`, không logo/tên miền). Khi chốt tên (Q6), chỉ cần đặt biến, **không sửa code**:

| Biến | Ý nghĩa | Ghi chú |
|---|---|---|
| `APP_NAME` | Tên hiển thị (giao diện, tiêu đề trang, thư, tên trong app 2FA) | tối đa 60 ký tự |
| `APP_LOGO_URL` | Logo: đường dẫn gốc (`/brand/logo.svg`, file đặt ở `apps/web/public/brand/`) hoặc URL `https://…` | bỏ trống = biểu tượng mặc định |
| `APP_DOMAIN` | Tên miền công khai, ví dụ `app.ten-moi.vn` | chỉ tên miền, không `https://` |
| `APP_EMAIL_FROM` | Người gửi thư đầy đủ `Tên <no-reply@ten-moi.vn>` | bỏ trống = dựng từ `APP_NAME` + `APP_DOMAIN`; `SMTP_FROM` (nếu có) vẫn được ưu tiên |

Tên miền còn phải được xác minh (SPF/DKIM) ở nhà cung cấp email trước khi gửi thật.

## 2f. Mô hình embedding thật — `KB-CHUNKING` (Xong-mock)

Lập chỉ mục kiến thức hiện dùng bản mock xác định (`createMockEmbedder`, `packages/ai/src/kb-indexing.ts`), không gọi dịch vụ ngoài. Để dùng embedding thật bạn cần cung cấp: mô hình embedding 1024 chiều đăng ký trong LiteLLM (tên + revision, ghi vào `kb_chunks.embedding_model`) và khóa ảo LiteLLM đã có (`LITELLM_BASE_URL`/khóa ảo của AI-WRAPPER). Việc cắm bản thật (kèm ghi `ai_usage`) là `KB-EMBED-LITELLM`, mặc định tắt cho tới khi có mô hình.

## 2e. Khóa LLM trả phí cho phân loại + tách thông tin — `PIPE-CLASSIFY-EXTRACT` (FR-027/145/162, Xong-mock, mã KT-030)

Code đã có bước `extract` (`packages/ai/src/classify/`) gọi LLM qua LiteLLM sẵn có, nhưng cờ **tắt mặc định** và chưa nối vào pipeline; test chạy bằng fixture. Chỉ khi muốn chạy thật, bạn cần cung cấp:
- Khóa ảo LiteLLM (`LITELLM_API_KEY`, đã có trong `env.example`) được cấp quyền cho **một model nhỏ, rẻ** của nhà cung cấp trả phí (khóa nhà cung cấp đặt trong cấu hình LiteLLM trên máy ảo, không vào repo).
- Đặt `CLASSIFY_LLM_MODEL=<tên model trong LiteLLM>` và `CLASSIFY_LLM_ENABLED=true` (chỉ staging/thử; chưa có đo chất lượng — chờ `EVAL-RUNNER`).

## 2f. Khóa LLM trả phí cho soạn trả lời — `PIPE-DRAFT` (FR-029/138/140/142, Xong-mock, mã KT-031)

Code đã có bước `draft` (`packages/ai/src/draft/`) gọi LLM qua LiteLLM sẵn có (prompt xếp ổn định + đánh dấu cache), nhưng cờ **tắt mặc định** và chưa nối vào pipeline; test chạy bằng fixture/giả lập. Chỉ khi muốn chạy thật, bạn cần cung cấp:
- Khóa ảo LiteLLM (`LITELLM_API_KEY`) được cấp quyền cho **model soạn câu** (nên là model hỗ trợ prompt caching, ví dụ dòng Claude/GPT/Gemini); khóa nhà cung cấp đặt trong cấu hình LiteLLM trên máy ảo, không vào repo.
- Đặt `DRAFT_LLM_MODEL=<tên model trong LiteLLM>` và `DRAFT_LLM_ENABLED=true` (chỉ staging/thử; chưa đo chất lượng và tỉ lệ trúng cache — chờ `EVAL-RUNNER`).
- `PIPE-VARIATION` (FR-161, mã KT-PV) dùng chung đúng khóa/model này (3–5 biến thể câu trong cùng một lần gọi, không thêm tài nguyên); chất lượng đa dạng thật chỉ đo được khi bật thật.

## 2i. Khóa LLM trả phí cho viết lại câu hỏi — `PIPE-REWRITE-CTX` (FR-137/144, Xong-mock, mã KT-034)

Code đã có bước `rewrite` (`packages/ai/src/rewrite/`): phần ghép `search_query` và chọn ngữ cảnh là quy tắc thuần (không cần gì); chỉ nhánh LLM rẻ (câu ≤ 6 từ/mơ hồ, chưa nhận được sản phẩm) cần khóa, cờ **tắt mặc định**, chưa nối pipeline; test chạy bằng fixture/giả lập. Chỉ khi muốn chạy thật, bạn cần cung cấp:
- Khóa ảo LiteLLM (`LITELLM_API_KEY`) được cấp quyền cho **model rẻ** (có thể dùng chung model phân loại).
- Đặt `REWRITE_LLM_MODEL=<tên model trong LiteLLM>` và `REWRITE_LLM_ENABLED=true` (chỉ staging/thử).

## 2h0a. `DA-RULES-ORDER-HOURS` (FR-153, FR-152) — không cần tài nguyên ngoài

Hàm thuần, không khóa/dịch vụ/cờ; kiểm tay mã KT-DROH. Chủ dự án chỉ cần quyết định sau này (khi nối DB): giờ làm việc từng workspace (múi giờ + khung giờ theo thứ) nhập ở đâu trong Cài đặt, và soạn mẫu câu mời trong giờ/ngoài giờ cho từng chủ đề (đã có ở Cơ sở kiến thức → Giọng văn).

## 2h0. `DA-RULES-STOCK` (FR-151, FR-157) — không cần tài nguyên ngoài

Hàm thuần, không khóa/dịch vụ/cờ; kiểm tay mã KT-DRS. Chủ dự án chỉ cần quyết định sau này (khi nối DB): `stock_stale_days` mặc định 3 có phù hợp, và có bật gợi ý mẫu thay thế (`suggest_alternatives`, mặc định TẮT) cho shop nào.

## 2h. `PIPE-RULE-FILTER` + `PIPE-MERGE-BURST` (FR-024, FR-148) — không cần tài nguyên ngoài

Hai hàm thuần, không khóa/dịch vụ/cờ; kiểm tay mã KT-032. Không có gì để chủ dự án cung cấp.

## 2g. Mô hình embedding (vector hóa) — `KB-SEARCH-FTS` (FR-057/127/139, Xong-mock, mã KT-KB-SEARCH)

Tìm kiếm toàn văn + trigram chạy hoàn toàn trong Postgres (không cần khóa). Nhánh **vector** nhận vector dựng sẵn qua interface `Embedder` (`packages/ai/src/embedding/`); hiện chỉ có bản fixture (băm ký tự, không gọi mạng), chưa có bản gọi mô hình thật. Chỉ khi muốn chạy thật, bạn cần cung cấp:
- Một model embedding **1024 chiều** trong LiteLLM (ví dụ dòng BGE-M3/multilingual-e5-large, hoặc dịch vụ trả phí hỗ trợ giảm chiều về 1024) + khóa ảo LiteLLM (`LITELLM_API_KEY`) có quyền model đó; tên model dự kiến đặt ở `EMBEDDING_MODEL` (chưa thêm vào `env.example` cho tới khi có bản thật).
- Quyết định có tự host (máy ảo) hay dùng dịch vụ trả phí; kèm giá để đưa vào `ai_usage`.

## 2h. Nhận diện ngôn ngữ (lingua) — `PIPE-NORMALIZE-LANG` (FR-025/120/159, Xong-mock, mã KT-033)

Không cần khóa hay dịch vụ ngoài: `normalizeAndDetectLang` chạy bằng heuristic từ khóa mặc định. Muốn độ chính xác cao hơn cho câu không dấu/ngôn ngữ Latin khác (Pháp, Tây Ban Nha…), bạn **quyết định** có thêm thư viện lingua (MIT) hay không — khi đó sẽ cắm qua interface `LangDetector`, kèm bộ đánh giá 4 nhóm (FR-120). Từ điển viết tắt lấy từ bảng `abbreviations` (việc ABBREV-DICT).

## 2i. `AUTO-SEND-GATE` (FR-031, FR-141) — không cần tài nguyên ngoài

Hàm thuần `decideAutoSend` (`packages/ai/src/gate/`), không khóa/dịch vụ/cờ; kiểm tay mã KT-ASG. Không có gì để chủ dự án cung cấp. Mutation testing (Stryker) chưa cài — xem gap `MUTATION-STRYKER`, cần bạn đồng ý thêm thư viện dev (Apache-2.0) ở một nhánh riêng.

## 2j. `SEND-RECHECK` (FR-110) — không cần tài nguyên ngoài

Hàm thuần `sendRecheck` (`packages/ai/src/recheck/`) + job `send` của worker gọi nó; không khóa/dịch vụ/cờ mới; kiểm tay mã KT-SR. Đã thêm thư viện dev Stryker (Apache-2.0) để đo mutation — không cần bạn cung cấp gì. Khi nối tự gửi (`SEND-RECHECK-WIRE`), R5–R7 đọc `drafts`/`products`/`usage_counters` (bảng do làn b).

## 3. Các mục khác (thêm khi tới lượt)
- Nhà cung cấp email production, tên sản phẩm/tên miền (Q6), khóa nhà cung cấp LLM trả phí, bộ ~300 bình luận thật, Shopify dev store, Google Cloud, quyền TikTok: xem `docs/plans/MASTER.md` (cột "Ngoài").

## 2i. `AI-TRY-BOX-UI` (FR-059, FR-029, US-034, Xong-mock, mã KT-ATB) — không cần tài nguyên ngoài mới
Ô Thử AI dùng bản mock (từ khóa + kiến thức mẫu). Để thử với AI/KB thật cần cùng khóa LLM ở mục 2e/2f và mô hình embedding ở 2g; khi đó việc `TRY-AI-REAL` nối `TryKnowledge` vào KB thật và `LLM` thật sau cờ (mặc định TẮT). Bạn **không** phải làm gì cho bản mock.

## 2j. `AI-READINESS` (FR-146) — không cần tài nguyên ngoài

Độ sẵn sàng của AI tính hoàn toàn từ dữ liệu trong DB (sản phẩm, chính sách, FAQ, thông tin shop) bằng mã; không gọi LLM, không biến môi trường mới, không cờ. Khi muốn đo "câu mẫu trả lời được" bằng LLM thật → việc `AI-EVAL-*` (cần khóa LLM, sẽ ghi ở mục riêng).

## Redis cho cache câu trả lời — `PIPE-CACHE-EXACT` (FR-026, Xong-mock, mã KT-PCX)
Cache khớp chính xác chạy sau interface `ExactCacheStore` với bản bộ nhớ; chưa có biến môi trường/Redis mới. Khi nối pipeline (`PIPE-ORCHESTRATOR`) cần Redis 7 đã có trong hạ tầng (docs/09 §2, dùng lại URL Redis của hệ thống) và cờ `cf.cache.answers` (docs/09 §10; mặc định TẮT cho đường thật). Không cần khóa/tài khoản mới.

## 2k. `KB-GAPS-UI` (FR-134, UF-11) — không cần tài nguyên ngoài

Trang "Câu hỏi AI chưa trả lời được" chỉ đọc/ghi `kb_gaps` và `faq_items` trong DB; không gọi LLM, không biến môi trường mới, không cờ. Dữ liệu chỉ xuất hiện khi pipeline ghi `kb_gaps` (việc `RETRIEVAL-LOG-WIRE`); trước đó trang hiển thị "chưa có câu hỏi nào".

## pgvector >= 0.8 cho chỉ mục HNSW — `KB-EMBED-COL`

Không cần khóa/tài khoản. Máy ảo `cf`, CI và staging/production phải dùng PostgreSQL 16 + pgvector >= 0.8 (hiện `pgvector/pgvector:0.8.7-pg16`). Migration 0042 báo lỗi rõ nếu thấp hơn. Chủ dự án chỉ cần nâng image khi dựng staging/production mới.

## 2l. `KB-TRYAI` (FR-059) — không cần tài nguyên ngoài mới
Ô Thử AI có thể tìm trong KB thật của workspace (cờ `TRY_AI_KB_REAL`, mặc định TẮT; Xong-mock: embedding là fixture). Để vector có kết quả cần mô hình embedding ở 2g và worker điền `embedding` (`KB-CHUNKING`). Bạn **không** phải làm gì cho bản mock.

## 2m. `SPAM-RULES` (FR-080) — không cần tài nguyên ngoài
Xem trước quy tắc spam đọc `cf.comments` của chính workspace, không gọi dịch vụ ngoài. Lưu quy tắc cần bảng `rules` (migration do làn b/chủ dự án duyệt, `SPAM-RULES-DB`); chưa có thì nút Lưu báo chưa khả dụng.

## 2n. `KB-TESTSET` (FR-054) — không cần tài nguyên ngoài
Bộ câu kiểm thử chạy qua pipeline Thử AI bằng mô phỏng (không LLM, không khóa, không DB). Dùng KB thật khi cờ `TRY_AI_KB_REAL` bật (cùng cờ KB-TRYAI, mặc định TẮT). Lưu bộ câu và chặn nút Xuất bản cần bảng mới (migration làn b, `KB-TESTSET-PERSIST`). Bạn **không** phải làm gì cho bản mock.

## 2o. `KB-SAMPLES` (FR-132) — không cần tài nguyên ngoài
Câu mẫu của shop chỉ là mã thuần + kho trong bộ nhớ, không khóa/LLM/dịch vụ ngoài. Lưu thật cần bảng `kb_answer_examples` (migration làn b, `KB-SAMPLES-PERSIST`) và embedding ở 2g. Bạn không phải làm gì.

## 2p. `AUTO-MATRIX-UI` (FR-070/071) — không cần tài nguyên ngoài
Trang `/app/automation` (chỉ Owner) chạy hoàn toàn trong ứng dụng, không cần khóa hay dịch vụ ngoài. Cấu hình chưa áp dụng cho việc tự gửi thật (chờ nối pipeline). Bạn **không** phải làm gì.

## 2q. `AUTO-CONFIG-STORE` (FR-070/071) — không cần tài nguyên ngoài
Lưu cấu hình tự gửi vào DB (`cf.automation_settings`, `cf.automation_rules`, migration 0047). Chỉ cần **chủ dự án duyệt và chạy migration 0047 lên staging/production qua CI có duyệt** (agent không chạy lệnh ghi lên các DB đó). Không cần khóa hay dịch vụ ngoài.
## 2r. `POSTS-LINK-PRODUCT` (FR-061) — không cần tài nguyên ngoài
Chỉ là bảng `cf.post_products` (migration 0049) + truy vấn; không khóa/dịch vụ ngoài. Việc sinh đề xuất bằng AI (worker, cần LLM) chưa làm — cờ LLM giữ TẮT; khi làm sẽ gọi `suggestPostProducts` và vẫn cần người xác nhận.

## 2s. `PIPE-CACHE-SEMANTIC-STUB` (FR-026) — chưa cần ngay, cần khi bật semantic cache (GĐ5)
Chỉ có cấu hình mẫu `infra/litellm/semantic-cache.example.yaml` + hàm dựng `cache` theo workspace; cờ `CACHE_SEMANTIC_ENABLED` MẶC ĐỊNH TẮT, chưa nối pipeline, không gọi dịch vụ thật. Để bật thật (`SEMANTIC-CACHE`, GĐ5) bạn cần: (1) một model embedding đăng ký trong LiteLLM, tên đặt ở `SEMANTIC_CACHE_EMBEDDING_MODEL` (đặt trong `config.yaml` trên máy ảo); (2) Redis có module RediSearch (Redis Stack) cho `redis-semantic`; (3) tự gộp khối `litellm_settings` của file mẫu vào cấu hình LiteLLM trên máy ảo.
