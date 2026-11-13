# Kế hoạch `fix/caption-buttons-usable` — Nút AI caption/hashtag luôn bấm được và có hướng dẫn

Mã gap matrix: `POST-PUBLISHING` (sửa lỗi nhỏ sau #355).

**Tóm tắt:** Hai nút "AI gợi ý caption" và "Tự động hashtag" bị khóa (mờ) cho tới khi có nội dung trong ô bài viết, nên người dùng thấy như tính năng chưa dùng được. Giờ nút luôn bấm được khi AI sẵn sàng; bấm lúc chưa có nội dung thì báo ngay "Hãy nhập ý tưởng hoặc nội dung trước" (không gọi máy chủ/LLM), và có dòng hướng dẫn cách dùng ngay dưới tiêu đề. Không đổi dữ liệu, không migration.

## Điểm chưa rõ
Không có.

## Tiêu chí nghiệm thu
1. AI sẵn sàng → hai nút bật ngay cả khi ô nội dung trống, có dòng hướng dẫn — test render + trình duyệt thật.
2. Bấm khi trống → thông báo rõ, không gọi LLM — trình duyệt thật.

## File sẽ sửa
`apps/web/src/components/composer/composer-studio.tsx` (+ test), i18n vi/en.
