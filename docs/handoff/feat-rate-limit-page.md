# Handoff `feat-rate-limit-page` — RATE-LIMIT-PAGE (FR-114) · agent: claude (làn c)

## Đã làm
- `packages/ai/src/ratelimit/`: `evaluateSendRate` (thuần), `SendRateCounter` + `sendRateKey` + bản bộ nhớ, `createSendRateService` (`snapshot`/`record`), `parseMetaUsagePercent`, `loadSendRateConfig` (cờ `SEND_RATE_LIMIT_ENABLED` tắt). TDD + property-based.
- `sendRecheck` R9: `rate.hold` tùy chọn (chỉ `auto`) → `rate_limited_page_auto/_post/_repeat` (Chờ duyệt), `rate_limited_app` (hoãn); `remaining ≤ 0` vẫn hoãn `rate_limited`. Nơi gọi cũ không đổi.
- Quyết định: `q-rlp1.md`. Docs: codemap.d, cbcc 10, kt-rlp/tt-rlp, gap-matrix (`RATE-LIMIT-PAGE`, `SEND-RATE-LIMIT`, `RATE-LIMIT-PAGE-WIRE`), MASTER.

## File đã đọc + điều rút ra
- `recheck/send-recheck.ts`: `Rule` trả `{reason, action}`; R9 chạy cuối; `rate: null` = qua.
- `variation/variation.ts`: `replyFingerprint` (sha256 chuẩn hóa) dùng lại cho "nội dung lặp".
- Công cụ Bash trong làn này từ chối heredoc/`sed -i` ghép lệnh → dùng Write/Edit.

## Còn lại (`RATE-LIMIT-PAGE-WIRE`, không migration)
- Bộ đếm Redis/Valkey nguyên tử (Lua) thay bản bộ nhớ; gộp đọc+ghi để chống đua hai worker.
- Job `send` (`apps/worker/src/jobs/send.ts`): gọi `snapshot` → `recheckInputFromRow(..., rate)`, `record` sau khi gửi; kết quả `hold_review` → Chờ duyệt.
- Connector Graph đọc header → `parseMetaUsagePercent` → `appUsage`.
- UI Chờ duyệt: hiện lý do `rate_limited_*` (vi/en) — chưa có khóa i18n (chỉ `recheckR9` cũ).
- Từ verifier-security (không chặn merge; đã sửa: header >100 kẹp về 100, `record` báo lỗi): (a) thêm `reserve()` nguyên tử (kiểm+trừ một bước, hoàn lượt nếu gửi lỗi) thay vì `count`→`record`; (b) thêm `target: comment|message`, tự gửi bình luận thiếu `postId` → `remaining: 0`; (c) lấy `mode` cho dịch vụ và `sendRecheck` từ cùng một biến + test lệch; (d) không dùng `createInMemorySendRateCounter` ở production; (e) bật tự gửi thật phải buộc `SEND_RATE_LIMIT_ENABLED`; (f) xác nhận một Page chỉ thuộc một workspace, nếu không thêm khóa toàn hệ theo Page.
- 3 job đồng thời/kênh (phần còn lại của `SEND-RATE-LIMIT`).
