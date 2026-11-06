# CommentFlow AI — hướng dẫn chung cho mọi agent (Claude Code, Codex)

SaaS quản lý bình luận/tin nhắn Facebook, Instagram (sau này TikTok) bằng AI cho shop và agency Việt Nam: phân loại ý định, gợi ý trả lời từ cơ sở kiến thức, nhân viên duyệt hoặc AI tự gửi khi Owner bật. Phần SaaS dùng chung (`saas-core`) sẽ phục vụ cả sản phẩm thứ hai là ExcelFlow.

Đặc tả: `docs/01_…16_*.md`. Bản đồ tính năng → mục spec: `docs/specs/README.md`. **Chỉ đọc mục spec của việc đang làm, không đọc cả bộ.** Quyết định đã chốt: `docs/decisions/000-chot-02-11.md`.

## Vai trò và chuẩn code

Làm việc như **Senior Software Architect & Senior Full-stack Developer**: phân tích trước khi code, ưu tiên khả năng bảo trì, mở rộng và phát triển lâu dài (Clean Code).
- Tên rõ nghĩa theo nghiệp vụ; hàm nhỏ, làm một việc; không lặp logic — gom vào `packages/shared` hoặc package đúng tầng.
- Tách tầng: giao diện → xử lý nghiệp vụ → truy cập dữ liệu; logic nghiệp vụ không nằm trong component React hay route handler.
- Kiểu dữ liệu chặt (TypeScript `strict`, Zod ở mọi ranh giới vào/ra); không dùng `any` khi chưa nêu lý do.
- Không trừu tượng hóa sớm: chỉ tách interface/abstraction khi có ít nhất 2 nơi dùng thật (ngoại lệ: connector nền tảng, `saas-core`).
- Xử lý lỗi rõ ràng, có mã lỗi và thông báo dễ hiểu; không nuốt lỗi.
- Code mới đi kèm test; sửa lỗi đi kèm test hồi quy.
- Tái cấu trúc chỉ trong phạm vi việc đang làm; muốn tái cấu trúc rộng hơn → đề xuất trong `docs/decisions/`, chờ duyệt.

## Lệnh

- Cài đặt: `corepack enable` rồi `pnpm install --frozen-lockfile` (Node 24; `.nvmrc`)
- Chạy dev: `pnpm --filter @flow/web dev` (cổng 3000), `pnpm --filter @flow/worker dev` (health ở cổng 3001)
- Test một file: `pnpm --filter <gói> exec vitest run <đường-dẫn-file>`; ml: `cd services/ml && uv run pytest tests/<file>`
- Test toàn bộ: `pnpm test` (ml: `cd services/ml && uv run pytest`)
- Lint / typecheck: `pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise` (ml: `uv run ruff check .`)
- **Trước mỗi lần push:** `pnpm precheck` (lint, format check, typecheck, check:migrations, check:plans, codemap:check, quyet:check; dừng ở lỗi đầu). Agent tự chạy tay — không hook. CI chỉ chạy ở PR và push vào `main`, nên lỗi rẻ phải bắt trước khi push.
- Test tích hợp (DB thật `cf_test` trên máy phụ): `pnpm test:db` (cần `.env` + máy phụ bật)
- Migration (dev/test/ci): `pnpm db:migrate` · kiểm RLS: `pnpm db:check-rls` · hàng đợi: `pnpm --filter @flow/worker queue:install`. Chỉ DB `cf_dev`/`cf_test`/`cf_ci`; staging/production chỉ qua CI có duyệt
- Mẫu biến môi trường **đặt tên không có dấu chấm đầu, vĩnh viễn**: `env.example` (máy code) và `infra/env.cf-dev.example` (máy ảo); chỉ có tên biến + mô tả. File thật `.env` (máy code) và `.env.cf-dev` (máy ảo) không bao giờ commit. Chủ dự án tạo `.env` bằng `ssh cf "~/CommentFlow/infra/scripts/print-dev-env.sh" > .env` — **agent không chạy script này**.

