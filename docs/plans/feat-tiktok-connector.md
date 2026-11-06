# Kế hoạch `feat-tiktok-connector` — Connector TikTok (đọc + trả lời bình luận)

## Việc

Mã gap matrix: `TIKTOK-CONNECTOR` · Spec: `docs/12` §3, FR-015.

**Tóm tắt:** Thêm connector TikTok (TikTok API for Business, nhóm Organic/Accounts) đọc bình luận video và trả lời bình luận, theo cùng khuôn với Facebook/Instagram. Ẩn bình luận KHÔNG làm (chưa thấy API chính thức → khai báo không hỗ trợ, connector không có `setHidden`). Chưa gọi TikTok thật: có fixture viết tay theo tài liệu, cờ worker `TIKTOK_CONNECTOR_ENABLED` mặc định TẮT. Rủi ro: tên endpoint/mã lỗi/chữ ký webhook chưa đối chiếu được với tài khoản thật → ghi rõ cần kiểm.

## Điểm chưa rõ

Không có (mọi chỗ mơ hồ tự chọn phương án an toàn, ghi Q-TT1).

## Tiêu chí nghiệm thu

1. Connector thỏa `checkConnectorContract`, khai báo tiktok, không có `setHidden` — test `FR-015 connector TikTok`.
2. `reply` gọi `POST business/comment/reply/create/` với header `Access-Token` (token không nằm trong URL/lỗi); phản hồi `code≠0` ánh xạ đúng mã lỗi — test.
3. `fetchComments`/`fetchPostComments`/`fetchReplies` đọc đủ trang bằng `cursor`/`has_more`, bỏ bình luận của chính tài khoản (`isFromPage`), lọc `since` — test.
4. `verifyWebhook` kiểm chữ ký HMAC-SHA256 có dấu thời gian, so sánh thời gian hằng, từ chối chữ ký sai/lệch giờ/thiếu — test.
5. Worker: cờ tắt → sổ không có tiktok; bật mà thiếu biến → ném — test config + registry.
6. `pnpm lint`, `typecheck`, `depcruise`, `test` + coverage `@flow/connectors` xanh.

## File sẽ đọc

`packages/connectors/src/{types,contract,declarations}.ts`, `instagram/connector.ts` (khuôn), `apps/worker/src/{config.ts,channels/connector-registry.ts}`, `docs/12` §3.

## File sẽ sửa / tạo

Tạo `packages/connectors/src/tiktok/{connector,fixtures,connector.test}.ts`; sửa `packages/connectors/src/index.ts`, `declarations.ts` (ghi chú), `apps/worker/src/{config,main}.ts`, `channels/connector-registry.ts` (+test), `env.example`; docs: quyết định Q-TT1, codemap.d, can-ban-cung-cap.d, kiem-tra-tay.d, gap-matrix, MASTER, handoff.

## Migration

Không có. Việc nối webhook route/kênh TikTok vào DB (`platform='tiktok'` trong enum/CHECK nếu chưa có, đăng nhập OAuth TikTok) cần làn b → gap `TIKTOK-CHANNEL-CONNECT`.

## Test viết trước

Toàn bộ `connector.test.ts` (chữ ký webhook, ánh xạ lỗi, phân trang, chống vòng lặp) viết trước.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/tiktok` · `pnpm --filter @flow/worker exec vitest run src/channels src/config`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (chữ ký webhook, xử lý token).

## Rủi ro / câu hỏi cho chủ dự án

Cần quyền TikTok API for Business (Q5), tài khoản Business thử; khu vực VN có được cấp không chưa rõ.

## Đề xuất thay đổi

Cập nhật `docs/12` §3 cho khớp Q-TT1 (id ghép, polling-first, ẩn không hỗ trợ).

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định trong spec/Q-TT1)
