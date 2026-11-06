# Kế hoạch `feat-auth-lang-pref` — Lưu ngôn ngữ theo người dùng (AUTH-LANG-PREF)

## Việc

Mã gap matrix: `AUTH-LANG-PREF` · Spec: FR-119 (`docs/05`), `docs/08` §8.

**Tóm tắt (2–3 câu):** Khi người dùng đã đăng nhập đổi ngôn ngữ, ngoài cookie `NEXT_LOCALE` (ghi nhớ trên trình duyệt) hệ thống còn ghi vào `users.locale` (để email và lần đăng nhập sau trên máy khác dùng đúng ngôn ngữ). Bộ chọn ngôn ngữ cũng được đặt vào trang Cài đặt (`/app/security`, trang Cài đặt tạm cho tới SETTINGS-PAGE). Rủi ro thấp: DB lỗi thì cookie vẫn đổi, chỉ ghi log lỗi (không lộ dữ liệu).

## Điểm chưa rõ

Không có. Quyết định tự chọn Q-LANG-1 (xem `QUYET_DINH_CHO_DUYET.md`): dùng lại action `setLocale` hiện có (một đường duy nhất cho thanh trên + Cài đặt); khách chưa đăng nhập chỉ đổi cookie.

## Tiêu chí nghiệm thu

1. `tenancy.setUserLocale(userId, locale)` ghi `users.locale` của đúng người đó qua `withUser`, không đổi người khác; locale ngoài vi/en → `VALIDATION_FAILED` — kiểm bằng: `tenancy.int.test.ts` (DB thật) + `tenancy-locale.test.ts` (unit).
2. `applyLocaleChoice`: giá trị không hợp lệ → không làm gì; luôn đặt cookie; có phiên → lưu DB; không phiên → không gọi DB; lưu DB lỗi → cookie vẫn đặt, không ném lỗi, log không chứa dữ liệu thô — kiểm bằng: `locale-choice.test.ts`.
3. Trang Cài đặt (`/app/security`) có bộ chọn ngôn ngữ, chuỗi qua i18n vi/en — kiểm bằng: `pnpm lint:i18n`, test khớp khóa, KT-017 thủ công.
4. Công cụ xanh: lint, lint:i18n, typecheck, depcruise, check:plans, test:trace, test phạm vi, coverage `saas-core`/`shared` không giảm.

## File sẽ đọc

`locale-switcher.tsx`, `locale-cookie.ts`, `app/actions.ts`, `server/session.ts`, `tenancy.ts`, `tenancy.int.test.ts`, `security/page.tsx`, `vi.json`.

## File sẽ sửa / tạo

- `packages/saas-core/src/tenancy/tenancy.ts` — thêm `setUserLocale`.
- `packages/saas-core/tests/tenancy.int.test.ts`, `packages/saas-core/src/tenancy/tenancy-locale.test.ts` — test.
- `apps/web/src/server/locale-choice.ts` (+ `.test.ts`) — logic chọn ngôn ngữ (cookie + lưu DB).
- `apps/web/src/app/actions.ts` — `setLocale` gọi `applyLocaleChoice`.
- `apps/web/src/app/app/security/page.tsx` — thêm thẻ ngôn ngữ; `vi.json`/`en.json` — khóa `language.settings*`.
- Docs: codemap, gap-matrix, MASTER, handoff, KIEM_TRA_TAY (KT-017), QUYET_DINH_CHO_DUYET.

## Migration

Không có (`cf_app` đã được GRANT UPDATE `users.locale` ở migration 0010, đã có test `auth-rls.int.test.ts`).

## Test viết trước

Cả ba file test ở trên viết trước, chạy đỏ rồi mới viết mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/saas-core exec vitest run src/tenancy/tenancy-locale.test.ts` · `pnpm --filter @flow/web exec vitest run src/server/locale-choice.test.ts` · `CF_LANE=a pnpm test:db` (nếu máy phụ bật).

## Cần kiểm chứng độc lập không?

Không (không chạm auth/token/RLS mới; chỉ dùng quyền GHI cột đã có).

## Rủi ro / câu hỏi cho chủ dự án

Không có.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò — không có bảng mới

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec FR-119/08 §8 và Q-LANG-1).