## Nguyên tắc bất biến

1. Chỉ dùng API chính thức (Meta, TikTok, Google Sheets, Shopify, Haravan, Sapo, KiotViet, Pancake). Không scraping.
2. Mọi bảng nghiệp vụ có `workspace_id` + RLS; truy vấn đi qua `withWorkspace()`; khóa cache/khóa Redis luôn chứa `workspace_id`.
3. AI chỉ soạn câu; quyết định tự gửi do code (`docs/09_System_Architecture.md` §6) và kiểm tra lại ngay trước khi gửi (§6.1). **AI không bao giờ tự ẩn bình luận.**
4. Giá/tồn kho đọc từ `products`/`product_variants`, không từ vector/cache; mọi số tiền trong câu AI phải có trong nguồn (kiểm bằng code); AI không tự tính tổng tiền, giảm giá, phí ship.
5. Bỏ bình luận/tin do chính Page viết (chống vòng lặp).
6. Không log token, mật khẩu, số điện thoại, email thô; che PII trước khi gửi LLM/Langfuse.
7. Mọi lần gọi LLM ghi `ai_usage` (model, token vào/ra/cache, chi phí, bước, prompt_version).
8. `saas-core` không import code của sản phẩm.
9. Hành động trả lời / hỏi lại / chuyển hướng / chuyển người do code chọn (`decideAction`, `docs/09_System_Architecture.md` §4); độ tin cậy do code tính (§6.0), không dùng số model tự chấm.

## Đọc source tiết kiệm (bắt buộc)

- **Bắt đầu từ bản đồ, không quét repo:** đọc `docs/codemap.md` và dòng liên quan trong `docs/gap-matrix.md` trước. Chỉ mở file được bản đồ/gap matrix chỉ tới. Không chạy Glob/Grep toàn repo nếu bản đồ đã trả lời được.
- **Gói ngữ cảnh của việc:** kế hoạch của mỗi việc phải liệt kê "File sẽ đọc" và "File sẽ sửa". Khi code, chỉ đọc các file đó; cần thêm file → nói lý do.
- **Không đọc lại:** file đã đọc trong phiên thì dùng lại nội dung đã có, chỉ đọc lại sau khi chính mình sửa hoặc có thay đổi từ bên ngoài. Đọc theo khoảng dòng khi file dài.
- **Bàn giao giữa phiên:** cuối phiên ghi `docs/handoff/<nhánh>.md` (đã làm, file đã đọc + điều rút ra, việc còn lại). Phiên sau đọc file này thay vì đọc lại source.
- **Cập nhật bản đồ cùng commit:** thêm/xóa/đổi vai trò file → **thêm/sửa file riêng trong `docs/codemap.d/`** (tiền tố `lenh-`/`cay-`/`mien-`/`diem-vao-`/`bay-`, một hàng một file) rồi chạy `pnpm codemap:build`; **không sửa tay `docs/codemap.md`** (file sinh ra, CI chạy `pnpm codemap:check`); xong một mục → sửa dòng trong `docs/gap-matrix.md`. Không lập lại gap matrix từ đầu.

## Thiết kế giao diện

