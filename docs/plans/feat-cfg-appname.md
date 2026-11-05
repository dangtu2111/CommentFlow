# Kế hoạch `feat-cfg-appname` — Tên sản phẩm, logo, tên miền, email gửi cấu hình được

Mã gap matrix: `CFG-APPNAME` · Spec: FR-125 (docs/05). Quyết định tự chọn: `QAN1` trong `docs/plans/QUYET_DINH_CHO_DUYET.md`.

**Tóm tắt:** tên sản phẩm chưa chốt (Q6), nên giao diện và email không được viết cứng "CommentFlow AI". Thêm bốn biến cấu hình (`APP_NAME`, `APP_LOGO_URL`, `APP_DOMAIN`, `APP_EMAIL_FROM`) đọc bằng Zod, có giá trị tạm; web, thư và tên trong app 2FA đều lấy từ đó. Rủi ro thấp: không đụng DB, không đụng bí mật; `SMTP_FROM` cũ vẫn chạy.

## Điểm chưa rõ

Không có. (Mặc định tên = "CommentFlow AI", logo/domain trống; ghi ở QAN1.)

## Tiêu chí nghiệm thu

1. Không đặt biến nào → tên "CommentFlow AI", không logo/domain; có đặt → đọc đúng, cắt khoảng trắng, rỗng = chưa đặt — kiểm bằng `packages/shared/src/brand.test.ts`.
2. Giá trị sai (logo không phải đường dẫn gốc/http(s), domain có scheme/đường dẫn, tên quá dài/ký tự điều khiển) bị từ chối, lỗi chỉ nêu tên biến — kiểm bằng cùng file test.
3. Cả 5 loại thư × vi/en dùng tên cấu hình, không còn tên cứng; tên được escape trong HTML; `createNotifier` truyền tên xuống — kiểm bằng `packages/saas-core/src/notify/notify.test.ts`.
4. Web: `loadServerEnv` trả `brand` + `mailFrom` (ưu tiên `SMTP_FROM`, rồi `APP_EMAIL_FROM`, rồi tên + domain; thiếu hết → lỗi) — kiểm bằng `apps/web/src/server/env.test.ts`.
5. Giao diện (đầu trang, tiêu đề tab, chân trang, issuer 2FA) lấy tên từ cấu hình; khóa i18n `brand` đã bỏ — kiểm bằng `pnpm lint:i18n` + `pnpm typecheck` + bước KT-016.
6. `env.example` chỉ có tên biến — kiểm bằng review diff + gitleaks của CI.

## File sẽ đọc / sửa

Đã đọc: `packages/shared/src/{env,index}.ts`, `packages/saas-core/src/notify/{templates,notifier,index}.ts`, `auth/auth.ts` (issuer), `apps/web/src/server/{env,auth}.ts`, `components/auth/auth-shell.tsx`, `(guarded)/layout.tsx`, các `page.tsx` có `generateMetadata`.

Sửa/tạo: `packages/shared/src/brand.ts` (+test, export), `saas-core` notify + auth, `apps/web/src/server/{brand,env,auth}.ts`, `components/brand-logo.tsx`, `auth-shell.tsx`, layout + 15 `page.tsx`, `globals.css`, `messages/{vi,en}.json`, `env.example`, docs (CAN_BAN_CUNG_CAP, KIEM_TRA_TAY, QUYET_DINH, codemap, gap-matrix, MASTER, handoff).

## Migration

Không có.

## Test viết trước

`brand.test.ts`, mục "FR-125" trong `notify.test.ts` và `env.test.ts` (viết trước khi code, đỏ rồi xanh).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/brand.test.ts` · `pnpm --filter @flow/saas-core exec vitest run src/notify` · `pnpm --filter @flow/web exec vitest run src/server/env.test.ts` · `pnpm --filter @flow/shared test:coverage` · `pnpm --filter @flow/saas-core test:coverage`

## Cần kiểm chứng độc lập không?

Không. Không chạm auth/phiên/token/RLS (chỉ đổi chuỗi issuer 2FA và chủ đề thư; tên được chuẩn hóa như tên hiển thị trước khi vào thư).

## Rủi ro / câu hỏi cho chủ dự án

- Đặt tên thật + tên miền khi chốt Q6 (bảng ở `docs/CAN_BAN_CUNG_CAP.md` §2b); tên miền gửi thư cần SPF/DKIM.
- Landing/điều khoản/chính sách (PUBLIC-PAGES) là việc khác, chờ Q6.

## Đề xuất thay đổi

Không có.

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

**Đã duyệt** (tự duyệt: mọi quyết định nằm trong FR-125 + QAN1; không còn thẻ chưa rõ).
