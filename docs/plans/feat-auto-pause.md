# Kế hoạch `feat-auto-pause` — AI tự tạm dừng khi bất thường

## Việc

Mã gap matrix: `AUTO-PAUSE` · Spec: FR-073, FR-115, US-044, `docs/09` §11.2.

**Tóm tắt:** Khi có dấu hiệu bất thường (tỷ lệ Đánh dấu sai cao, gửi lỗi liên tiếp, chi phí chạm hạn mức, bị Meta chặn tạm, tăng đột biến) hệ thống tự dừng tự gửi để tránh hại shop. Làm phần logic thuần + store (interface + bản bộ nhớ) + dịch vụ đặt cờ/hủy hẹn giờ; chưa có job gom số liệu, banner, cột DB (cần migration — làn b). Rủi ro: dừng nhầm do ngưỡng; cờ chỉ Owner bật lại được.

## Điểm chưa rõ

Không có. (Quyết định tự chọn: `docs/plans/quyet-dinh/q-ap1.md`.)

## Tiêu chí nghiệm thu

1. Đánh dấu sai >10% và ≥10 câu/giờ → dừng workspace; đúng 10% hoặc <10 câu → không — test.
2. Gửi lỗi liên tiếp ≥ N (mặc định 5; N hỏng → mặc định) → dừng; thành công xen giữa cắt chuỗi; không phụ thuộc thứ tự mảng — test + property.
3. Chi phí ≥ hạn mức → dừng; chưa đặt hạn mức → không — test.
4. Lỗi 368/chính sách → khóa kênh 24 giờ, không dừng workspace, không tính vào chuỗi lỗi — test.
5. Spike >5× (≥20 câu) → cảnh báo + giảm nửa tốc độ, không dừng — test.
6. Dịch vụ: cờ trước, hủy hẹn giờ `ai_paused` đúng workspace; đã dừng giữ lý do đầu; hủy lỗi → cờ giữ + `cancelFailed`; store lỗi → vẫn hủy + `store_failed` — test.
7. Chỉ Owner Bật lại; `isPaused` lỗi/id hỏng → true — test.
8. Coverage `packages/ai` không giảm — `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

`emergency/*` (mẫu), `history/marked-wrong-signal.ts`, `history/auto-sent-record.ts`, `docs/09` §11.2.

## File sẽ sửa / tạo

Tạo `packages/ai/src/autopause/{auto-pause,auto-pause-store,auto-pause-service,index}.ts` + test; một dòng export ở `packages/ai/src/index.ts`; `docs/codemap.d/mien-packages-ai-src-autopause.md`, `q-ap1.md`, `kt-ap.md`/`tt-ap.md`; dòng `AUTO-PAUSE` ở MASTER/gap-matrix + `AUTO-PAUSE-WIRE`.

## Migration

Không có (chỉ làn b). Phần DB → `AUTO-PAUSE-WIRE`.

## Test viết trước

Toàn bộ logic quy tắc: test trước, rồi mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/autopause`

## Cần kiểm chứng độc lập không?

**Có** — chạm cổng tự gửi (`aiPaused` của `sendRecheck`): `verifier-security` một lần cuối nhánh.

## Rủi ro / câu hỏi cho chủ dự án

Không có việc chỉ chủ dự án làm được. Ngưỡng lỗi liên tiếp mặc định 5 là giá trị khởi đầu, chỉnh được ở `AUTO-SETTINGS-COST`.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có (store có 2 nơi dùng: bộ nhớ + DB sau này, như `EmergencyStopStore`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: quyết định đã có trong docs/09 §11.2 + Q-AP1).