- Bố cục từng trang: `design/stitch/<slug>.png` (+ `.html` khi cần class chi tiết) — chỉ trang đang làm. Danh sách: `design/stitch/README.md`.
- **UI-FIRST (chủ dự án chốt 06/11/2026, Q-UIF1):** hoàn thiện GIAO DIỆN khớp thiết kế Stitch TRƯỚC khi gắn chức năng. Mỗi màn: chụp trang thật (Playwright, 1440px và 390px nếu thiết kế có mobile) → so với `design/stitch/<slug>.png` → liệt kê điểm lệch → sửa bằng component/token của repo → nộp ảnh trước/sau ở `docs/plans/ui-fidelity/<mã>/`. Không đổi logic nghiệp vụ, không migration. Huy hiệu/số liệu/cam kết trong thiết kế mà không có thật (chứng nhận, "500+ shop", logo đối tác…) → thay bằng nội dung trung thực hoặc bỏ, ghi vào QUYET_DINH.
- **Stitch:** không gọi Stitch khi code tính năng thường. Được dùng Stitch **chỉ qua** `docs/workflows/stitch-sync.md` (`/stitch-sync`, máy có MCP stitch) cho giai đoạn UI-first; thiếu màn hình thiết kế → KHÔNG tự bịa: ghi tên màn vào `docs/plans/ui-thieu-thiet-ke.md` (một dòng/màn) để người điều phối tạo bằng Stitch.
- **Dữ liệu mẫu để dựng giao diện (chỉ DEV):** `pnpm dev:seed-demo` (`--reset` để tạo lại) tạo workspace "[MẪU] Demo Shop" — chỉ chạy khi `APP_ENV=dev` và DB `cf_dev` (từ chối staging/production/`cf_test`/DB có dấu `cf.env`). Mọi dữ liệu mẫu mang nhãn `[MẪU]`, **không bao giờ hiển thị như số liệu thật**, không dữ liệu khách thật. Chưa merge/chưa chạy được → dùng fixture cục bộ ở route `/dev/ui` chỉ bật khi `NODE_ENV !== 'production'`.
- HTML Stitch là tham chiếu bố cục; dựng bằng component của repo, màu/chữ từ token (`docs/08_UI_UX_Specification.md` §2).

## Không làm trùng việc

- Mỗi việc chỉ một lần lập kế hoạch (mẫu `docs/plans/TEMPLATE.md`), lưu ở `docs/plans/<nhánh>.md`; agent nào làm tiếp cũng dùng kế hoạch đó, không lập lại. Một lần kiểm chứng cuối nhánh, không review từng commit.
- Kiểm tra máy móc dùng công cụ, không dùng AI: lint, typecheck, test, `dependency-cruiser` (ranh giới saas-core), script kiểm RLS policy, gitleaks, `pnpm check:plans` (cổng kế hoạch). AI chỉ xem phần công cụ không bắt được.
- Chạy test đúng phạm vi đã đổi; lọc output (chỉ lỗi). Không chạy lại cả bộ khi chưa sửa gì.
- Không tóm tắt lại kết quả mà công cụ đã in rõ.

## Cách làm việc

- **Kế hoạch có cổng:** mọi chỗ mơ hồ ghi thành thẻ `[CẦN LÀM RÕ: câu hỏi]` và **không code khi còn thẻ chưa được chủ dự án trả lời**; plan có "Tiêu chí nghiệm thu" kiểm được, và "Complexity tracking" khi đi ngược một nguyên tắc ở file này. `/finish` đối chiếu từng tiêu chí với bằng chứng. Chi tiết: `docs/workflows/feature.md`, `finish.md`.
- Mỗi việc một nhánh. Bắt đầu theo `docs/workflows/feature.md`, kết thúc theo `docs/workflows/finish.md`.
- Logic quy tắc (cổng tự gửi, sendRecheck, hạn mức, cửa sổ 24 giờ, che PII, nhận ngôn ngữ): viết test trước.
- Sửa bằng thay đổi nhỏ; không viết lại cả file khi không cần.
- Trước khi merge: công cụ xanh → nếu diff thuộc diện nhạy cảm (§ Phối hợp nhiều agent) thì cần đúng một lần kiểm chứng độc lập.
- Giữ cấu trúc thư mục hiện có của repo; chỉ đề xuất đổi cấu trúc trong `docs/decisions/`.
- Code lấy từ repo MIT Customer-Support-AI-Employee: giữ thông báo bản quyền, ghi commit gốc `e125e7c`.

## Cách trình bày cho chủ dự án

