# Thứ tự việc và hạn mức EVAL (chủ dự án chốt 08/11/2026)

Trạng thái nằm trong repo (AGENTS.md § Phối hợp nhiều agent): agent nào nhận việc tiếp đọc file này, không hỏi lại thứ tự. Cập nhật file này khi thứ tự đổi.

## Thứ tự việc

| # | Việc | Trạng thái (cập nhật cuối 08/11) |
|---|---|---|
| — | Nhóm (5) bộ an toàn tiếng Việt/trộn (quét chèn lệnh của khách) | PR #284 (chờ CI + chủ dự án quyết merge); đo: an toàn demo-shop 80% → 100% |
| — | Điều tra en-03 + cấu hình bước soạn (nhiệt độ/seed, đo XEN KẼ A/B/C cùng phiên) | Đã sửa guard `4,765` vs `4765` (trên #284); đo A/B/C đang chạy → chọn cấu hình ít chập chờn nhất |
| 1 | **Nhóm R** — chẩn đoán + sửa tìm kiếm production | Chưa làm (mô-đun recall@k/MRR thuần đã có: `tools/eval/src/retrieval-metrics.ts`) |
| 2 | **(1b)** khớp sản phẩm lai (vector tên sản phẩm + pg_trgm + bí danh) | Chưa làm |
| 3 | **(4)** + **STOCK-DISCLOSURE-OPTION** | Chưa làm (gap đã ghi) |
| 4 | **(6)** extract trả mã chủ đề cố định (`KbTopic`), hỏi lại đúng ngôn ngữ khách | Chưa làm |
| 5 | **(3) (7) (8)** — nhóm (7) gồm gap GUARD-REDIRECT-TEMPLATE (câu chuyển hướng của guard nghĩa lấy từ `brand_voice.handoff_templates` + xưng hô + trong/ngoài giờ) | Chưa làm |
| 6 | Đo tốc độ / recall / cache | Chưa làm |
| — | **LLM-PROVIDER-OUTAGE** (circuit breaker khi nhà cung cấp LLM lỗi 429/401/5xx kéo dài; cảnh báo Admin + banner Owner; EVAL dừng ngay khi 429) | Chưa làm — gap đã ghi |
| 7 | Gắn sản phẩm vào bài | Chưa làm |

**Tình trạng 08/11 (cuối):** #287 (guard nghĩa) đã merge. OpenAI hết credit → mọi đo EVAL tạm không chạy được (HTTP 429); chủ dự án sẽ nạp credit. Làm (1b) → (4)+STOCK-DISCLOSURE-OPTION → (6) bằng code + test, GOM các phép đo trước/sau chạy MỘT lượt khi có credit (trong trần chi phí); đo EVAL cho #287 xem có chặn nhầm câu đúng không, sửa ở PR sau.

Sau mỗi nhóm: đo trước/sau bằng đường production, 3 lượt, báo cổng theo lượt tệ nhất + mẫu chập chờn (xem `docs/testing/eval-production-path.md`).

### Nhóm R (chốt 08/11/2026)
1. Bộ retrieval eval (docs/14 §4.3): gán đoạn đúng (chunk_key/nguồn) cho từng câu sswiftly + demo-shop; đo recall@5, MRR theo nhóm ngôn ngữ trên đường production.
2. Báo cáo từng câu trượt: top-5 kèm điểm từng nhánh (vector, toàn văn, trigram, RRF), ngưỡng liên quan, lý do bị loại.
3. Kiểm và sửa theo dữ liệu: ngưỡng liên quan hiệu chỉnh cho bge-m3 + RRF (không đoán); `lang` của đoạn tiếng Anh và cấu hình tsv (`english` cho en, `simple`+bỏ dấu cho vi — FR-057); đa dạng nguồn + ưu tiên `policyKind` theo chủ đề để đoạn sản phẩm không lấn chính sách; `context_header` có trong văn bản embed/tsv (FR-130).
4. Mục tiêu: recall@5 ≥ 0,9, MRR ≥ 0,7 trên cả hai bộ; rồi chạy lại EVAL 3 lượt, báo trước/sau hành động + sự kiện bắt buộc.

### STOCK-DISCLOSURE-OPTION (chốt 08/11/2026)
Tùy chọn Owner trong Quy tắc trả lời: "Nêu số lượng tồn" — mặc định TẮT (AI chỉ nói còn/hết); BẬT thì nêu số. Tùy chọn "báo sắp hết khi ≤ N" (mặc định N = 5). Code quyết định qua dữ liệu đưa vào prompt (tắt → KHÔNG đưa số tồn), guard kiểm; cập nhật đáp án EVAL tương ứng; ghi quyết định Q và `docs/05`.

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
