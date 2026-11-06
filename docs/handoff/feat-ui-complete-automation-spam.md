# Handoff — feat-ui-complete-automation-spam (claude)

**Đã làm:** công cụ đối chiếu chữ `e2e/support/ui-completeness.mjs` (+ phần thuần có test ở `scripts/lib`); dựng đủ thành phần `/app/automation` (96,5%) và `/app/spam-rules` (98,3%); kit mới Switch/Progress/MetricCard/PlatformBadge; kiểm kê trang khác ở `docs/plans/ui-thieu-thanh-phan.md`.

**Điều rút ra:** trang dev `/dev/ui/*` không có vỏ ứng dụng nên đo bề rộng lệch; chạy công cụ trên Git Bash phải gõ `//dev/ui/...`. Dữ liệu mẫu chỉ hiện khi `APP_ENV=dev` (`showSampleData`). Rule-card, nhật ký ẩn, số liệu là mẫu — chưa có dữ liệu thật.

**Việc còn lại:** nối `EMERGENCY-STOP-WIRE`, `SPAM-RULES-LIST-UI` (đọc `cf.rules`), Tự ẩn; đo lại bbox khi có AppShell; `overflow390` của automation còn `true` trong `so-bbox.json` (chưa tìm ra phần tử); các trang trong `ui-thieu-thanh-phan.md`.