Chủ dự án đọc TypeScript ở mức cơ bản. Mọi kế hoạch, báo cáo kiểm chứng và tóm tắt cuối việc:
- Mở đầu bằng 2–3 câu tiếng Việt dễ hiểu: làm gì, vì sao, rủi ro gì.
- Liệt kê file sẽ đổi kèm một dòng giải thích mỗi file.
- Thuật ngữ kỹ thuật lần đầu xuất hiện phải giải thích ngắn trong ngoặc.
- Điểm cần chủ dự án quyết định ghi rõ ở mục **Cần bạn quyết định**.

## Quy tắc hỏi (chủ dự án chốt 05/11/2026)

- Mặc định **tự chọn phương án khuyến nghị** (an toàn, ít quyền, đảo ngược được), ghi vào **file riêng `docs/plans/quyet-dinh/q<mã>.md`** (một hàng bảng: quyết định, lý do, cách đảo ngược; mục thay đổi docs/01–16 là `docs-<ngày>-<mã>.md`) rồi chạy `pnpm quyet:build` (sinh `docs/plans/QUYET_DINH_CHO_DUYET.md`, không sửa tay; CI chạy `pnpm quyet:check`) và làm tiếp. Được sửa `docs/01–16` cho khớp quyết định đó; ghi danh sách thay đổi vào cùng file.
- **Chỉ hỏi** khi: cần việc/tài nguyên chỉ chủ dự án làm được; tốn tiền hoặc không đảo ngược được; đổi phạm vi/trải nghiệm lớn; không có phương án đủ an toàn.
- Chỉ `git add` đúng file của việc đang làm; không bao giờ `git add -A`/`git add .` hay gom file ngoài việc.
- Báo cáo ≤ 10 dòng, mỗi ngày một lần hoặc khi dừng; tách riêng mục "Việc chỉ bạn làm được".

## Tài nguyên ngoài: xây mock, không chờ (chủ dự án chốt 05/11/2026)

Không chờ khóa/tài nguyên của chủ dự án. Việc cần Meta OAuth/webhook thật, khóa LLM, SMTP, tên miền/Cloudflare, Shopify/Google/Haravan/Sapo/KiotViet/Pancake/TikTok, thanh toán… → viết đủ code thật sau interface + fixture/mock theo tài liệu chính thức; cấu hình đọc từ biến môi trường (chỉ TÊN biến vào `env.example`); feature flag mặc định **TẮT** cho đường dùng tài nguyên thật; test bằng fixture/mock; trạng thái **Xong-mock** trong `MASTER.md`; mỗi tài nguyên một mục trong `docs/CAN_BAN_CUNG_CAP.md`. Không bịa khóa, không gọi dịch vụ thật, không dùng dữ liệu khách thật. Dừng chỉ khi mọi việc còn lại đều "Chờ tài nguyên" hoặc Xong, hoặc lỗi sửa 2 lần không được. FR-166 (GĐ6) làm cuối. Không force-push; cập nhật nhánh bằng merge.

## Cấm

- Đọc `.env*` hoặc bất kỳ file bí mật nào; in biến môi trường.
- Chạy migration hoặc lệnh ghi lên database production/staging từ máy dev.
- Sửa `docs/01–16` ngoài phạm vi § Quy tắc hỏi (chỉ được sửa để khớp một quyết định đã ghi vào `QUYET_DINH_CHO_DUYET.md`).
- Tạo dữ liệu khách giả làm số liệu. Seed trên mọi môi trường chỉ `plans` và từ điển viết tắt hệ thống; ngoại lệ DUY NHẤT: dữ liệu mẫu có nhãn `[MẪU]` trên DEV (`cf_dev`) do `pnpm dev:seed-demo` tạo, để dựng giao diện (§ Thiết kế giao diện) — không bao giờ ở staging/production/`cf_test`, không bao giờ làm số liệu hay đưa vào test.
- Thêm thư viện mới mà không nêu lý do và giấy phép.

