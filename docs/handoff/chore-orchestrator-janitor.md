# Handoff chore/orchestrator-janitor (claude, làn c)

Đã làm: `janitor` (`src/janitor.mjs`), nhịp tim (`src/heartbeat.mjs`), tên dấu (`src/markers.mjs`), khóa merge (`decidePr({frozen})`), `isSafeToMerge` kiểm CI lại trước merge, dấu theo dõi PR trong `driveToMerge`, `gh.listOpenPrs`, `readMarker`; config `janitor`/`heartbeat`; test `tests/janitor.test.mjs`; docs `orchestrator.md` (mục mới + phân tích nguyên nhân).
Đọc: runner/decide/config/checks/adapters/logger + bin. Điều rút ra: `driveToMerge` giờ bọc `driveLoop` (finally xóa dấu tracking); janitor dừng sớm khi khóa merge (tránh chờ vô hạn).
Còn lại: chủ dự án bật `janitor.lane` trong `orchestrator.config.json` và chạy `janitor` ở một cửa sổ nền; chưa chạy thật với `gh` (chỉ test giả lập).
