# Kế hoạch `chore/e2e-playwright` — kịch bản cổng 0 chạy tự động bằng trình duyệt thật

## Việc

Mã gap matrix: (mới) `E2E-GATE0` · Spec: `docs/14_Test_Plan.md` (E2E), `docs/16` §3 GĐ0 (cổng 0), `docs/07` UF-1.

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Hiện mỗi lần xong một nhánh bạn phải tự bấm toàn bộ kịch bản cổng 0 (đăng ký → xác minh email → tạo workspace → bật 2FA → mời Staff → nhận lời mời → chuyển workspace) ở hai ngôn ngữ. Nhánh này viết kịch bản đó thành test Playwright (công cụ điều khiển trình duyệt thật) chạy bằng một lệnh `pnpm e2e`, đọc email từ Mailpit, nên bạn chỉ phải xem kết quả. Rủi ro: test giao diện dễ "gãy" khi đổi chữ/bố cục, nên chọn phần tử theo vai trò/nhãn có sẵn và giữ kịch bản chỉ ở luồng chính.

## Điểm chưa rõ

Quyết định của chủ dự án (đồng ý khuyến nghị):

1. Quyết định: **E2E chạy trên máy code bằng `pnpm e2e`, chưa vào CI**. Bổ sung: ghi gap matrix `E2E-CI` ("E2E trên CI" với service container Valkey + Mailpit) làm nhánh sau.
2. Quyết định: **thêm `@playwright/test` (Apache-2.0)**; trình duyệt cài một lần bằng `pnpm exec playwright install chromium`.
3. Quyết định: **dữ liệu thử ở DB test** (`cf_test`/`cf_test_<làn>`), email ngẫu nhiên `e2e-<mã>@example.test`, không dùng `cf_dev`.

## Tiêu chí nghiệm thu

1. `pnpm e2e` khởi động web ở chế độ thật (`next build` + `next start` hoặc `next dev` theo cấu hình) với `DATABASE_*` trỏ DB test, chờ `/api/health` rồi chạy test, rồi tắt web — kiểm bằng: chạy một lần, web không còn chạy sau khi xong.
2. Kịch bản **Owner**: đăng ký → đọc thư xác minh từ Mailpit (REST `/api/v1/search`) → bấm link → đăng nhập → tạo workspace → bị chuyển tới `/app/security` → bật 2FA (mã TOTP tính bằng khóa nhập tay hiển thị, xác nhận 6 số) → vào được `/app` — kiểm bằng: test Playwright xanh.
3. Kịch bản **mời Staff**: Owner mời email mới → đọc thư mời từ Mailpit → cửa sổ trình duyệt mới (ngữ cảnh riêng) mở link → đăng ký → xác minh → quay lại nhận lời mời → Staff thấy workspace, không thấy trang Thành viên (404) → Owner thấy Staff trong danh sách — kiểm bằng: test Playwright xanh.
4. Kịch bản **chuyển workspace và cô lập**: Owner có hai workspace, chuyển qua lại thấy tên đúng; mở `/invite/<token lạ>` ra màn "không dùng được" cùng nội dung với lời mời đã dùng — kiểm bằng: test Playwright xanh.
5. Cả ba kịch bản chạy ở **tiếng Việt và tiếng Anh** (tham số hóa theo locale; khẳng định theo vai trò/nhãn lấy từ `vi.json`/`en.json`, không chép chuỗi cứng) — kiểm bằng: báo cáo Playwright có đủ 2 × 3 ca.
6. Test tự dọn: không để tiến trình web/trình duyệt treo; người dùng/workspace thử không làm hỏng lần chạy sau (email ngẫu nhiên) — kiểm bằng: chạy hai lần liên tiếp đều xanh.
7. Không đưa bí mật vào repo/log: không đọc `.env*` bằng agent; test lấy URL/DB từ biến môi trường như web — kiểm bằng: `gitleaks` + đọc diff.
8. Công cụ xanh: `pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise && pnpm check:plans`; `pnpm test` không chạy E2E (E2E tách khỏi test đơn vị).

## File sẽ đọc (≤ ~8, kèm lý do)

