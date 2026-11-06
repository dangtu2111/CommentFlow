# Kế hoạch `feat-dev-seed-demo` — Dữ liệu mẫu có nhãn cho DEV (UI-first)

## Việc

Mã gap matrix: `DEV-SEED-DEMO` · Spec: `AGENTS.md` § Cấm/§ Thiết kế giao diện, Q-UIF1 (chủ dự án chốt 06/11/2026).

**Tóm tắt:** Thêm lệnh `pnpm dev:seed-demo` (và `--reset`) tạo một workspace "[MẪU] Demo Shop" với tài khoản Owner/Staff thử, kênh Facebook/Instagram GIẢ, bài viết, ~40 bình luận, bản nháp AI, sản phẩm, kiến thức… để hoàn thiện giao diện theo thiết kế Stitch trước khi gắn chức năng. Lệnh CHỈ chạy trên DB `cf_dev` với `APP_ENV=dev`; từ chối staging/production/`cf_test` và DB có dấu `cf.env` staging/production. Rủi ro chính là chạy nhầm lên môi trường thật — vì vậy có nhiều lớp chặn và test cho từng lớp. Dữ liệu mẫu luôn mang nhãn `[MẪU]`, không phải số liệu thật.

## Điểm chưa rõ

Không có. (Quyết định tự chọn phương án an toàn, ghi ở `QUYET_DINH_CHO_DUYET.md` mục Q-UIF1.)

## Tiêu chí nghiệm thu

1. Guard từ chối mọi môi trường không phải dev + `cf_dev` (APP_ENV khác `dev`, DB `cf_test`/`cf_test_x`/`cf_ci`/tên lạ, thiếu URL, ba URL kết nối trỏ DB khác nhau, dấu `cf.env` = staging/production) — kiểm bằng `tools/dev-seed/src/guard.test.ts`.
2. Mật khẩu sinh ngẫu nhiên đủ mạnh, khác nhau mỗi lần, không ghi file — kiểm bằng `credentials.test.ts`.
3. Bộ dữ liệu mẫu: ≥ 40 bình luận vi/en đủ các nhãn (hỏi giá, size, tồn kho, khiếu nại, SĐT đã che, spam), mọi tên kênh/workspace/tác giả/sản phẩm có `[MẪU]`, không SĐT/email thô, trạng thái/nhãn hợp lệ theo CHECK, mỗi bản nháp trỏ đúng một bình luận — kiểm bằng `demo-data.test.ts`.
4. Chạy lại không tạo trùng (idempotent); `--reset` xóa đúng workspace/tài khoản mẫu rồi tạo lại — kiểm bằng bước tay KT-DSD (cần DB dev; không chạy được ở làn này vì không có `.env`).
5. `pnpm lint && lint:i18n && typecheck && depcruise && check:plans && test:trace` xanh; `pnpm --filter @flow/dev-seed test` xanh.
6. `AGENTS.md` § Thiết kế giao diện / § Cấm và `docs/workflows/feature.md` cập nhật đúng quyết định UI-first + dữ liệu mẫu chỉ trên dev — kiểm bằng đọc diff.

## File sẽ đọc (đã đọc)

`packages/db/src/{migration-guard,client,admin,cli-env}.ts`, `schema/cf/{channels,posts,comments,drafts,products,ai-usage}.ts`, `queries/{drafts,kb-content}.ts`, `packages/saas-core/src/tenancy/{tenancy,action-log}.ts`, `auth/password.ts`.

## File sẽ sửa / tạo

- Tạo `tools/dev-seed/` (gói `@flow/dev-seed`): `guard.ts`, `credentials.ts`, `demo-data.ts`, `seed.ts`, `cli.ts` + test cạnh file.
- Sửa `package.json` (script `dev:seed-demo`), `pnpm-lock.yaml`, `env.example` (không đổi tên biến mới), `AGENTS.md`, `docs/workflows/feature.md`, `docs/testing/STANDARD.md` §6, `docs/codemap.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/plans/QUYET_DINH_CHO_DUYET.md`, `docs/testing/KIEM_TRA_TAY.md`, `docs/handoff/feat-dev-seed-demo.md`.

## Migration

Không có.

## Test viết trước

Guard (`assertDevSeedAllowed`) và sinh mật khẩu, tính hợp lệ bộ dữ liệu — viết test đỏ trước.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/dev-seed test` · `pnpm --filter @flow/dev-seed typecheck`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (guard môi trường, tạo tài khoản/mật khẩu, xóa dữ liệu bằng `--reset`).

## Rủi ro / câu hỏi cho chủ dự án

- Tài khoản tạo bằng role `cf_owner` (đường admin như `pnpm db:migrate`) + `hashPassword` của saas-core, không qua luồng đăng ký/xác minh email (cần SMTP + rate limit); email đặt `email_verified=true`. Lý do ở Q-UIF1.
- Chưa có bảng `leads` và bảng quy tắc spam → bỏ phần này, ghi vào gap matrix.
- Ở làn này không có `.env`/DB → phần điều phối DB (`seed.ts`) chỉ qua typecheck, chưa chạy thật.

## Đề xuất thay đổi

Xem Q-UIF1.

## Complexity tracking

Gói workspace mới `tools/dev-seed` (không thêm thư viện ngoài; chỉ dùng gói nội bộ + `pg`, `tsx`, `vitest` đã có trong repo). Đi cạnh nguyên tắc "giữ cấu trúc thư mục": `tools/*` đã là workspace; phương án đơn giản hơn (đặt trong `packages/db`) bị loại vì db không được phụ thuộc saas-core (`hashPassword`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: quyết định đã chốt bởi chủ dự án 06/11/2026; mọi chỗ mơ hồ ghi Q-UIF1).
