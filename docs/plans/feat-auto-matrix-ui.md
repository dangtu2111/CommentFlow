# Kế hoạch `feat-auto-matrix-ui` — Ma trận tự gửi + cài đặt chung

Mã gap matrix: `AUTO-MATRIX-UI` · Spec: FR-070, FR-071 (`docs/05`), `docs/09` §6, `docs/10` bảng `automation_settings` · Quyết định: Q-AMU1.

**Tóm tắt:** Thêm trang `/app/automation` (chỉ Owner) để chọn mức Tắt / Chạy thử / Tự động cho từng kênh × nhãn (Hỏi giá, Tư vấn, Mua hàng) × (bình luận, tin nhắn), kèm ngưỡng tin cậy, khoảng trễ, giới hạn/ngày, giờ hoạt động, từ khóa chặn, chữ ký. Chưa có bảng `automation_settings` (migration chỉ làn b) nên làm schema Zod + interface lưu + bản lưu trong bộ nhớ, ghi phần DB vào gap matrix. Rủi ro: cấu hình chưa bền và chưa nối vào cổng tự gửi (trang nói rõ điều này); mặc định mọi thứ TẮT.

## Điểm chưa rõ

Không có (mọi chỗ tự chọn phương án an toàn ở Q-AMU1).

## Tiêu chí nghiệm thu

1. Cấu hình mặc định: mọi ô ma trận = Tắt, ngưỡng 0,85 — kiểm bằng test `FR-070 mặc định`.
2. Ngưỡng < 0,80 (sàn) hoặc > 1, khoảng trễ ngoài {0,60,120,300}s, giới hạn ngày không nguyên/≤0, từ khóa quá dài/quá nhiều, chữ ký quá dài, giờ sai định dạng đều bị từ chối — test `FR-071 …`.
3. Từ khóa chặn được cắt khoảng trắng, bỏ rỗng, bỏ trùng không phân biệt hoa thường/dấu — test.
4. `modeFor` trả `off` cho ô không khai báo; `toGateSettings` cho ra đúng dạng `settings`/`activeHours` mà `decideAutoSend` đọc được (chạy thử qua `readAutoSendInput`) — test.
5. Store: `get` trả mặc định khi chưa lưu; `save` rồi `get` đúng; workspace A không thấy của B — test.
6. Form: ô ma trận chỉ đọc cho kênh của workspace; kênh lạ bị bỏ; số/giờ rác → lỗi trường — test `parseAutomationForm`.
7. Trang + action chỉ Owner (`requireAppUser({role:'owner'})`), Staff 404; lưu xong chuyển về trang kèm thông báo — test action (mock) + kiểm tay KT-AMU.
8. Chuỗi vi/en khớp khóa, `lint:i18n` xanh; mục menu "Tự gửi" chỉ Owner — test app-nav + locales.

## File sẽ đọc

`packages/ai/src/gate/auto-send-gate.ts` (schema giờ/chế độ — đã đọc), `packages/ai/src/history/memory-store.ts` + `apps/web/src/server/ai-sent-history.ts` + `app/.../ai-sent/{page,actions}.tsx` (mẫu store/trang — đã đọc), `settings/actions.ts` (mẫu action Owner), `lib/app-nav.ts(+test)`.

## File sẽ sửa / tạo

- Tạo `packages/ai/src/automation/{settings.ts,settings-store.ts}` + test; export ở `packages/ai/src/index.ts`.
- Tạo `apps/web/src/lib/automation-form.ts` + test; `server/automation-settings.ts`; `app/app/(guarded)/automation/{page.tsx,actions.ts}`; `components/automation/automation-form.tsx`.
- Sửa `lib/app-nav.ts` + test, `i18n/messages/{vi,en}.json`, `docs/CAN_BAN_CUNG_CAP.md` (không cần tài nguyên → ghi "không"), `docs/testing/KIEM_TRA_TAY.md`, `docs/plans/QUYET_DINH_CHO_DUYET.md`, `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/codemap.md` (thêm dòng riêng), `docs/handoff`.

## Migration

Không (làn a). Phần DB → gap matrix `AUTO-MATRIX-DB` cho làn b: bảng `cf.automation_settings` theo `docs/10`, RLS GHI Owner (`withActor`), bản `AutomationSettingsStore` bằng DB.

## Test viết trước

`settings.test.ts`, `settings-store.test.ts`, `automation-form.test.ts` (đỏ trước khi có mã).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/automation` · `pnpm --filter @flow/web exec vitest run src/lib/automation-form.test.ts src/lib/app-nav.test.ts` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (cấu hình cổng tự gửi: quyền Owner, sàn ngưỡng, kênh chéo workspace).

## Rủi ro / câu hỏi cho chủ dự án

Store bộ nhớ mất khi khởi động lại và chưa nối cổng tự gửi → trang hiển thị cảnh báo. Hạn mức chi phí tháng + điều kiện tự tạm dừng (FR-071) chưa làm: cần cột/bảng → ghi gap matrix.

## Đề xuất thay đổi

Không sửa docs/01–16.

## Complexity tracking

Không có (interface Store có 2 nơi dùng: bộ nhớ + DB sắp tới theo `AutoSentHistoryStore`, cùng mẫu đã duyệt).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò — không có bảng mới (không migration)

## Trạng thái duyệt

Đã duyệt (tự duyệt — mọi quyết định ở Q-AMU1).
