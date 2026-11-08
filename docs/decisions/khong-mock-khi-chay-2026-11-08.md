# Rà soát: đường mock còn lại khi ứng dụng chạy (08/11/2026)

Chủ dự án chốt: **ứng dụng KHÔNG dùng mock khi chạy** (web, worker, mọi môi trường chạy được kể cả dev). Thiếu dịch vụ thật → báo lỗi rõ khi khởi động hoặc tắt hẳn tính năng kèm thông báo trên giao diện. Mock chỉ cho test tự động (cắm qua tham số, không chọn được bằng biến môi trường; chốt chặn `assertMockAllowed`). Rà bằng tìm kiếm trong `apps/web`, `apps/worker`, `packages/*` và đọc nơi lắp ráp.

## Đã sửa trong nhánh này (nền + embedding)
| Chỗ | Trước | Nay |
|---|---|---|
| Embedder ô Thử AI (`try-ai/actions.ts`) | rơi về embedder fixture khi thiếu `ML_EMBED_ENABLED` | `resolveEmbeddingConfig`: `off` → không nhánh vector (toàn văn + trigram) |
| Embedder job `pipeline` (`worker/main.ts`) | không truyền → rơi về fixture | truyền embedder thật; `off` → không nhánh vector |
| Embedder `kb-reembed` (worker + CLI) | `createMockEmbedder` khi thiếu cờ | Gỡ job `kb-reembed` + cờ `KB_REEMBED_ENABLED`; đổi model bằng `kb:switch-embedding <model>` (embedder thật, model đích do tham số, DB là nguồn model hoạt động — Q-EMB-1) |
| `createFixtureEmbedder` / `createMockEmbedder` | chọn được lúc chạy | gắn `assertMockAllowed` (có test) |
| EVAL `--backend mock` | không nhãn | tự khai báo, báo cáo ghi "MOCK — không phải số đo chất lượng"; mọi báo cáo ghi embedder |

## Còn lại (mỗi dòng một gap trong `docs/gap-matrix.md`; PR nhỏ, test trước)
| # | Chỗ | Hiện trạng khi chạy | Thay bằng | Cần tài nguyên của chủ dự án |
|---|---|---|---|---|
| 1 | `apps/web/src/server/try-ai.ts` (`createDemoExtractor/Drafter`) | thiếu cờ/URL LiteLLM → Thử AI chạy extractor/drafter MẪU | tắt ô Thử AI kèm thông báo "Chưa cấu hình LLM" | LiteLLM + cờ LLM (đã có ở dev) |
| 2 | `apps/web/src/server/kb-testset.ts` (`createDemo*`) | bộ câu kiểm thử chạy pipeline MẪU (Q-KTS1) | chạy pipeline thật hoặc tắt kèm thông báo | như dòng 1 |
| 3 | `try-ai-knowledge.ts` + `try/demo-knowledge.ts` | workspace chưa có dữ liệu → kiến thức MẪU | "Chưa có kiến thức để thử" + hướng dẫn nhập | không |
| 4 | `web/server/auth.ts` (`createMockSmsProvider`, `SMS_MOCK_OUTBOX_FILE`) | OTP SĐT gửi MOCK (log/tệp, chọn bằng biến môi trường) | tắt xác minh SĐT tới khi có SMS thật; bỏ biến outbox; E2E đổi sang test đơn vị | **Nhà cung cấp SMS + khóa** |
| 5 | `web/lib/avatar.ts` (`createMockAvatarStore`) | ảnh đại diện trả đường dẫn giả (cờ tắt mặc định) | giữ tắt (ẩn nút + thông báo) | **Kho ảnh R2/S3 + khóa** |
| 6 | `web/server/ai-sent-history.ts` (`createInMemoryHistoryStore`) | lịch sử "AI đã gửi" trong BỘ NHỚ | store DB thật hoặc trang trống kèm thông báo | không |
| 7 | `showSampleData()` (reports, leads, activity, spam-rules, automation, register, invite) | `APP_ENV=dev` hiện dữ liệu `[MẪU]` ở trang thật (Q-UIF1) | **chủ dự án chốt:** giữ làm công cụ dựng UI (đầu vào giả lập có nhãn) hay bỏ | chỉ cần quyết định |
| 8 | `shared/notification-channels.ts` (`createMockPush/EmailProvider`) | chưa nối vào app | chỉ test; khi nối dùng thật + `assertMockAllowed` | Push/Email thật khi cần |
| 9 | `ai/virtual-key/admin.ts` (`createMockKeyAdmin`) | chưa nối (cờ tắt) | chỉ test; khi bật dùng admin LiteLLM thật | Master key LiteLLM |
| 10 | `ai/observability/routing.ts` (`MOCK_MODEL='mock-llm'` khi tắt) | chưa nối `llm-client` | bỏ nhánh `mock-llm`/báo lỗi | không |
| 11 | `createDemo*`/`createFixture*` còn lại trong `@flow/ai` | dùng bởi #1–3, EVAL, test | gắn `assertMockAllowed` từng bản (embedder đã xong) | không |
| 12 | Connector tắt cờ (FB/IG/Messenger/TikTok/Shopify…) | sổ connector rỗng → `connector_unavailable` | ĐÚNG hướng; đảm bảo UI báo "chưa kết nối" | Khóa/OAuth (đã trong CAN_BAN_CUNG_CAP) |
| 13 | `*.fixtures.ts` của connectors | chỉ test | giữ; kiểm không import từ web/worker | không |
| 14 | `pnpm dev:seed-demo` ([MẪU]), `pnpm dev:push-webhook` ([FIXTURE]) | dữ liệu ĐẦU VÀO giả lập, nhãn, chỉ cf_dev, qua đường thật | GIỮ (đã chốt) | không |

"Xong-mock" ở các gap cũ nghĩa là code thật đã xong nhưng CHƯA có tài nguyên thật; không còn nghĩa "đang chạy bản giả".
