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

<!-- TODO(GĐ0): agent điền mục này sau khi đọc package.json / pyproject; không đoán. -->
- Cài đặt: `corepack enable` rồi `pnpm install --frozen-lockfile` (Node 24; `.nvmrc`)
- Chạy dev: `pnpm --filter @flow/web dev` (cổng 3000), `pnpm --filter @flow/worker dev` (health ở cổng 3001)
- Test một file: `pnpm --filter <gói> exec vitest run <đường-dẫn-file>`; ml: `cd services/ml && uv run pytest tests/<file>`
- Test toàn bộ: `pnpm test` (ml: `cd services/ml && uv run pytest`)
- Lint / typecheck: `pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise` (ml: `uv run ruff check .`)
- Migration (local/staging): `TODO`

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
- **Cập nhật bản đồ cùng commit:** thêm/xóa/đổi vai trò file → sửa dòng tương ứng trong `docs/codemap.md`; xong một mục → sửa dòng trong `docs/gap-matrix.md`. Không lập lại gap matrix từ đầu.

## Thiết kế giao diện

- Bố cục từng trang: `design/stitch/<slug>.png` (+ `.html` khi cần class chi tiết) — chỉ trang đang làm. Danh sách: `design/stitch/README.md`.
- **Không gọi Stitch khi code tính năng.** Thiết kế chỉ được tải qua quy trình `docs/workflows/stitch-sync.md` (trong Claude Code: `/stitch-sync`); thiếu màn hình → báo người dùng.
- HTML Stitch là tham chiếu bố cục; dựng bằng component của repo, màu/chữ từ token (`docs/08_UI_UX_Specification.md` §2).

## Không làm trùng việc

- Mỗi việc chỉ một lần lập kế hoạch, lưu ở `docs/plans/<nhánh>.md`; agent nào làm tiếp cũng dùng kế hoạch đó, không lập lại. Một lần kiểm chứng cuối nhánh, không review từng commit.
- Kiểm tra máy móc dùng công cụ, không dùng AI: lint, typecheck, test, `dependency-cruiser` (ranh giới saas-core), script kiểm RLS policy, gitleaks. AI chỉ xem phần công cụ không bắt được.
- Chạy test đúng phạm vi đã đổi; lọc output (chỉ lỗi). Không chạy lại cả bộ khi chưa sửa gì.
- Không tóm tắt lại kết quả mà công cụ đã in rõ.

## Cách làm việc

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

## Cấm

- Đọc `.env*` hoặc bất kỳ file bí mật nào; in biến môi trường.
- Chạy migration hoặc lệnh ghi lên database production/staging từ máy dev.
- Sửa `docs/01–16` khi chưa được yêu cầu (đề xuất thay đổi bằng lời).
- Tạo dữ liệu khách giả làm số liệu; seed chỉ `plans` và từ điển viết tắt hệ thống.
- Thêm thư viện mới mà không nêu lý do và giấy phép.

## Phối hợp nhiều agent (Claude Code + Codex)

- **Một nhánh, một agent tại một thời điểm.** Không để hai agent cùng sửa một nhánh. Đổi agent chỉ ở điểm dừng: sau khi commit và ghi `docs/handoff/<nhánh>.md`.
- **Trạng thái nằm trong repo, không trong trí nhớ phiên:** `docs/plans/<nhánh>.md` (kế hoạch đã duyệt), `docs/handoff/<nhánh>.md` (đã làm, file đã đọc + điều rút ra, việc còn lại, agent vừa làm), `docs/codemap.md`, `docs/gap-matrix.md`. Agent nhận việc đọc các file này trước, không đọc lại source đã được ghi.
- **Không lập lại kế hoạch, không làm lại việc đã commit.** Thấy kế hoạch sai → ghi đề xuất sửa vào `docs/plans/<nhánh>.md` mục "Đề xuất thay đổi" và dừng chờ chủ dự án.
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
