# Bàn giao `feat/try-ai-brand-voice` (claude)

**Làm gì:** ô Thử AI dùng `brand_voice` thật của workspace (theo ngôn ngữ khách viết) cho bộ soạn và bộ chặn xưng hô; thiếu → giọng mẫu; giao diện có dòng "Giọng văn: của shop/mẫu". Quyết định: `Q-TBV1`.

**Lỗi tìm thấy khi làm:** bộ chặn xưng hô (`checkReplyGuard`) vẫn dùng giọng mặc định chứ không dùng giọng bộ soạn nhận → khi có giọng thật sẽ chặn nhầm câu đúng xưng hô của shop. Đã gom về MỘT biến `voice` dùng cho cả hai + test.

**Còn lại:** nạp `handoff_templates` (mẫu câu mời chuyển hướng) vào giọng; worker thật dùng lại `draftVoicesFromRows` (PIPE-ORCHESTRATOR). Giọng thật chỉ nạp ở nguồn `shop`/`kb`.

**Không tự kiểm nhạy cảm:** không chạm auth/RLS/cổng tự gửi/migration.
