# Kế hoạch `chore/build-system` — Hệ thống xây dựng: MASTER, chuẩn test, truy vết, coverage, skill

Mã gap matrix: `BUILD-SYSTEM`, `TEST-COVERAGE-GAP` · Spec: `docs/PROMPT_BUILD_TOAN_BO.md` §0 (mục 0.1–0.6), `docs/14` §3–§4, `docs/16` §3.

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Dựng "bộ khung làm việc" để xây các giai đoạn sau mỗi tính năng một lần, kiểm được bằng máy: danh sách toàn bộ tính năng theo thứ tự (`MASTER.md`), chuẩn viết test (`STANDARD.md`), một lệnh kiểm "tính năng đã Xong thì có test mang mã FR" (`pnpm test:trace`) và ngưỡng độ phủ test (coverage — phần trăm mã được test chạy qua) ở CI. Rủi ro thấp: không đụng mã nghiệp vụ; thêm một thư viện đo coverage (MIT) và 3 skill dạng văn bản.

## Điểm chưa rõ

Không có. Các điểm nhỏ đã chọn mặc định (xem "Quyết định mặc định" bên dưới); điểm cần chủ dự án quyết ghi ở "Rủi ro / câu hỏi".

**Quyết định mặc định (có lý do):**
1. Ngưỡng coverage = mức đo được làm tròn xuống, không hạ giả; mục tiêu 85%/95% ghi trong STANDARD, phần chênh là nợ `TEST-COVERAGE-GAP` (ratchet).
2. Không bật coverage cho test tích hợp (`test:db`): cần DB, sẽ làm job `database` chậm thêm và phải gộp báo cáo; đo coverage chỉ ở test đơn vị. Hệ quả: `saas-core` đo thiếu (41%).
3. `test:trace` chỉ đọc cột "Yêu cầu" của dòng gap matrix có trạng thái bắt đầu bằng ✅ và chỉ quét tiêu đề `describe/it/test` trong file `*.test.*`/`*.spec.*`; test Python chưa quét.
4. Skill chép dạng văn bản đã dịch/chỉnh; không tải file phụ trợ của nguồn; ghi nguồn + giấy phép + commit ở ADR 006.
5. Allow-list chỉ **đề xuất** trong `docs/testing/ALLOWLIST_DE_XUAT.md`; không sửa `.claude/settings.json`.

## Tiêu chí nghiệm thu

1. `docs/plans/MASTER.md` liệt kê mọi FR của `docs/16` §3.2 còn lại theo GĐ0–GĐ6, mỗi dòng đủ mã/FR/US-UF/phụ thuộc/nhạy cảm/tài nguyên ngoài/trạng thái; toàn bộ GĐ0 đánh dấu ✅ — kiểm bằng: đọc + đếm dòng theo GĐ; mọi mã FR trong `16` §3.2 xuất hiện ít nhất một lần (đối chiếu bằng grep).
2. `docs/testing/STANDARD.md` có đủ: tầng test, truy vết, TDD bắt buộc cho danh sách logic quy tắc, property-based, RLS chéo + quét `requireAppUser`, i18n, cô lập, flaky là lỗi, ngưỡng coverage + mutation (mô tả, chưa cài), không dữ liệu giả; liên kết tới `KIEM_TRA_TAY.md` — kiểm bằng: đọc theo mục 0.3 của PROMPT.
3. `pnpm test:trace` ĐỎ khi có mã FR mới ở dòng ✅ thiếu test ngoài baseline, XANH khi đủ hoặc nằm trong baseline, và in số nợ còn lại — kiểm bằng: `scripts/lib/test-trace.test.mjs` (10 ca) + chạy thật (`pnpm test:trace` in "nợ truy vết còn lại 10/10").
4. CI chạy `pnpm test:coverage` và `pnpm test:trace` — kiểm bằng: đọc `.github/workflows/ci.yml` (action đã pin như cũ, không thêm action mới).
5. Ngưỡng coverage ở `packages/{ai,shared,saas-core}/vitest.config.ts` bằng mức đo thật làm tròn xuống và `pnpm test:coverage` xanh; hạ ngưỡng 1 điểm trong thử nghiệm thì đỏ — kiểm bằng: chạy `pnpm test:coverage` (số đo: ai 100/97/100/90, shared 100/100/100/93, saas-core 41/40/39/41).
6. 3 skill ở `.claude/skills/*/SKILL.md` + `docs/decisions/006-skills.md` ghi nguồn, giấy phép MIT, commit — kiểm bằng: đọc; không có hook/script/plugin mới (`git diff --stat` chỉ có file `.md`).
7. `docs/testing/ALLOWLIST_DE_XUAT.md` có JSON mẫu + giải thích từng dòng + rủi ro; `.claude/settings.json` **không đổi** — kiểm bằng: `git diff --stat -- .claude/settings.json` rỗng.
8. `docs/codemap.md` và `docs/gap-matrix.md` có dòng mới (`test:trace`, `test:coverage`, `docs/testing/`, `.claude/skills`; `BUILD-SYSTEM`, `TEST-COVERAGE-GAP`) — kiểm bằng: đọc.
9. Bộ lệnh cuối nhánh xanh: `pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise && pnpm check:plans && pnpm check:migrations && pnpm test && pnpm test:trace` — kiểm bằng: chạy.

