# Kế hoạch `feat/kb-distill-migration` — PR migration chỉ-thêm cột đầu tiên của M3 (KB-DISTILL)

## Việc

Mã gap matrix: `KB-DISTILL` · ADR 018 (hướng B+), lệnh tổng 10/11/2026 (M3). Kế hoạch tổng của M3 ở `docs/plans/feat-kb-distill.md`; PR này CHỈ gồm migration (giai đoạn 2).

**Tóm tắt (2–3 câu dễ hiểu):** Dữ liệu Owner nhập thô ("Thông tin khác", mô tả dài) hiện chỉ giúp tìm kiếm; khi bật cờ chỗ giữ chỗ thì AI không dám nói thành sự kiện. Bước chắt lọc dùng LLM đọc từng đoạn thô MỘT LẦN mỗi phiên bản kiến thức và đề xuất FAQ, thuộc tính sản phẩm, trường chính sách — mọi đề xuất phải kèm câu trích nguyên văn và được code kiểm cứng; FAQ/thuộc tính chỉ vào tìm kiếm sau khi Owner duyệt. Rủi ro: tốn tiền LLM (trần 0,20 USD/workspace/lần đồng bộ) và đề xuất sai (chặn bằng kiểm cứng + duyệt tay).

## Điểm chưa chốt → đã tự chọn (chế độ làm liên tục, ghi `q-kb-distill.md`)

Không còn thẻ chờ trả lời. Các lựa chọn an toàn/đảo ngược được:
1. Đề xuất FAQ/thuộc tính lưu vào `faq_items` với `status='draft'` (cột thêm ở migration 0084), KHÔNG tạo bảng mới. Đồng bộ kiến thức chỉ đọc `status='published'`.
2. `product_attr` lưu dạng FAQ nháp `kind='product_attr'` (hỏi/đáp về thuộc tính) — chưa ghi thẳng vào bảng sản phẩm (giá/tồn luôn lấy từ `products`).
3. `policy_field` đi vào `refreshPolicySuggestions` (bản NHÁP chính sách có cấu trúc, đã có hàng rào duyệt); không tự duyệt.
4. Kiểm cứng trước khi lưu: `evidenceQuote` là chuỗi con nguyên văn của đoạn nguồn; mọi chữ số trong `answer` có trong `evidenceQuote`; không đạt → bỏ và đếm (`rejected`).
5. Trần chi phí 0,20 USD/workspace/lần đồng bộ, `ai_usage.step='distill'`; vượt → dừng bước và báo trên trang "Dữ liệu còn thiếu". Thiếu LLM → tắt bước kèm thông báo, không mock.
6. Gap đóng chính xác theo `kb_gaps.fact_topic` (thay M2b): duyệt thẻ `returns` đóng gap có `fact_topic='returns'`, v.v.; gap `fact_topic` null/gộp không tự đóng.

## Tiêu chí nghiệm thu

1. Migration 0084 chỉ thêm cột/CHECK/GRANT và thay thân hàm `kb_gaps_guard_update` (thêm `fact_topic`); không DROP/RENAME/đổi kiểu/nới RLS — kiểm bằng: đọc `0084_kb_distill_fact_topic.sql`, `pnpm check:migrations`, `pnpm db:check-rls`.
2. Thành viên không đổi được `kb_gaps.fact_topic`, job hệ thống đổi được, mã lạ bị CHECK; dòng `faq_items` cũ giữ `published/faq`, Owner duyệt bằng UPDATE `status` — kiểm bằng: `packages/db/tests/kb-distill-columns.int.test.ts` (DB thật).
3. Chưa có code đọc/ghi cột mới; hành vi ứng dụng không đổi — kiểm bằng: CI xanh, diff chỉ gồm migration + schema + test + docs.

## File sẽ đọc / sửa

Đọc: `packages/ai/src/kb-sync/{run-kb-sync,run-kb-publish,source-documents}.ts`, `packages/db/src/schema/cf/{kb-content,retrieval}.ts`, `packages/db/src/queries/policy-facts.ts`, `retrieval-logs.ts`, `persist-records.ts`, trang `kb-gaps`. Sửa/tạo theo từng giai đoạn (xem PR).

## Migration

Một migration CHỈ-THÊM (0084) ở PR riêng đầu tiên → DỪNG chờ kiểm chéo. Các giai đoạn code xếp sau khi PR này merge.

## Test viết trước

Có, theo từng giai đoạn.

## Lệnh test phạm vi hẹp

Theo từng PR.

## Cần kiểm chứng độc lập không?

PR migration (migration + trigger): CÓ — tự kiểm theo `verify.md`, chủ dự án kiểm chéo, không tự merge. PR code chạm cổng tự gửi/guard: không dự kiến.

## Rủi ro / câu hỏi cho chủ dự án

Chi phí LLM mỗi lần đồng bộ; nên bật chắt lọc trước cho [EVAL] rồi mới cho shop thật.

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
