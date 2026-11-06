# Kế hoạch `feat-ai-readiness` — Thanh Độ sẵn sàng của AI

## Việc

Mã gap matrix: `AI-READINESS` · Spec: FR-146 (`docs/05`), US-107, `docs/11` `GET /kb/readiness`, `docs/08` Onboarding.

**Tóm tắt:** Tính "Độ sẵn sàng của AI" (0–100%) từ dữ liệu đã nhập: ≥ 1 sản phẩm có giá, chính sách giao hàng, chính sách đổi trả, cách liên hệ/giờ làm việc (4 mục bắt buộc) + tỉ lệ 20 câu hỏi mẫu hệ thống mà dữ liệu hiện có đủ để trả lời. Hiện thanh + danh sách mục còn thiếu ở trang `/app/readiness` (Owner). Không chạy AI thật, không bịa số: mọi con số suy ra từ dữ liệu trong DB. Rủi ro: "trả lời được" là kiểm theo nguồn dữ liệu (code), chưa đo bằng LLM (đo thật làm ở AI-EVAL).

## Điểm chưa rõ

Không có (mọi quyết định chọn phương án khuyến nghị, ghi ở `QUYET_DINH_CHO_DUYET.md` mục Q-AR1).

## Tiêu chí nghiệm thu

1. Hàm thuần `computeReadiness` cho 0% khi chưa có dữ liệu, 100% khi đủ 4 mục + mọi câu mẫu có nguồn — test `FR-146` trong `packages/ai/src/readiness/readiness.test.ts`.
2. Thiếu mục bắt buộc nào thì `ready=false` dù điểm ≥ 80 và danh sách `missing` nêu đúng mục — cùng file test.
3. Chính sách/FAQ/thông tin shop lọc theo ngôn ngữ (`vi`/`en`/`all`) — cùng file test.
4. Ngưỡng dùng chung `READINESS_MIN_PERCENT` (80) với cổng tự gửi — test biên 79/80.
5. Truy vấn đầu vào chỉ qua `withActor` (RLS) — truy vấn `loadReadinessInput`; kiểm tích hợp ghi vào gap (làn b chạy `test:db`).
6. Trang `/app/readiness` chỉ Owner (Staff 404), vi+en đủ khóa — `pnpm lint:i18n`, test nav, test khớp khóa i18n.
7. Coverage `packages/ai` không tụt ngưỡng — `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

`kb-content.ts` (shared), `products.ts` schema, `try-ai/page.tsx`, `server/posts.ts`, `app-nav.ts`, `auto-send-gate.ts` (hằng ngưỡng), messages vi/en.

## File sẽ sửa / tạo

- `packages/ai/src/readiness/readiness.ts` (+ test): hàm thuần tính điểm.
- `packages/db/src/queries/readiness.ts` + `runtime.ts`: đọc số liệu đầu vào (đếm sản phẩm/biến thể, chính sách, FAQ, thông tin shop).
- `apps/web/src/server/readiness.ts`, `app/app/(guarded)/readiness/page.tsx`, `components/readiness/readiness-bar.tsx`: trang + thanh.
- `apps/web/src/lib/app-nav.ts` (+ test): mục "Độ sẵn sàng AI".
- `packages/shared/src/i18n/messages/{vi,en}.json`: chuỗi.
- docs: gap-matrix, MASTER, codemap (dòng riêng), QUYET_DINH, KIEM_TRA_TAY, handoff.

## Migration

Không có (bảng `readiness_checks` của docs/10 cần migration → chỉ làn b; tính trực tiếp mỗi lần xem, ghi gap `AI-READINESS-PERSIST`).

## Test viết trước

`readiness.test.ts` (đỏ trước): 0%, đủ 100%, từng mục thiếu, ngôn ngữ, biên 79/80, FAQ phủ chủ đề, hồ sơ shop nhiều ngôn ngữ.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/readiness` · `pnpm --filter @flow/web exec vitest run src/lib/app-nav.test.ts`

## Cần kiểm chứng độc lập không?

Không (không chạm auth/RLS mới/cổng gửi; chỉ đọc qua `withActor`). Cổng tự gửi chưa nối vào đây (`NOT_READY` ở PUT automation chờ route đó).

## Rủi ro / câu hỏi cho chủ dự án

Công thức điểm 40% mục bắt buộc + 60% câu mẫu là lựa chọn khuyến nghị (Q-AR1), đảo ngược dễ (hằng số).

## Đề xuất thay đổi

Không đổi docs/01–16.

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

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/Q-AR1).
