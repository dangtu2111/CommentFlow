# Kế hoạch `feat-rate-limit-page` — Giới hạn tốc độ gửi theo Page/bài/nội dung lặp

## Việc

Mã gap matrix: `RATE-LIMIT-PAGE` (nối `SEND-RATE-LIMIT`) · Spec: FR-114, `docs/09` §6.1 R9, §11.1.

**Tóm tắt:** Thêm bộ giới hạn tốc độ gửi: quy tắc thuần `evaluateSendRate` (30/phút + 600/giờ theo Page → hoãn; tự gửi 60/giờ/Page, 20/10 phút/bài, ≤5 câu giống hệt/giờ/Page → về "Chờ duyệt"; mức dùng Meta App ≥75% giảm nửa tốc độ tự gửi, ≥90% chỉ gửi câu do người bấm), interface bộ đếm (`SendRateCounter`, bản bộ nhớ để test) và dịch vụ dựng đầu vào `rate` cho R9 của `sendRecheck`. R9 được mở rộng: chặn → lý do cụ thể (`rate_limited_*`) + cách xử lý. Cờ tắt mặc định (`SEND_RATE_LIMIT_ENABLED`); chưa có kho Redis/DB thật (không migration, không phụ thuộc mới). Rủi ro: tranh chấp đếm giữa hai worker cho tới khi có bộ đếm Redis nguyên tử (`RATE-LIMIT-PAGE-WIRE`).

## Điểm chưa rõ

Không có. (Quyết định tự chọn: `docs/plans/quyet-dinh/q-rlp1.md`.)

## Tiêu chí nghiệm thu

1. Quy tắc §11.1: đúng ngưỡng (±1) cho 30/phút, 600/giờ (hoãn), 60/giờ tự gửi, 20/10 phút/bài, 5 giống hệt/giờ (Chờ duyệt); người gửi không bị ba giới hạn "tự gửi" — test + property-based (đổi thứ tự khóa đầu vào không đổi kết quả; `remaining` ≥ 0; người gửi không bao giờ `hold`).
2. Mức dùng Meta App: ≥75% giảm nửa giới hạn tự gửi; ≥90% tự gửi bị hoãn, người bấm vẫn qua; header `X-App-Usage`/`X-Business-Use-Case-Usage` đọc đúng, hỏng → `null` — test + property.
3. `sendRecheck` R9: `remaining` ≤ 0 → hoãn `rate_limited`; `hold` (chỉ chế độ `auto`) → `hold_review` với lý do cụ thể; `hold` ở chế độ người gửi bị bỏ qua; thứ tự R1–R8 không đổi — test (+ property hiện có).
4. Bộ đếm/dịch vụ: khóa luôn chứa `workspace_id` (workspace khác không ảnh hưởng nhau), dấu vết nội dung là sha256 (không lưu chữ), cờ tắt → `rate: null`, bộ đếm lỗi → đóng (hoãn, không cho qua) — test.
5. Cấu hình: cờ chỉ đúng `true` mới bật; số lạ → mặc định — test.
6. Coverage `packages/ai` không giảm — `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

`docs/09` §11.1, `recheck/send-recheck.ts` (+test), `variation/variation.ts` (`replyFingerprint`), `draft/draft-config.ts` (mẫu cờ), `emergency/emergency-store.ts` (mẫu store).

## File sẽ sửa / tạo

Tạo `packages/ai/src/ratelimit/{send-rate-limit,send-rate-counter,send-rate-service,meta-usage,send-rate-config,index}.ts` + test; sửa `recheck/send-recheck.ts` (+test) cho R9; một dòng `export * from './ratelimit'` ở `packages/ai/src/index.ts`; `env.example`; `docs/codemap.d/mien-packages-ai-src-ratelimit.md`; `q-rlp1.md`; `docs/can-ban-cung-cap.d/10-rate-limit-page.md`; `kt-rlp.md`/`tt-rlp.md`; dòng gap-matrix/MASTER.

## Migration

Không có (chỉ làn b). Bộ đếm Redis nguyên tử + nối `send` job + đọc header Graph → `RATE-LIMIT-PAGE-WIRE`.

## Test viết trước

Toàn bộ quy tắc, R9 mở rộng, bộ đếm, dịch vụ, cấu hình: test trước (đỏ), rồi mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/ratelimit src/recheck`

## Cần kiểm chứng độc lập không?

**Có** — chạm `sendRecheck` (R9) và cổng tự gửi: `verifier-security` một lần cuối nhánh (không có chữ ký webhook/token mới trong diff; chỉ đọc header mức dùng, không đọc/log token).

## Rủi ro / câu hỏi cho chủ dự án

Không có việc chỉ chủ dự án làm được. Ngưỡng là mặc định của docs/09, chỉnh bằng biến môi trường sau khi đo.

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có (`SendRateCounter` là interface vì có 2 nơi dùng: bản bộ nhớ test + Redis sau này, như `EmergencyStopStore`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: quyết định đã có trong docs/09 §11.1 + Q-RLP1).
