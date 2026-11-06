## 2j. Bộ đếm Redis + header mức dùng Meta App — `RATE-LIMIT-PAGE` (FR-114, Xong-mock, mã KT-RLP)

Code đã có quy tắc giới hạn gửi theo Page/bài/nội dung lặp (`packages/ai/src/ratelimit/`) chạy bằng bộ đếm bộ nhớ; cờ `SEND_RATE_LIMIT_ENABLED` **tắt mặc định**, chưa nối job `send`. Chỉ khi muốn chạy thật (nhánh nối `RATE-LIMIT-PAGE-WIRE`), bạn cần cung cấp:
- Valkey/Redis (`REDIS_URL`) — đã có ở dev; staging dùng chung.
- Meta App thật để Graph API trả header `X-App-Usage` / `X-Business-Use-Case-Usage` (không cần khóa mới).
