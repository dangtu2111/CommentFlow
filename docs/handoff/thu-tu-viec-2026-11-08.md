# Thứ tự việc và hạn mức EVAL (chủ dự án chốt 08/11/2026)

Trạng thái nằm trong repo (AGENTS.md § Phối hợp nhiều agent): agent nào nhận việc tiếp đọc file này, không hỏi lại thứ tự. Cập nhật file này khi thứ tự đổi.

## Thứ tự việc

| # | Việc | Trạng thái (cập nhật 08/11 tối) |
|---|---|---|
| — | Nhóm (5), Nhóm R, rerank (#286), guard nghĩa (#287), (1b) khớp sản phẩm lai (#288) | **Đã merge**; số đo trong `docs/testing/eval-*.md` |
| — | mixed-11 "sai giá" | Đã phân loại (xem `docs/decisions/017-draft-fact-slots.md` § Bằng chứng); KHÔNG vá thêm từng mẫu — thay bằng DRAFT-FACT-SLOTS |
| **A** | **DRAFT-FACT-SLOTS** (ADR 017 + `docs/plans/feat-draft-fact-slots.md`) | **CHỜ CHỦ DỰ ÁN DUYỆT trước khi code**; tạm dừng vá guard theo từng mẫu |
| 1 | **(4)** nguồn theo từng ý hỏi + FR-160 nhóm y tế/FDA + STOCK-DISCLOSURE-OPTION | Sau A (phần lớn bị A thay/gộp — xem plan § Tác động) |
| 2 | **(7)** reply_language (câu ≤ 3 từ: `channels.reply_language` → ngôn ngữ lượt trước → `workspaces.default_lang`, spec 09 §5 quy tắc 4) + câu chuyển hướng từ `brand_voice.handoff_templates` (GUARD-REDIRECT-TEMPLATE) | Chưa làm |
| 3 | **(6)** extract trả mã chủ đề enum (Zod); "where's my order" không bực ≠ khiếu nại; "mẫu này" không phải tên sản phẩm; size/màu không dấu; sửa GUARD-GUARANTEE-WORD (hoàn tiền ≠ warranty) | Chưa làm |
| 4 | **(3)** hỏi lại biến thể chỉ khi giá/tồn khác + **(8)** định dạng tiền/tồn kiểu tiếng Anh trong guard | Chưa làm |
| 5 | Đo bổ sung: p95 thời gian gợi ý ≤ 15 giây, `cached_tokens` (FR-138) | Chưa làm |
| 6 | Nhóm **COST** (đường mẫu không gọi LLM, nối cache, biến thể lười, model rẻ cho extract) | Chưa làm |
| 7 | Gắn sản phẩm vào bài viết (FR-061/062/063) | Chưa làm |
| — | **LLM-PROVIDER-OUTAGE** (circuit breaker, cảnh báo Admin + banner Owner, EVAL dừng ngay khi 429) | Chưa làm — gap đã ghi |

**Tình trạng 08/11 (cuối):** #287 (guard nghĩa) đã merge. OpenAI hết credit → mọi đo EVAL tạm không chạy được (HTTP 429); chủ dự án sẽ nạp credit. Làm (1b) → (4)+STOCK-DISCLOSURE-OPTION → (6) bằng code + test, GOM các phép đo trước/sau chạy MỘT lượt khi có credit (trong trần chi phí); đo EVAL cho #287 xem có chặn nhầm câu đúng không, sửa ở PR sau.

Sau mỗi nhóm: đo trước/sau bằng đường production, 3 lượt, báo cổng theo lượt tệ nhất + mẫu chập chờn (xem `docs/testing/eval-production-path.md`).

### Nhóm R (chốt 08/11/2026)
1. Bộ retrieval eval (docs/14 §4.3): gán đoạn đúng (chunk_key/nguồn) cho từng câu sswiftly + demo-shop; đo recall@5, MRR theo nhóm ngôn ngữ trên đường production.
2. Báo cáo từng câu trượt: top-5 kèm điểm từng nhánh (vector, toàn văn, trigram, RRF), ngưỡng liên quan, lý do bị loại.
3. Kiểm và sửa theo dữ liệu: ngưỡng liên quan hiệu chỉnh cho bge-m3 + RRF (không đoán); `lang` của đoạn tiếng Anh và cấu hình tsv (`english` cho en, `simple`+bỏ dấu cho vi — FR-057); đa dạng nguồn + ưu tiên `policyKind` theo chủ đề để đoạn sản phẩm không lấn chính sách; `context_header` có trong văn bản embed/tsv (FR-130).
4. Mục tiêu: recall@5 ≥ 0,9, MRR ≥ 0,7 trên cả hai bộ; rồi chạy lại EVAL 3 lượt, báo trước/sau hành động + sự kiện bắt buộc.

### STOCK-DISCLOSURE-OPTION (chốt 08/11/2026)
Tùy chọn Owner trong Quy tắc trả lời: "Nêu số lượng tồn" — mặc định TẮT (AI chỉ nói còn/hết); BẬT thì nêu số. Tùy chọn "báo sắp hết khi ≤ N" (mặc định N = 5). Code quyết định qua dữ liệu đưa vào prompt (tắt → KHÔNG đưa số tồn), guard kiểm; cập nhật đáp án EVAL tương ứng; ghi quyết định Q và `docs/05`.

### Cách đo gọn (chốt 08/11/2026 tối — ghi cả ở EVAL-RELIABILITY)
- Sửa nhỏ trong một nhóm: **1 lượt**, chỉ tập câu liên quan.
- Xong mỗi nhóm: **1 lượt toàn bộ 2 bộ**, so với số nền mới nhất (nền hiện tại: `afterGS3`/`after1b` trong `tools/eval/out`, bảng ở `docs/testing/eval-product-match-2026-11-08.md`).
- Mốc quan trọng (kết luận cổng, đổi model/prompt lớn, trước staging): **3 lượt**, cổng theo lượt tệ nhất.
- Thử Batch API cho EVAL nếu LiteLLM/OpenAI hỗ trợ. Mọi báo cáo ghi chi phí thật.
- Không sửa đáp án bộ mẫu để khớp code (nghi đáp án sai → liệt kê cho chủ dự án). Bộ `datasets/product-match/*.jsonl` không sửa đáp án sau khi đã đo (chủ dự án sẽ cho kiểm độc lập).

## Hạn mức EVAL qua LiteLLM (thường trực, chốt 08/11/2026)

- Mỗi lần đo ≤ **1 USD**; tổng cho chuỗi việc hiện tại ≤ **5 USD**.
- Báo **chi phí thật** (LiteLLM và `ai_usage`) trong MỌI báo cáo — công cụ tự ghi (`tools/eval`, mã trong `tools/eval/src/budget.ts`).
- **Dừng và hỏi chủ dự án** khi: vượt một trong hai trần trên, hoặc chi tiêu khóa ảo LiteLLM > **80%** trần của khóa (trần khóa hiện 10 USD). EVAL tự dừng (thoát mã 3).
- Sổ chi tiêu cộng dồn: `tools/eval/out/eval-spend-ledger.jsonl` (không commit, `out/` đã bỏ qua). Đã chi tới hết nhóm (5): khoảng 0,45 USD; đo A/B/C bước soạn ước ~0,6 USD.

## Quy ước làm việc đi kèm

- Thay đổi `.github/workflows` tách PR riêng.
- Chạy kiểm bằng `&&` (không `;`) trước khi commit; không đọc `.env*`.
- PR chạm an toàn/nhạy cảm: chờ chủ dự án quyết merge; tự kiểm theo `docs/workflows/verify.md`, gắn nhãn "tự kiểm".
- Bộ nhớ dự án của Claude Code có bản sao ngắn (`work-order-2026-11-08`); nguồn đúng là file này.
