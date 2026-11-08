## Rerank bge-reranker-v2-m3 qua dịch vụ ml — dựng lại ml trên máy ảo (08/11/2026)

**Mục đích:** quyết định "đoạn kiến thức có đủ liên quan để trả lời" bằng ĐIỂM TUYỆT ĐỐI của cross-encoder (thay vì RRF/cosine, vốn không tách được đoạn "cùng chủ đề nhưng không trả lời", vd câu COD kéo đoạn ship). Không bật → ứng dụng vẫn chạy, quyết định bằng cosine.

**RAM:** container `ml` nay `mem_limit: 5g` (bge-m3 ~2,5–3 GB + reranker ~2 GB, nạp lười lần gọi đầu; tải thêm ~2,2 GB vào volume `ml-models`). Máy ảo còn khoảng 35 GB → đủ. Kiểm trước khi bật: `ssh cf "free -m"` (cột `available` nên ≥ 6000).

### Bước 1. Đồng bộ mã lên máy ảo (sau khi PR rerank đã merge vào `main`)
```
pnpm cf:dev sync main
```
(Chưa merge: `pnpm cf:dev sync feat/ml-rerank`.)

### Bước 2. Bật cờ rerank trên máy ảo (TRƯỚC khi dựng container) và ở máy code
Máy ảo:
```
ssh cf "cd ~/CommentFlow && (grep -q '^ML_RERANK_ENABLED=' .env.cf-dev && sed -i 's/^ML_RERANK_ENABLED=.*/ML_RERANK_ENABLED=true/' .env.cf-dev || echo 'ML_RERANK_ENABLED=true' >> .env.cf-dev) && chmod 600 .env.cf-dev"
ssh cf "grep -c '^ML_RERANK_ENABLED=true$' ~/CommentFlow/.env.cf-dev"   # phải ra 1
```
Máy code: thêm dòng `ML_RERANK_ENABLED=true` vào `.env.local` (cùng `ML_URL`; `ML_API_TOKEN` nếu đã đặt cho embedding thì dùng chung). Rồi **khởi động lại web và worker** (cờ đọc lúc khởi động).

### Bước 3. Dựng lại container ml
```
pnpm cf:dev up -d --build ml
pnpm cf:dev ps
```

### Bước 4. Kiểm bằng lệnh thật (lần gọi đầu mất vài phút vì tải model)
```
curl -s -X POST http://192.168.1.124:8001/rerank -H "content-type: application/json" -d "{\"query\":\"ship COD không\",\"documents\":[\"Thanh toán khi nhận hàng (COD) áp dụng toàn quốc\",\"Đổi trả trong 7 ngày\"]}"
```
(Đặt `ML_API_TOKEN` thì thêm `-H "authorization: Bearer <token>"`.) **Kết quả đúng:** `{"model":"bge-reranker-v2-m3","scores":[<cao>,<thấp>]}` — đoạn COD điểm cao hơn rõ rệt. Báo tôi khi xong để tôi hiệu chỉnh ngưỡng và đo EVAL.

### Quay lui
Đặt `ML_RERANK_ENABLED=false` ở `.env.local` và `.env.cf-dev`, `pnpm cf:dev up -d ml`, khởi động lại web/worker: quay về quyết định bằng cosine. Giải phóng RAM: `pnpm cf:dev stop ml`.
