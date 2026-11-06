# Bàn giao `feat-policy-url-import` (claude, làn c)

## Đã làm
`packages/connectors/src/url-crawler/` đủ: chống SSRF (URL + IP + DNS ghim + chuyển hướng), `safeFetch`, bộ chuyển Node thật, robots.txt RFC 9309, giới hạn tốc độ, tách văn bản sạch, `fetchPolicyPage` (kết quả luôn `requiresReview`). Test 441 trong gói connectors (coverage vượt ngưỡng). Quyết định: `docs/plans/quyet-dinh/qpui1.md`.

## Đã đọc và rút ra
- `connectors` chỉ phụ thuộc `shared` (dependency-cruiser) → không import `ai`; quét cài lệnh (`scanInjection`) để job worker gọi khi đưa văn bản qua `buildChunkRows`.
- Ngưỡng coverage connectors: dòng 98 / câu lệnh 99 / hàm 100 / nhánh 98 (toàn gói).

## Còn lại
`POLICY-URL-SOURCES` (làn b, cần migration): bảng nguồn website + miền cho phép + hàng chờ duyệt có diff + lịch kiểm hằng ngày; job worker dùng `fetchPolicyPage` với `createNodeTransport`/`createNodeDnsResolver`; giao diện; chặn egress ở lớp mạng.
