# EVAL đo đúng đường production (EVAL-RELIABILITY, 08/11/2026)

Cách chạy: `pnpm --filter @flow/eval run evaluate --dataset datasets/<bộ mẫu>.jsonl --shop datasets/shops/<cửa hàng>.json --out out/<thư mục>` (mặc định với `--backend litellm`: `--knowledge production --repeats 3 --seed 42`).

- **Kiến thức production:** shop file (sản phẩm, biến thể, bí danh, chính sách, FAQ) được nạp vào workspace `[EVAL]` cố định ở `cf_dev` (id ổn định theo shop file nên chạy lại không tạo phiên bản thừa), rồi qua `runKbSync` (cắt đoạn + vector bge-m3 thật) → xuất bản tự động → `loadWorkspaceKnowledge` (tìm lai vector + toàn văn + trigram, sản phẩm/giá/tồn đọc từ DB). Thiếu dịch vụ ml/model embedding → lỗi rõ, không bản giả. Chỉ chạy trên `cf_dev`/`cf_test*`.
- **Nhiều lượt:** báo cáo `eval-multi-*.md` có trung bình/min/max từng chỉ số theo nhóm ngôn ngữ, **cổng chấm theo lượt tệ nhất**, và mục "Mẫu chập chờn" (cùng đầu vào, kết quả khác giữa các lượt — không tính là cải thiện/hồi quy của thay đổi đang đo).
- **Giảm dao động:** bước extract nhiệt độ 0 và truyền `--seed` (nếu model/nhà cung cấp hỗ trợ; LiteLLM bỏ tham số khi không hỗ trợ). Soạn giữ nhiệt độ mặc định của bước soạn.
- **Ghi cấu hình:** báo cáo nêu embedder, `kb_version`, số sản phẩm/chính sách/FAQ nạp, seed, model từng bước.
- **Giới hạn đã biết:** vector tên sản phẩm chưa được nạp trong EVAL (khớp sản phẩm dùng pg_trgm/bí danh như production hiện tại; hybrid vector tên sản phẩm là việc (1b)); bản fixture `--backend mock` vẫn ghi "mock — không phải số đo chất lượng".
