# Kế hoạch `feat-onboarding-wizard` — ONBOARDING-WIZARD (UI-first)

## Việc

Mã gap matrix: `ONBOARDING-WIZARD` · Spec: FR-146, docs/08 §7.2, UF-1 · Thiết kế: `design/stitch/onboarding.png`.

**Tóm tắt (UI-first, 06/11/2026):** thêm trang trình hướng dẫn `/app/onboarding/setup?step=…` cho các bước 2–5 sau khi tạo workspace: kết nối kênh (nút Facebook hiện nhưng tắt khi chưa bật cờ), danh sách kênh/Page đã kết nối, nhập kiến thức (nối tới trang nhập sản phẩm có sẵn) kèm thanh Độ sẵn sàng AI lấy từ `computeReadiness`, và mời nhân viên (nối trang Thành viên). Chỉ nối UI vào chức năng đã có; không đổi logic nghiệp vụ, không migration. Phần thiết kế không có thật (xem Q-OBW1) bị bỏ.

## Điểm chưa rõ

Không có. Tự chọn theo AGENTS.md § Quy tắc hỏi: Q-OBW1.

## Tiêu chí nghiệm thu

1. `parseSetupStep`/`setupNav`/`suggestSetupStep` đúng (bước lạ → channels; bước đầu quay về trang workspace) — kiểm bằng `onboarding-setup.test.ts`.
2. Bước Kênh: danh sách kênh thật; nút "Kết nối Facebook" chỉ bấm được khi cờ bật, tắt thì hiện giải thích — kiểm bằng ảnh + đọc code.
3. Bước Kiến thức: thanh Độ sẵn sàng AI từ `loadReadiness` (không tính lại), nút tới nhập sản phẩm — kiểm bằng ảnh + đọc code.
4. Thanh 5 bước tô đúng bước hiện tại; i18n vi/en đủ khóa; a11y (`aria-current`, nhãn) — `pnpm lint:i18n` + typecheck.
5. Công cụ xanh: lint, lint:i18n, typecheck, depcruise, check:plans, test:trace, test phạm vi.

## File sẽ đọc

`onboarding.png`, `onboarding/workspace/{page,actions}`, `channels/page.tsx`, `readiness/page.tsx`, `server/readiness.ts`, `components/app/{onboarding-stepper,simple-topbar}.tsx`, `styles/frames.css`.

## File sẽ sửa / tạo

- `apps/web/src/lib/onboarding-setup.ts` (+test) · `apps/web/src/app/app/onboarding/setup/page.tsx` · `apps/web/src/components/app/setup-readiness-bar.tsx` · `styles/frames.css` · `packages/shared/src/i18n/messages/{vi,en}.json` · `app/onboarding/workspace/actions.ts` (chỉ đích chuyển hướng, nếu cần).
- `docs/plans/ui-fidelity/onboarding-wizard/*.png`, `docs/plans/quyet-dinh/q-obw1.md`, `docs/codemap.d/…`, gap-matrix, MASTER, handoff.

## Migration

Không có.

## Test viết trước

`onboarding-setup.test.ts` (hàm thuần).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web exec vitest run src/lib/onboarding-setup.test.ts`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS/token; dùng `requireAppUser({role:'owner'})` và `loadReadiness` đã có).

## Rủi ro / câu hỏi cho chủ dự án

Không chụp được ảnh trang thật nếu máy lane thiếu DB/phiên; khi đó ghi rõ ở PR.

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

**Đã duyệt** (tự duyệt: mọi quyết định theo spec/Q-OBW1).
