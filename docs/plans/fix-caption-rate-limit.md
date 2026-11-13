# Kế hoạch `fix/caption-rate-limit` — Giới hạn tốc độ hợp lý cho AI caption/hashtag

Mã gap matrix: `POST-PUBLISHING` (sửa lỗi nhỏ sau #355).

**Tóm tắt:** Khi thử AI thật, bấm "AI gợi ý caption" rồi "Tự động hashtag" trong vòng 30 giây thì lần hai báo "Chưa gọi được AI" — vì dùng bộ giới hạn `uiHeavy` (1 lần/30 giây mỗi workspace) và báo nhầm thành lỗi dịch vụ. Đổi sang `uiSensitive` (1 lần/2 giây, 10 lần/10 phút mỗi người) vẫn kiểm soát chi phí LLM, và thêm thông báo riêng `rate_limited`. Không đổi dữ liệu, không migration.

## Điểm chưa rõ
Không có.

## Tiêu chí nghiệm thu
1. Bấm caption rồi hashtag cách nhau vài giây → cả hai chạy được — kiểm bằng trình duyệt thật với LiteLLM thật (đã chạy: caption giữ đúng giá 199.000đ, hashtag trả 5 thẻ, `ai_usage` ghi bước `caption`/`hashtags`).
2. Bấm quá nhanh → thông báo rõ "đợi vài giây", không nhầm với lỗi dịch vụ.

## File sẽ sửa
`apps/web/src/app/app/(guarded)/composer/actions.ts`, `apps/web/src/server/caption-service.ts`, i18n vi/en.
