# Handoff feat-ig-connector (claude, làn c)

Đã làm: `packages/connectors/src/instagram/` (connector, webhook, fixtures, test), export `classifyGraphCode`/`retryAfterOf` từ connector Facebook để dùng lại, cờ worker `IG_CONNECTOR_ENABLED` (config + registry + test), `env.example`, docs/12 §2 (Q-IG1), CBCC/KT-IG/codemap/gap-matrix/MASTER.
Đọc: connector/webhook Facebook, attachments, types, contract, declarations, worker config/registry. Rút ra: webhook IG `comments` không có giờ tạo → `entry.time`; edge `/comments` của media chỉ cấp 1; `meta-webhook.ts` (web) hiện cứng `object: page`/`platform: facebook`.
Còn lại: `IG-WEBHOOK-ROUTE` (web), `IG-CHANNEL-CONNECT` (kênh `instagram`, cần xem lược đồ `channels` — làn b); chưa gọi Meta thật (KT-IG).