1. `apps/web/src/server/env.ts` — danh sách biến web cần khi chạy E2E.
2. `apps/web/package.json`, `package.json` (gốc) — script `dev/start`, nơi thêm `e2e`.
3. `scripts/lib/load-env.mjs` — nạp `.env` giống test tích hợp.
4. `packages/saas-core/tests/totp.ts` — mẫu tính mã TOTP cho test (tái dùng thuật toán, không import test của gói khác).
5. `apps/web/src/components/security/two-factor-card.tsx` — nhãn/vai trò phần tử khi bật 2FA.
6. `apps/web/src/components/app/{invite-form,create-workspace-form,workspace-switcher}.tsx` — nhãn/vai trò phần tử.
7. `packages/shared/src/i18n/messages/{vi,en}.json` — lấy chuỗi nhãn theo locale.
8. `.gitignore`, `biome.json` — bỏ qua `test-results/`, định dạng thư mục e2e.

## File sẽ sửa / tạo

- `e2e/` (thư mục mới ở gốc, gói `@flow/e2e`): `playwright.config.ts`, `package.json`, `tsconfig.json`, `tests/gate0.spec.ts`, `support/{mailpit,totp,env,i18n}.ts`.
- `scripts/e2e.mjs` — chạy migrate DB test → khởi động web → chờ health → `playwright test` → tắt web; hỗ trợ `CF_LANE`.
- `package.json` (script `e2e`), `pnpm-workspace.yaml` (thêm `e2e`), `.gitignore`, `.dependency-cruiser.cjs` (e2e không import `apps/*` ngoài đường dẫn công khai nếu cần), `docs/codemap.md`, `docs/gap-matrix.md` (`E2E-GATE0` ✅, `E2E-CI` thiếu), `docs/14_Test_Plan.md` **không sửa** (đề xuất bằng lời).
- `docs/workflows/finish.md`: thêm bước "nếu diff đụng luồng cổng 0 → chạy `pnpm e2e`" — đề xuất, cần bạn đồng ý.

## Migration

Không có.

## Test viết trước

Chính nhánh này là test. Phần logic phụ có test đơn vị: `support/totp.ts` (so với vector chuẩn RFC 6238), `support/mailpit.ts` (rút link/token từ thân thư bằng dữ liệu mẫu), `scripts/e2e.mjs` (chỉ kiểm tên DB/biến, không khởi động web trong test đơn vị).

## Lệnh test phạm vi hẹp

```
pnpm --filter @flow/e2e exec vitest run          # test đơn vị của support/*
pnpm e2e                                         # cả bộ (cần máy ảo + Mailpit + trình duyệt đã cài)
pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise && pnpm check:plans
```

## Cần kiểm chứng độc lập không?

**Không.** Chỉ thêm test và công cụ; không sửa mã sản phẩm, auth hay DB. (Nếu để chạy được E2E phải đổi mã sản phẩm — ví dụ thêm `data-testid` — tôi dừng và ghi vào "Đề xuất thay đổi" thay vì tự sửa.)

## Rủi ro / câu hỏi cho chủ dự án

- **Bạn cần cài trình duyệt một lần:** `pnpm exec playwright install chromium` (tôi không tự tải file lớn).
- Test dùng thư thật qua Mailpit nên cần Mailpit và Valkey trên máy ảo bật; thiếu → `pnpm e2e` báo rõ lý do, không treo.
- Rate limit đăng ký 5/giờ/IP sẽ chặn chạy E2E nhiều lần: dev không có IP (chỉ xô theo email), nên email ngẫu nhiên không bị chặn; nếu vẫn gặp thì đặt `REDIS_KEY_PREFIX` riêng cho E2E.
- 2FA bật cho Owner làm kịch bản dài (~1–2 phút/ca); chạy 6 ca tuần tự ~10 phút — chấp nhận ở nhánh này, song song hóa sau.

## Đề xuất thay đổi

- `docs/14_Test_Plan.md`: ghi E2E cổng 0 ở mục E2E (Playwright, chạy cục bộ, chưa CI).
- `docs/workflows/finish.md`: thêm bước chạy `pnpm e2e` khi diff đụng luồng cổng 0.

## Complexity tracking

- **Thêm thư viện `@playwright/test` (Apache-2.0)** — đi ngược "không thêm thư viện khi chưa nêu lý do": cần để điều khiển trình duyệt thật, không có cách khác kiểm luồng giao diện/cookie/2FA; phương án đơn giản hơn đã loại: test Server Action bằng HTTP thô (khó vì id action của Next đổi mỗi lần build, không kiểm được giao diện) và bắt bạn bấm tay (chính vấn đề cần giải quyết).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo

## Trạng thái duyệt

**Đã duyệt** (chủ dự án, 03/11/2026: đồng ý khuyến nghị kèm bổ sung ở mục "Điểm chưa rõ").
