# Kế hoạch `feat/shopify-ai-core` — Gộp Shopify + lõi AI (thay các PR #236, #237, #238)

**Trạng thái duyệt:** Đã duyệt (chủ dự án yêu cầu 07/11/2026: "tập trung ci và merge cho xong"; nội dung từng phần đã được duyệt ở các kế hoạch bên dưới).

## Việc

Mã gap matrix: `SHOPIFY-CONNECT-STORE`, `SHOPIFY-IMPORT`, `TRY-AI-REAL`, `KB-EMBED-LITELLM`, `PGVECTOR-HYBRID`, `PIPE-ORCHESTRATOR` (dòng mới) · Spec: `docs/12` §4.1/§8, `docs/09` §4/§6.0.

**Tóm tắt:** Ba PR xếp chồng (#236 Shopify + ô Thử AI đọc dữ liệu thật + ảnh sản phẩm, #237 bước 0 lõi AI, #238 bge-m3 cho `kb-reembed` + CLI) bị chặn bởi một chuỗi giả dạng khóa nằm trong lịch sử commit cũ của #236 mà gitleaks quét thấy. Quy tắc dự án cấm nới cấu hình quét bí mật và cấm force-push, nên toàn bộ nội dung cuối cùng được đưa vào MỘT commit sạch trên nhánh mới từ `main`, đồng thời đổi hai chuỗi test dạng hex (`shpss_0123456789abcdef`) sang dạng từ ghép đúng quy tắc "chuỗi giống khóa trong test phải đổi cho KHÔNG giống bí mật". Nội dung mã KHÔNG đổi so với nhánh `feat/kb-reembed-ml` ngoài hai chuỗi đó.

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. Mọi check bắt buộc của `main` xanh trên PR này (Node, Database, E2E, Python, Phạm vi, gitleaks) — kiểm bằng: `gh pr checks`.
2. Không còn chuỗi dạng khóa trong lịch sử nhánh mới — kiểm bằng: job gitleaks (`gitleaks git`).
3. Nội dung mã tương đương `feat/kb-reembed-ml` (chỉ khác hai chuỗi test) — kiểm bằng: `git diff feat/kb-reembed-ml feat/shopify-ai-core --stat`.
4. Tiêu chí của từng phần giữ nguyên theo `feat-kb-shopify-connect` (handoff), `feat-try-ai-real.md`, `feat-ai-core-step0.md`, `feat-kb-reembed-ml.md`.

## File sẽ đọc (≤ ~8, kèm lý do)

Không đọc thêm: đây là gộp lịch sử, không đổi logic.

## File sẽ sửa / tạo

Toàn bộ nội dung của ba PR (xem các kế hoạch tương ứng) + `apps/web/src/server/shopify-connect.test.ts`, `apps/web/src/lib/shopify-connect-form.test.ts` (đổi chuỗi giả).

## Migration

0067 (`policy_items.external_key`) và 0068 (`products.image_url`) — như đã mô tả ở các kế hoạch trước; có đường lùi ghi trong file.

## Test viết trước

Không thêm: các test đã có theo từng phần.

## Lệnh test phạm vi hẹp

`pnpm precheck` · `pnpm --filter @flow/web exec vitest run src/server/shopify-connect.test.ts src/lib/shopify-connect-form.test.ts`

## Cần kiểm chứng độc lập không?

Có migration nên thuộc diện nhạy cảm: tự kiểm theo `verify.md`, gắn nhãn "tự kiểm, chưa có kiểm chứng độc lập"; chủ dự án đã yêu cầu merge sau CI xanh.

## Rủi ro / câu hỏi cho chủ dự án

Lịch sử chi tiết (từng commit nhỏ) nằm ở các PR cũ #236/#237/#238 (đóng, còn đọc được); nhánh mới chỉ có một commit gộp.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm ghi ở Complexity tracking
