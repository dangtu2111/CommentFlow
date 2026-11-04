# Chuẩn test của CommentFlow

> Áp dụng cho mọi tính năng trong `docs/plans/MASTER.md`. Công cụ kiểm được ghi ở từng mục; mục nào **chưa cài** thì ghi rõ và chỉ bắt buộc từ khi cài. Kiểm tay (chủ dự án bấm thử): `docs/testing/KIEM_TRA_TAY.md` (danh sách dồn, xem §9). Skill hỗ trợ: `.claude/skills/test-driven-development`, `systematic-debugging`, `verification-before-completion` (`docs/decisions/006-skills.md`).

## 1. Tầng test

| Tầng | Công cụ | Chạy ở | Lệnh | Ghi chú |
|---|---|---|---|---|
| Đơn vị | Vitest (`*.test.ts`), pytest (`services/ml`) | máy code, CI | `pnpm test` · `cd services/ml && uv run pytest` | không cần DB/mạng |
| Tích hợp (DB thật) | Vitest `vitest.int.config.ts` trên `cf_test` (`cf_test_<làn>`) | máy code + máy ảo, CI job `database` | `pnpm test:db` · `pnpm db:check-rls` | RLS, `withWorkspace`/`withActor`, hàng đợi, rate limit |
| Hợp đồng (contract) | Vitest + fixture webhook/API đã ghi | CI | `pnpm test` | **chưa có** — bắt đầu ở `WEBHOOK-*`/`FB-*`; fixture đã che PII |
| E2E | Playwright (`e2e/`), theo UF trong `docs/07` | máy code (CI: `E2E-CI`) | `pnpm e2e` | luồng chính chạy cả `vi` và `en` |
| Đánh giá AI | promptfoo (`docs/14` §4) | CI, trước khi đổi prompt/model | — | **chưa cài**; làm ở GĐ2 (`AI-EVAL-*`) |
| Kiểm tay | chủ dự án | sau mỗi tính năng | — | `KIEM_TRA_TAY.md` |

Chọn tầng thấp nhất kiểm được hành vi. Logic thuần → đơn vị; chạm DB/RLS/hàng đợi → tích hợp; luồng người dùng qua nhiều trang → E2E (ít, chỉ luồng chính).

## 2. Truy vết FR/US trong tên test

- Tên `describe`/`it`/`test` mang mã: `describe('FR-034 ghi ai_usage', …)`, `it('US-004 …')`. Một test có thể mang nhiều mã.
- Mỗi mã FR của dòng gap matrix trạng thái **✅ Xong** phải có ≥ 1 test mang mã đó. Cổng: `pnpm test:trace` (CI). Mã chỉ được tính khi nằm trong **tiêu đề** test, không phải chú thích.
- **Nợ truy vết** của dòng đã Xong từ trước nằm ở `docs/testing/trace-baseline.json`. Cổng **đỏ** với mã FR mới thiếu test ngoài baseline; luôn in số nợ còn lại. Baseline chỉ **giảm**: thêm test rồi xóa mã; không thêm mã vào baseline để qua cổng.
- Khoảng mã `FR-001–005` được hiểu là từng mã. Test Python chưa được quét (bổ sung khi `services/ml` có FR Xong).

## 3. Mỗi thay đổi cần test gì

| Thay đổi | Test bắt buộc |
|---|---|
| Bảng mới có `workspace_id` | Migration + RLS + policy; test tích hợp truy cập **chéo workspace** (workspace B không thấy/ghi được của A); `pnpm db:check-rls` đạt; nêu policy GHI theo vai trò (`withActor`) hay theo workspace (`withWorkspace`) |
| Action / route / Server Action mới | Test **404 chéo workspace** (id của workspace khác → 404, không 403 lộ tồn tại); test quét `requireAppUser` (mọi route trong `/app/(guarded)` phải qua cổng) |
| Chuỗi giao diện mới | `pnpm lint:i18n` (không viết cứng) + test khớp khóa `vi`/`en`; luồng chính có E2E chạy cả `vi` và `en` |
| Gọi LLM | `ai_usage` được ghi (model, token, chi phí, bước, `prompt_version`); PII đã che trước khi gửi |
| Webhook / API ngoài | Contract test với fixture đã ghi; chữ ký sai bị từ chối; gửi lại không trùng |
| Sửa lỗi | Test hồi quy đỏ trước, xanh sau (skill `systematic-debugging`, `test-driven-development`) |
| Hành động chạm nền tảng thật | Chạy trên Page/IG thử ở staging (`/staging-verify`), không tạo dữ liệu khách giả |

## 4. TDD bắt buộc (test đỏ trước) cho logic quy tắc

Viết test, chạy thấy **đỏ đúng lý do**, rồi mới viết mã; commit có thể gộp nhưng lịch sử làm việc phải theo thứ tự đó (skill `test-driven-development`). Áp dụng cho:

cổng tự gửi · `sendRecheck` R1–R9 · `decideAction` · độ tin cậy (§6.0) · guard số tiền/ngày/link/SĐT · hạn mức và đồng hồ lượt · cửa sổ 24 giờ/7 ngày · che PII · nhận diện ngôn ngữ · rate limit · feature flag · chuẩn hóa văn bản · băm rollout · tách thông tin (`extract`).

Quy tắc: mỗi nhánh của quy tắc một test; ca biên (đúng ngưỡng, ±1, rỗng, Unicode); ca đua (hai worker cùng lúc) cho gửi/hạn mức, dùng DB thật.

## 5. Property-based

