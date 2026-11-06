## KT-AVK — Khóa ảo LiteLLM theo workspace (AI-VIRTUALKEY, feat-ai-virtualkey) — chỉ làm được sau khi có master key + `AI-VIRTUALKEY-DB`

> Hiện chỉ có logic + mock (cờ tắt, chưa nối). Kiểm tự động đã phủ: `pnpm --filter @flow/ai exec vitest run src/virtual-key`. Các bước dưới dành cho staging khi đã nối.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | Bật `LITELLM_VIRTUAL_KEYS_ENABLED=true` ở staging, gọi AI từ workspace THỬ A | LiteLLM xuất hiện khóa alias `cf-ws-<id A>` với `max_budget` = trần chi phí AI của A |
| 2 | Gọi AI từ workspace THỬ B | Khóa khác, alias chứa id B |
| 3 | Đổi trần chi phí của A rồi gọi AI lại | `max_budget` của khóa A đổi theo, không sinh khóa mới |
| 4 | Đặt trần A rất thấp, gọi tới khi vượt | A bị chặn (cổng chi phí hoặc LiteLLM); B vẫn gọi được |
| 5 | Tắt cờ | Mọi workspace quay về khóa dùng chung |
