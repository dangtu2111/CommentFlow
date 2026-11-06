## KT-ASG — Cổng tự gửi (AUTO-SEND-GATE, FR-031/141)

Hàm thuần, chưa nối pipeline/DB → chưa có bước bấm tay; không cần khóa LLM, không cần tiếng Việt/Anh.
1. Chạy `pnpm --filter @flow/ai exec vitest run src/gate`. — Mong đợi: tất cả test xanh (mỗi cổng 1–11 có test riêng; test property-based `fast-check`, seed cố định, kiểm thứ tự cổng và tính đơn điệu).
2. Mở `packages/ai/src/gate/auto-send-gate.ts`, xem mảng `GATES`. — Mong đợi: đúng 11 hàm theo thứ tự `docs/09` §6 (công tắc → mức kênh×nhãn → ghi đè bài → nhãn chặn → ngưỡng → cần người → từ khóa → giới hạn/ngày → trần chi phí → giờ hoạt động → cửa sổ 24 giờ); `draft.needsHuman` chỉ xuất hiện ở chỗ CHẶN (`gate6NeedsHuman`), không có chỗ nào đọc trường AI để mở cổng; không có chữ `hide`.
3. Kiểm tay khi nối pipeline (AUTO-MATRIX-UI + pipeline): bật Tự động cho kênh × Hỏi giá, bình luận "giá bao nhiêu" có nguồn → bản nháp hiện "Sẽ tự gửi sau N phút"; đổi sang Chạy thử → chỉ ghi "sẽ gửi"; thêm từ khóa chặn có trong câu → về Chờ duyệt với lý do "Từ khóa chặn" (`gate:7`).
