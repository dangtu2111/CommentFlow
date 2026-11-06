# Kế hoạch `feat-settings-page` — Trang Cài đặt (gom bảo mật + ngôn ngữ)

Mã gap matrix: `SETTINGS-PAGE` (làm rõ `AUTH-SESSIONS-UI`) · Spec: `docs/05` FR-001, FR-119; `docs/08` §3, §8; Stitch `settings-security`.

**Tóm tắt:** Thêm trang `/app/settings` (có khung ứng dụng + menu) gom ba khối: xác thực 2 bước, các phiên đăng nhập của chính mình và chọn ngôn ngữ. Menu "Bảo mật" đổi thành "Cài đặt" (cả Owner lẫn Staff đều thấy; khối chỉ-Owner vẫn nằm ở trang riêng của chúng). Trang `/app/security` giữ nguyên làm trang **bắt buộc bật 2FA** (nằm ngoài khung vì Owner chưa bật 2FA không có quyền vào khung). Rủi ro thấp: không đụng logic auth, chỉ tái dùng thành phần có sẵn.

## Điểm chưa rõ

Không có. (Quyết định tự chọn ghi ở `QUYET_DINH_CHO_DUYET.md` mã QS1.)

## Tiêu chí nghiệm thu

1. Menu của Owner và Staff đều có mục "Cài đặt" trỏ `/app/settings`, không còn mục "Bảo mật" — kiểm bằng `app-nav.test.ts`.
2. Mọi mục menu có nhãn `shell.nav.<khóa>` ở cả vi và en — kiểm bằng `app-nav.test.ts` + `messages.test.ts`.
3. `/app/settings` hiển thị thẻ 2FA, danh sách phiên (đăng xuất từng phiên) và bộ chọn ngôn ngữ; phiên hiện tại không có nút đăng xuất — kiểm tay KT-016 (bước 1–5).
4. Chọn ngôn ngữ ở Cài đặt đổi giao diện ngay (cookie `NEXT_LOCALE`) — KT-016 bước 6.
5. Owner chưa bật 2FA vẫn bị cổng chuyển tới `/app/security` và bật được (không đổi) — `app-access.test.ts` giữ xanh.
6. Mọi page/action mới qua `requireAppUser` — `require-app-user.scan.test.ts` xanh.
7. Không chuỗi viết cứng — `pnpm lint:i18n`.

## File sẽ đọc

`lib/app-nav.ts` (+test), `app/app/security/{page,actions}.tsx`, `components/security/two-factor-card.tsx` (chỉ import), `(guarded)/layout.tsx`, `locale-switcher.tsx`, `i18n/messages.test.ts`, `vi.json`/`en.json` (khối `auth.security`, `shell`).

## File sẽ sửa / tạo

- `apps/web/src/lib/app-nav.ts` (+ `.test.ts`): mục `security` → `settings`.
- `apps/web/src/app/app/(guarded)/settings/page.tsx`: trang mới.
- `apps/web/src/components/security/sessions-card.tsx`: tách danh sách phiên từ `security/page.tsx` (dùng ở 2 trang).
- `apps/web/src/components/settings/language-card.tsx`: thẻ chọn ngôn ngữ (gọi `setLocale` có sẵn).
- `apps/web/src/app/app/security/page.tsx`: dùng `SessionsCard`; thêm liên kết "Cài đặt".
- `apps/web/src/app/app/security/actions.ts`: `revalidatePath('/app/settings')` thêm.
- `packages/shared/src/i18n/messages/{vi,en}.json`: khóa `settings.*`, `shell.nav.settings`.
- `docs/` : gap-matrix, MASTER, codemap, handoff, KIEM_TRA_TAY (KT-016), QUYET_DINH_CHO_DUYET.

## Migration

Không có.

## Test viết trước

`app-nav.test.ts` (đỏ trước khi đổi `app-nav.ts`).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/app-nav.test.ts src/i18n src/server/require-app-user.scan.test.ts src/server/app-access.test.ts`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/token/RLS; chỉ bố cục + điều hướng; Server Action 2FA giữ nguyên, chỉ thêm `revalidatePath`).

## Rủi ro / câu hỏi cho chủ dự án

Đổi mật khẩu (`AUTH-CHANGE-PW-UI`) và ghi `users.locale` (`AUTH-LANG-PREF`) chưa làm ở nhánh này (mã riêng, đổi mật khẩu thuộc diện nhạy cảm cần kiểm chứng). Bộ chọn ngôn ngữ chỉ lưu cookie như hiện tại.

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
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi ở QUYET_DINH_CHO_DUYET QS1).