## File sẽ đọc (≤ ~8, kèm lý do)

- `AGENTS.md`, `docs/workflows/feature.md`, `docs/plans/TEMPLATE.md` — quy tắc repo, mẫu plan.
- `docs/PROMPT_BUILD_TOAN_BO.md` §0–§4 (bản ở worktree lane-b, chưa có trong main) — đặc tả việc.
- `docs/16` §3–§3.4, `docs/gap-matrix.md`, `docs/codemap.md` — nguồn MASTER và trạng thái.
- `docs/05` (cột FR/US), `docs/07`, `docs/04` (tên UF/US) — điền cột FR/US-UF.
- `scripts/check-plans.mjs`, `scripts/lib/plan-gate.test.mjs` (mẫu), `.github/workflows/ci.yml`, `packages/*/vitest.config.ts`.

## File sẽ sửa / tạo

Tạo: `docs/plans/MASTER.md`, `docs/testing/{STANDARD.md,ALLOWLIST_DE_XUAT.md,trace-baseline.json}`, `scripts/{check-test-trace.mjs,lib/test-trace.mjs,lib/test-trace.test.mjs}`, `packages/shared/vitest.config.ts`, `.claude/skills/{test-driven-development,systematic-debugging,verification-before-completion}/SKILL.md`, `docs/decisions/006-skills.md`.
Sửa: `package.json` (scripts `test:coverage`, `test:trace`), `packages/{ai,shared,saas-core}/package.json` + `vitest.config.ts` (coverage), `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `docs/codemap.md`, `docs/gap-matrix.md`. Thêm vào commit (có sẵn): `docs/testing/KIEM_TRA_TAY.md`.

## Migration

Không có.

## Test viết trước

`scripts/lib/test-trace.test.mjs` viết trước `test-trace.mjs` (trích mã FR gồm khoảng/danh sách rút gọn, đọc dòng ✅ của gap matrix, quét tiêu đề test, so với baseline: đỏ/xanh/nợ còn lại/baseline thừa).

## Lệnh test phạm vi hẹp

`cd scripts && pnpm exec vitest run lib/test-trace.test.mjs` · `pnpm test:trace` · `pnpm test:coverage`.

## Cần kiểm chứng độc lập không?

Không (không chạm auth, token, RLS, thanh toán, cổng tự gửi, PII, migration).

## Rủi ro / câu hỏi cho chủ dự án

- Coverage `saas-core` hiện 41% (đơn vị); nếu muốn ngưỡng phản ánh thật hơn, cần quyết định có đưa coverage vào job `database` (chậm hơn) hay không.
- `test:trace` chỉ ép mã FR **mới**; 10 mã FR cũ nằm baseline (nợ) — nên trả dần ở các nhánh chạm lại.
- `docs/PROMPT_BUILD_TOAN_BO.md` chưa nằm trong `main` (chỉ ở worktree khác) — plan này tham chiếu nó.

## Đề xuất thay đổi

- Cập nhật `docs/14` §3 (ngưỡng coverage 85%/95%, mutation ≥ 80% cho 4 module) và `docs/16` §8 (nhắc `test:trace`) khi chủ dự án cho phép; không tự sửa.

## Complexity tracking

- **Thêm thư viện:** `@vitest/coverage-v8@5.0.5` (devDependency của 3 gói), giấy phép **MIT**, cùng phiên bản `vitest`. Cần để đo coverage thật và ép ngưỡng ở CI (PROMPT §0.4). Phương án đơn giản hơn đã loại: tự viết script đếm dòng (không đo nhánh, dễ sai); `c8` riêng (thêm một công cụ trong khi plugin chính thức của Vitest đã đủ).
- Không có vi phạm nguyên tắc khác.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới" (không có bảng mới)

## Trạng thái duyệt

**Đã duyệt** (chủ dự án, theo `docs/PROMPT_BUILD_TOAN_BO.md` §0; "làm bước 0 như đề xuất").
