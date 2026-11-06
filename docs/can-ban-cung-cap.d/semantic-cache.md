## 2t. `SEMANTIC-CACHE` (FR-026) — cần khi bật semantic cache thật (GĐ5)
Logic đã xong sau interface `SemanticCacheStore`, cờ `CACHE_SEMANTIC_ENABLED` MẶC ĐỊNH TẮT. Để bật thật bạn cần: (1) Redis Stack (RediSearch/vector) và bản cài đặt `SemanticCacheStore` nối Redis; (2) model embedding thật thay `createFixtureEmbedder`; (3) chỉnh ngưỡng độ giống theo dữ liệu thật của shop.