Dùng khi quy tắc có không gian đầu vào lớn: che PII (mọi chuỗi chứa SĐT/email dạng bất kỳ đều bị che, văn bản không PII không đổi), chuẩn hóa văn bản (lũy đẳng: `f(f(x)) = f(x)`), guard số tiền (mọi số tiền trong câu phải có trong nguồn), thứ tự cổng (đổi thứ tự đầu vào không đổi quyết định), băm rollout (phân bố ổn định, cùng khóa → cùng kết quả), `extract`.

Công cụ: `fast-check` (TS, MIT), `hypothesis` (Python, MPL-2.0). **Chưa cài** — cài ở nhánh đầu tiên cần, nêu lý do và giấy phép ở "Complexity tracking" của plan (`AGENTS.md`: không thêm thư viện khi chưa nêu). Cố định `seed` khi tái hiện lỗi; ca tìm ra lỗi chép thành test ví dụ.

## 6. Dữ liệu và fixture

- Không dữ liệu khách giả làm số liệu; seed chỉ `plans` và từ điển viết tắt hệ thống (`AGENTS.md`).
- Fixture tối thiểu, đặt tên/chú thích rõ là fixture (`*.fixture.ts`/`fixtures/`), không giống dữ liệu thật.
- Bình luận thật chỉ dùng bản **đã che PII**; không dán bình luận thật chưa che vào test, issue, hay phiên Codex.
- Không đọc/in `.env*`; test tích hợp lấy biến qua `scripts/lib/load-env.mjs`.

## 7. Cô lập, ổn định

- Mỗi test **tự dựng và dọn** dữ liệu; không phụ thuộc thứ tự chạy, không dùng dữ liệu của test khác. Làn song song dùng DB riêng (`CF_LANE`, `docs/workflows/parallel.md`).
- Không `sleep` cứng: chờ điều kiện bằng **poll có hạn** (timeout rõ, báo lỗi nêu điều kiện đang chờ). Thời gian giả lập bằng fake timers (`vi.useFakeTimers`), không dựa đồng hồ thật.
- Cổng, khóa Redis, cache trong test có tiền tố riêng (`REDIS_KEY_PREFIX`), không đụng khóa của làn khác.
- **Flaky là lỗi:** sửa gốc (skill `systematic-debugging`), không bật retry để che. Test bị `skip`/`todo` phải ghi lý do + số issue ngay cạnh; không có thì xóa.
- Không tắt test/lint/ngưỡng để qua CI.

## 8. Ngưỡng coverage và mutation testing

**Mục tiêu** (đích, ratchet dần): `packages/ai`, `packages/shared`, `packages/saas-core` ≥ **85%** dòng và nhánh; module logic quy tắc (§4) ≥ **95%** nhánh.

**Ngưỡng đang ép ở CI** (`pnpm test:coverage`, Vitest + `@vitest/coverage-v8`, chỉ test đơn vị — đo 04/11/2026, làm tròn xuống; nâng khi đo được cao hơn, không bao giờ hạ):

| Gói | Dòng | Câu lệnh | Hàm | Nhánh | Đích |
|---|---|---|---|---|---|
| `packages/ai` | 100 | 97 | 100 | 90 | đã vượt 85 |
| `packages/shared` | 100 | 100 | 100 | 93 | đã vượt 85 |
| `packages/saas-core` | 41 | 40 | 39 | 41 | 85 — nợ `TEST-COVERAGE-GAP` (phần lớn mã chỉ được test tích hợp phủ) |

- Ngưỡng nằm ở `packages/*/vitest.config.ts`. **Test tích hợp không bật coverage** trong CI (sẽ làm job `database` chậm và cần gộp báo cáo hai lần chạy); khi có nhu cầu, đo riêng và gộp, chỉ bật nếu thêm < 1 phút. Vì vậy `saas-core` đang được đo thiếu so với thực tế.
- Nhánh nâng ngưỡng: đo lại (`pnpm test:coverage`), sửa số trong config + bảng trên + dòng `TEST-COVERAGE-GAP`.
- Module logic quy tắc (§4) nằm trong `saas-core`/`ai`/`shared` sẽ được ép ngưỡng 95% nhánh theo file ngay khi file đó tồn tại (thêm vào `coverage.thresholds` dạng glob).

**Mutation testing (Stryker, Apache-2.0) — chỉ mô tả, chưa cài.** Phạm vi: cổng tự gửi, `sendRecheck`, guard, `decideAction`. Ngưỡng: ≥ **80%** mutant bị diệt; chạy **trước khi merge** nhánh chạm các module này (không chạy mọi commit — chậm). Cài ở nhánh `feat/auto-send-gate` (hoặc nhánh đầu tiên tạo các module đó), nêu giấy phép ở plan.

## 9. Kiểm tra tay

Sau mỗi tính năng agent thêm mục vào đầu `docs/testing/KIEM_TRA_TAY.md` (≤ 10 bước, vi + en, kết quả mong đợi từng bước); chủ dự án thử rồi ghi kết quả. Mục chưa thử ở trạng thái "chưa" là **kiểm tra tay dồn**; việc này không thay thế test tự động, chỉ bổ sung phần máy khó kiểm (giao diện, thư thật, nền tảng thật).

## 10. Trước khi báo xong một tính năng

`pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise && pnpm check:plans && pnpm check:migrations && pnpm test && pnpm test:coverage && pnpm test:trace` — nhánh có DB thêm `pnpm test:db` và `pnpm db:check-rls`; nhánh nhạy cảm thêm một lần verifier độc lập (`docs/workflows/verify.md`). Nói "đã chạy" chỉ khi đã chạy trong lượt đó (skill `verification-before-completion`).