## Phối hợp nhiều agent (Claude Code + Codex)

- **Một nhánh, một agent tại một thời điểm.** Không để hai agent cùng sửa một nhánh. Đổi agent chỉ ở điểm dừng: sau khi commit và ghi `docs/handoff/<nhánh>.md`.
- **Trạng thái nằm trong repo, không trong trí nhớ phiên:** `docs/plans/<nhánh>.md` (kế hoạch đã duyệt), `docs/handoff/<nhánh>.md` (đã làm, file đã đọc + điều rút ra, việc còn lại, agent vừa làm), `docs/codemap.md`, `docs/gap-matrix.md`. Agent nhận việc đọc các file này trước, không đọc lại source đã được ghi.
- **Không lập lại kế hoạch, không làm lại việc đã commit.** Thấy kế hoạch sai → ghi đề xuất sửa vào `docs/plans/<nhánh>.md` mục "Đề xuất thay đổi" và dừng chờ chủ dự án.
- **Chạy song song nhiều nhánh:** xem `docs/workflows/parallel.md` (mỗi làn một worktree + `CF_LANE`). Tự động hóa hàng đợi việc/PR/CI/merge: `tools/orchestrator` — `docs/workflows/orchestrator.md`, ADR 012.
- **Kiểm chứng chéo chỉ cho diff nhạy cảm** (auth, phiên, token, chữ ký webhook, RLS/`withWorkspace`, thanh toán, cổng tự gửi, `sendRecheck`, che PII, migration): agent **không viết** đoạn đó kiểm chứng theo `docs/workflows/verify.md`, chỉ nhận diff + mục spec. Diff thường không cần agent thứ hai.
- Ghi agent đã làm vào cột "Nhánh" của gap matrix, ví dụ `feat/ai-usage (codex)`.

## Hai máy: máy chính (việc nặng) và máy phụ (việc nhẹ, chạy staging)

| | Máy chính (máy code) | Máy phụ (máy chạy thật) |
|---|---|---|
| Model mặc định | `sonnet` (`.claude/settings.json`); `opusplan` cho việc khó | `haiku` — đặt trong `.claude/settings.local.json` của máy phụ (không commit) |
| Việc | Lập kế hoạch, viết tính năng, logic nhạy cảm (cổng tự gửi, `sendRecheck`, RLS, auth, thanh toán, prompt AI), sửa lỗi khó, **kiểm chứng độc lập** bằng subagent `verifier-*` khi `/finish` | Deploy staging + kiểm sức khỏe, chạy E2E/contract test, thao tác thử với Page/IG thật, đọc log và tóm lỗi thành issue, việc cơ học kiểm được bằng công cụ (tách chuỗi `vi.json`/`en.json`, dịch chuỗi giao diện, đổi tên theo danh sách, cập nhật `codemap`/`gap-matrix`) |
| Nhánh được tạo | `feat/*`, `fix/*`, `chore/*` | `mech/*` (việc cơ học), `ops/*` (hạ tầng), commit `docs/staging/*` |
| Không được | Chạy migration/lệnh ghi lên staging | Sửa logic nghiệp vụ trong `apps/`, `packages/`, `services/`; lập kế hoạch tính năng; kiểm chứng diff nhạy cảm |
| Lệnh chính | `/feature`, `/finish`, `/fix-issues` | `/staging-verify <nhánh>`, `/mech <việc>` |

- Việc trên máy phụ làm sai 2 lần → chuyển về máy chính (ghi issue), không thử lần ba.
- Trao đổi giữa hai máy **chỉ qua repo và GitHub Issues** (nhãn `staging-bug`, `mech`), không qua trí nhớ phiên. Luôn `git pull` trước khi bắt đầu.
- Một nhánh chỉ một máy sửa tại một thời điểm.
- Khóa bí mật staging chỉ nằm trên máy phụ; log/issue phải che PII, không dán token.
