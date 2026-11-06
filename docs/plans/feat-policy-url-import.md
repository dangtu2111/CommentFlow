# Kế hoạch `feat-policy-url-import` — Nhập chính sách từ link website

## Việc

Mã gap matrix: `POLICY-URL-IMPORT` · Spec: FR-053 (`docs/05`), `docs/12` §5, `docs/13` (chống SSRF), FR-164 (trang crawl luôn qua duyệt).

**Tóm tắt (2–3 câu):** Owner dán link trang chính sách của shop; hệ thống tải trang (có User-Agent riêng), tôn trọng `robots.txt` (file website cho robot biết trang nào được phép đọc), giới hạn dung lượng/tốc độ, chặn SSRF (kẻ xấu dán link trỏ vào mạng nội bộ/máy chủ metadata để đánh cắp dữ liệu) rồi tách văn bản sạch kèm `content_hash` để so sánh lần sau. Chỉ làm phần logic thuần + interface (`HttpTransport`, `DnsResolver`) + bộ chuyển Node thật + fixture; không gọi mạng thật trong test, không giao diện, không migration. Rủi ro: lỗ hổng SSRF (nên cần `verifier-security`); DNS rebinding (đổi IP giữa lúc kiểm và lúc kết nối) được chặn bằng cách kết nối thẳng tới IP đã kiểm.

## Điểm chưa rõ

Không có. Tự chọn phương án an toàn, ghi `docs/plans/quyet-dinh/qpui1.md` (QPUI1).

## Tiêu chí nghiệm thu

1. `parseCrawlUrl` chỉ nhận http/https, từ chối thông tin đăng nhập trong URL, cổng ngoài 80/443, host rỗng/`localhost`/`.local`/`.internal`; IPv4 dạng số thập phân/hex/bát phân được chuẩn hóa trước khi kiểm — `url-crawler/ssrf.test.ts` (FR-053).
2. `isBlockedIp` chặn loopback, riêng tư, link-local/metadata (169.254.169.254), CGNAT, multicast, dành riêng, IPv6 (::1, fc00::/7, fe80::/10, ::ffff:v4, NAT64, 6to4) và cho qua IP công cộng; property-based: mọi IPv4 trong dải riêng bị chặn, dạng IPv4-mapped cho cùng kết quả — `ssrf.test.ts` (FR-053).
3. `safeFetch`: phân giải DNS rồi từ chối nếu BẤT KỲ địa chỉ nào bị chặn; kết nối tới IP đã kiểm (không phân giải lại); mỗi lần chuyển hướng kiểm lại (tối đa 3); chặn chuyển hướng ra ngoài miền cho phép; giới hạn 1 MB (cắt + cờ `truncated`), chỉ nhận `text/html`/`text/plain`, timeout 15 giây — `safe-fetch.test.ts` (FR-053).
4. Bộ chuyển Node thật kết nối theo IP đã ghim, đọc theo luồng, hủy khi vượt dung lượng/timeout — `node-transport.test.ts` (máy chủ cục bộ 127.0.0.1 trong test, không ra mạng) (FR-053).
5. `parseRobots`/`isAllowedByRobots`: nhóm User-agent cụ thể thắng `*`, khớp dài nhất thắng, `Allow` thắng khi hòa, `*`/`$`, `Crawl-delay`; robots 404 → cho phép, 5xx/lỗi mạng → từ chối (RFC 9309); property-based: không ném lỗi với văn bản bất kỳ — `robots.test.ts` (FR-053).
6. `createHostThrottle`: tối thiểu một khoảng giữa hai lần gọi cùng host, tôn trọng `Crawl-delay` (có trần) — `throttle.test.ts` (FR-053).
7. `extractCleanText`: bỏ script/style/nav/footer/form/comment, ưu tiên `<main>`/`<article>`, giải mã thực thể, giữ xuống dòng theo khối, lũy đẳng, không ném lỗi với HTML bất kỳ, thời gian tuyến tính — `extract-text.test.ts` (FR-053).
8. `fetchPolicyPage` ghép đủ bước: kiểm miền Owner khai báo → robots → throttle → tải → tách văn bản → `{text, title, contentHash, requiresReview: true}`; nội dung rỗng → lỗi; `contentHash` ổn định khi chỉ đổi khoảng trắng — `fetch-policy-page.test.ts` (FR-053).

## File sẽ đọc (≤ ~8, kèm lý do)

`packages/connectors/src/index.ts` (điểm xuất), `packages/connectors/package.json`/`vitest.config.ts` (ngưỡng coverage), `.dependency-cruiser.cjs` (đã đọc luật: connectors chỉ phụ thuộc shared), `docs/12` §5, `docs/13` dòng 106.

## File sẽ sửa / tạo

Tạo `packages/connectors/src/url-crawler/`: `errors.ts`, `ssrf.ts`, `safe-fetch.ts`, `node-transport.ts`, `robots.ts`, `throttle.ts`, `extract-text.ts`, `fetch-policy-page.ts`, `index.ts` + test cùng thư mục + `fixtures.ts`.
Sửa: `packages/connectors/src/index.ts` (một dòng export), `docs/gap-matrix.md` (một dòng), `docs/plans/MASTER.md` (dòng của việc).
Docs bằng file riêng: `docs/codemap.d/mien-url-crawler.md`, `docs/plans/quyet-dinh/qpui1.md`, `docs/can-ban-cung-cap.d/` (không cần: không có tài nguyên ngoài), `docs/handoff/feat-policy-url-import.md`.

## Migration

Không có. Cần bảng (nguồn website theo workspace, miền cho phép, hàng chờ duyệt có diff, lịch kiểm hằng ngày) → ghi gap `POLICY-URL-SOURCES` (làn b).

## Test viết trước

Toàn bộ test các module trên viết trước, chạy thấy đỏ (thiếu module) rồi mới code.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/connectors exec vitest run src/url-crawler` · `pnpm --filter @flow/connectors test:coverage`.

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (chống SSRF, giới hạn tài nguyên).

## Rủi ro / câu hỏi cho chủ dự án

Không chạy JavaScript (đúng spec MVP) nên trang dựng bằng JS sẽ ra ít chữ. Proxy/DNS riêng của hạ tầng thật (egress firewall) nên bổ sung ở lớp mạng — ghi ở ADR khi nối worker.

## Đề xuất thay đổi

Không sửa docs/01–16 (đã khớp). Ghi nối job/worker vào gap `POLICY-URL-SOURCES`.

## Complexity tracking

Không có. Không thêm thư viện (dùng `node:http(s)`, `node:crypto`; `fast-check` đã có trong `packages/connectors`). Tách tầng interface (`HttpTransport`, `DnsResolver`) có ≥ 2 nơi dùng thật (Node thật + giả trong test) và thuộc ngoại lệ connector.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

Đã duyệt (tự duyệt: quyết định đã có trong spec FR-053/docs 12 §5/docs 13; chi tiết chọn ghi QPUI1).
