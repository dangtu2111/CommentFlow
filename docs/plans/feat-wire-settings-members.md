# Kế hoạch `feat/wire-settings-members` — Cài đặt › Thành viên & Phân quyền (nối thật)

## Việc

Mã gap matrix: `GĐ0-TENANCY`, `AUTH-INVITE`, `MEMBER-LEAVE`, `RLS-ACTOR-CTX`, `MEMBER-DIRECT-ADD` · Spec: `docs/13` §3.1, `design/stitch/settings-workspace-members.{png,html}`.

**Tóm tắt:** Trang Thành viên đã dựng bằng Tailwind trong khung Cài đặt và backend (mời, thu hồi/mời lại, đổi vai trò, tạm khóa, gỡ, tự rời, Owner cuối cùng) đã có. Lát này bỏ phần còn bịa/giả (ma trận quyền tĩnh với dòng "Che SĐT", nút "Lưu thay đổi"/"Xem tài liệu" chỉ là "Sắp có", cột "Quyền thao tác" văn bản cố định), thay bằng bảng quyền theo vai trò lấy từ chính bảng điều hướng/quyền trong code (`app-nav` `ENTRIES`, cùng nguồn với việc chặn trang), thêm đường "Rời workspace" cho Owner, và có E2E vi + en chạy thật mọi thao tác. Rủi ro thấp: không migration, không đổi RLS.

## Điểm chưa rõ

Không có. (Vai trò thật chỉ có Owner/Staff theo docs/13 §3.1; "Admin" không tồn tại → không thêm; đề xuất ở dưới.)

## Tiêu chí nghiệm thu

1. Bảng quyền hiển thị lấy từ `roleAccessRows()` (suy ra từ `ENTRIES`), Owner ⊇ Staff, Thành viên/Kênh/Cài đặt tự gửi… ghi "chỉ Owner" — kiểm bằng `app-nav.test.ts` (đỏ trước).
2. Không còn nút giả "Sắp có", công tắc che SĐT, nhãn phiên bản ma trận, ma trận tĩnh ở trang Thành viên — kiểm bằng E2E (không có chữ "Sắp có"/"Soon" trong `main`) + `grep`.
3. Mời → thư tới Mailpit; Thu hồi; Mời lại (token mới); Đổi vai trò Staff→Owner→Staff; Tạm khóa/Mở khóa; Gỡ; Owner cuối cùng không bị hạ/khóa/gỡ; Owner có đường tới `/app/leave` — kiểm bằng E2E `e2e/tests/settings-members.spec.ts` vi + en CHẠY THẬT, xanh.
4. Khớp Stitch ở 1440px và 390px — kiểm bằng `pnpm ui:fidelity settings-workspace-members /dev/ui/members`, ảnh ở `docs/plans/ui-fidelity/settings-members/`.
5. `pnpm lint:i18n`, `pnpm precheck` xanh; verifier-security một lần.

## File sẽ đọc (≤ ~8, kèm lý do)

`apps/web/src/components/app/members-view.tsx` (dựng lại), `member-actions.tsx`, `invite-form.tsx`, `invitation-actions.tsx`, `lib/app-nav.ts` (+test), `members/actions.ts`, `e2e/tests/gate0.spec.ts` (mẫu mời), `e2e/tests/settings-profile.spec.ts` (mẫu E2E), messages vi/en.

## File sẽ sửa / tạo

- `apps/web/src/lib/app-nav.ts` + `.test.ts`: thêm `roleAccessRows()` (quyền thật theo vai trò).
- `apps/web/src/components/app/members-view.tsx`: bỏ nút giả/ma trận tĩnh/cột quyền cố định; thêm bảng quyền thật; liên kết "Rời workspace" ở hàng của chính mình.
- `packages/shared/src/i18n/messages/{vi,en}.json`: bỏ khóa không còn dùng, thêm khóa mới.
- `e2e/tests/settings-members.spec.ts`: E2E vi + en.
- docs: `kt-wmem.md`, `tt-wmem.md`, `codemap.d`, gap-matrix, handoff, ảnh ui-fidelity, quyết định.

## Migration

Không có.

## Test viết trước

`app-nav.test.ts` cho `roleAccessRows` (đỏ trước); E2E.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/app-nav.test.ts`; `CF_LANE=a pnpm e2e -- settings-members`.

## Cần kiểm chứng độc lập không?

Có, một lần `verifier-security` (chạm quyền/vai trò, RLS qua `withActor`; không đổi policy). `verifier-db`: không (không migration).

## Rủi ro / câu hỏi cho chủ dự án

Không có.

## Đề xuất thay đổi

- Vai trò Admin phân biệt với Owner (docs/01–16 chỉ có Owner/Staff; một số chỗ ghi "Owner/Admin" cho 2FA) → việc lớn (đổi enum `members.role`, migration, RLS), không làm trong lát này.
- Bộ lọc "phân công kênh" và "che SĐT khi mời" cần mô hình dữ liệu mới → để sau.

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

**Đã duyệt (chủ dự án giao việc 07/11/2026).**
