## KT-RL — Nhật ký tìm kiếm + câu hỏi AI chưa trả lời được (RETRIEVAL-LOG, FR-134, migration 0040)

Chỉ phần máy (chưa có giao diện — `KB-GAPS-UI`/`KB-TRYAI`; chưa có nơi ghi — `PIPE-RETRIEVE`): người thử cần `pnpm db:migrate` (DB dev/test của bạn) rồi chạy test.
1. `CF_LANE=<làn> pnpm test:db` → file `retrieval-log.int.test.ts` xanh (đua 20 lệnh song song cho đúng một dòng `kb_gaps` count = 20). Kết quả mong đợi: không test đỏ.
2. `pnpm db:check-rls` → không báo vi phạm `cf.retrieval_logs`/`cf.kb_gaps`. Kết quả mong đợi: "đạt".
3. (Tùy chọn, vi + en) Khi `KB-GAPS-UI` xong: câu AI chưa trả lời hiện gộp theo chủ đề/sản phẩm kèm số lần; "Đã bổ sung"/"Bỏ qua" đổi trạng thái; khách hỏi lại điều đã bổ sung thì mục mở lại.

---
