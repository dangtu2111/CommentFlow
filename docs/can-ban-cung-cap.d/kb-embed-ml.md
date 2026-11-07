## KB-EMBED-ML. Bật embedding bge-m3 (miễn phí) qua dịch vụ `ml` và tạo lại embedding cho Cơ sở kiến thức — `KB-EMBED-LITELLM`, `PGVECTOR-HYBRID` (FR-133)

Tìm kiến thức theo nghĩa cần vector thật. Spec `docs/09` §2 chọn **bge-m3 chạy trong dịch vụ `ml`** (miễn phí, không gửi dữ liệu ra ngoài). Mặc định mọi thứ **TẮT**: chưa làm các bước dưới đây thì ô Thử AI và `kb-reembed` vẫn dùng bản mock như cũ.

Chạy **theo đúng thứ tự**. Lệnh `pnpm …` chạy ở **máy code** (thư mục gốc repo, Git Bash); lệnh `ssh cf …` chạy trên **máy ảo**. Không dán khóa/token vào chat hay commit.

### Bước 0. Kiểm RAM máy ảo (bắt buộc, trước mọi thứ khác)
Container `ml` bị giới hạn `mem_limit: 3g` và nạp bge-m3 mất ~2,5–3 GB. Máy ảo còn có Postgres, Valkey, LiteLLM, ClickHouse, Langfuse… cùng chạy.

```
ssh cf "free -m"
```
Đọc cột **available** (MB). Các ngưỡng dưới đây là ước lượng của tôi, chưa đo trên máy ảo của bạn:
- **≥ 4000** → làm tiếp.
- **3000 – 3999** → làm tiếp được nhưng sát: khi nạp model, các dịch vụ khác có thể bị OOM kill. Trước tiên chạy `pnpm cf:dev stop langfuse-web` (và các dịch vụ không cần), rồi đo lại.
- **< 3000** → DỪNG, đừng bật `ML_EMBED_ENABLED` (máy ảo sẽ treo hoặc kill dịch vụ khác). Nhắn tôi con số để tôi hạ `mem_limit`/chọn model nhỏ hơn.

Kiểm ổ đĩa (tải ~2,3 GB model + ảnh Docker ~2 GB):
```
ssh cf "df -h ~ | tail -1"
```
Cần còn trống ≥ 8 GB.

### Bước 1. Lấy mã mới về máy ảo
Khi PR #236 và #237 **đã merge vào `main`** (kiểm: `gh pr view 236 --json state --jq .state` và `gh pr view 237 --json state --jq .state` đều ra `MERGED`):
```
pnpm cf:dev sync main
```
Nếu chưa merge, dùng nhánh chứa đủ mã (thay `main` bằng tên nhánh): `pnpm cf:dev sync feat/kb-reembed-ml`.

### Bước 2. Bật cờ trên máy ảo (TRƯỚC khi dựng container, vì compose đọc `.env.cf-dev` lúc `up`)
```
ssh cf "cd ~/CommentFlow && (grep -q '^ML_EMBED_ENABLED=' .env.cf-dev && sed -i 's/^ML_EMBED_ENABLED=.*/ML_EMBED_ENABLED=true/' .env.cf-dev || echo 'ML_EMBED_ENABLED=true' >> .env.cf-dev) && chmod 600 .env.cf-dev"
```
Kiểm (kết quả phải là `1`):
```
ssh cf "grep -c '^ML_EMBED_ENABLED=true$' ~/CommentFlow/.env.cf-dev"
```
Tùy chọn — bắt buộc Bearer cho `/embed` (nên làm nếu cổng 8001 mở trong LAN): sinh một token, đặt `ML_API_TOKEN=<token>` vào `.env.cf-dev` trên máy ảo **và** vào `.env.local` ở máy code, cùng giá trị. Bỏ qua = `/embed` mở trong mạng nội bộ.

### Bước 3. Dựng lại container `ml` (build ảnh có torch CPU; model tải ở lần gọi đầu)
```
pnpm cf:dev up -d --build ml
pnpm cf:dev ps
```
Chờ dòng `ml` hiện `healthy` (build ảnh lần đầu vài phút). Nếu lỗi: `pnpm cf:dev logs --tail=50 ml`.

### Bước 4. Kiểm `/embed` trả vector 1024 chiều (lần gọi đầu TẢI model ~2,3 GB — chờ 5–30 phút tùy mạng)
Đặt địa chỉ dịch vụ (lấy đúng giá trị `ML_URL` trong `.env`, ví dụ `http://192.168.1.124:8001`):
```
ML_URL=http://192.168.1.124:8001
```
Gọi thử (đặt `--max-time` lớn cho lần đầu; có token thì thêm `-H "Authorization: Bearer <token>"`):
```
curl -s --max-time 1800 -X POST "$ML_URL/embed" -H "content-type: application/json" -d '{"texts":["ship bao lâu"]}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('model=',j.model,'dimensions=',j.dimensions,'số vector=',j.vectors.length,'chiều vector đầu=',j.vectors[0].length)})"
```
**Kết quả đúng:** `model= bge-m3 dimensions= 1024 số vector= 1 chiều vector đầu= 1024`.
- `503 embedding_disabled` → cờ chưa vào container: làm lại Bước 2 rồi `pnpm cf:dev up -d ml`.
- `503 embedding_unavailable` → thiếu thư viện trong ảnh: `pnpm cf:dev up -d --build ml`.
- `401` → đã đặt `ML_API_TOKEN` ở máy ảo: thêm header Bearer.
- Trong lúc tải model, theo dõi RAM và log: `pnpm cf:dev stats` và `pnpm cf:dev logs --tail=20 ml`. Nếu container `ml` bị khởi động lại liên tục (OOM) → quay lại Bước 0.

### Bước 5. Bật cờ ở máy code
Thêm hai dòng vào `.env.local` (máy code; `ML_URL` đã có sẵn trong `.env`). Lệnh dưới ghi đúng một lần, không nhân đôi dòng:
```
for kv in ML_EMBED_ENABLED=true KB_REEMBED_ENABLED=true; do k=${kv%%=*}; if grep -q "^$k=" .env.local; then sed -i "s/^$k=.*/$kv/" .env.local; else printf '\n%s\n' "$kv" >> .env.local; fi; done
```
- `ML_EMBED_ENABLED=true` (cùng `ML_URL`): ô Thử AI và worker dùng bge-m3.
- `KB_REEMBED_ENABLED=true`: worker đăng ký hàng đợi `kb-reembed`.
- Nếu Bước 2 có đặt `ML_API_TOKEN`, đặt cùng giá trị ở đây.

Khởi động lại worker và web để nạp biến mới (mỗi lệnh một cửa sổ terminal riêng, để chạy nền):
```
pnpm --filter @flow/worker dev
pnpm --filter @flow/web dev
```

### Bước 6. Tạo lại embedding (`kb-reembed`) và kiểm số đoạn
`<workspaceId>` là id workspace của bạn. Với workspace dev đang có dữ liệu Shopify: `e8f9e1e3-a805-491a-81d5-0612fec8d6a2`.

**6a. Đếm TRƯỚC** (lệnh chỉ đọc):
```
pnpm --filter @flow/worker kb:reembed -- count <workspaceId>
```
Kết quả đúng ở thời điểm tôi đo (07/11/2026, workspace trên):
```
Mô hình đích: bge-m3 (dịch vụ ml)
Số đoạn theo mô hình embedding:
  mock-embed-v1: 65
Còn cần tạo lại cho bge-m3: 65
```
Nếu dòng đầu ghi `MOCK — chưa bật ML_EMBED_ENABLED` → cờ/`ML_URL` ở máy code chưa vào (làm lại Bước 5, mở terminal mới).

**6b. Đưa job vào hàng đợi** (worker ở Bước 5 phải đang chạy):
```
pnpm --filter @flow/worker kb:reembed -- enqueue <workspaceId>
```
Worker xử lý theo lô 64 đoạn; 65 đoạn mất vài giây đến vài phút. Theo dõi log của cửa sổ worker.

**6c. Đếm SAU** (lặp lại cho tới khi `Còn cần tạo lại` = 0):
```
pnpm --filter @flow/worker kb:reembed -- count <workspaceId>
```
**Kết quả đúng:**
```
Mô hình đích: bge-m3 (dịch vụ ml)
Số đoạn theo mô hình embedding:
  bge-m3: 65
Còn cần tạo lại cho bge-m3: 0
```
Tổng số đoạn không đổi (65 → 65): chỉ cột vector và tên mô hình thay đổi, nội dung đoạn đã xuất bản bất biến. Chạy lại 6b an toàn (xong rồi thì 0 đoạn).

### Quay lui
- Tắt: đặt `ML_EMBED_ENABLED=false` ở `.env.local` và `.env.cf-dev`, `pnpm cf:dev up -d ml`; ô Thử AI về embedding mock.
- Đã tạo lại sang bge-m3 mà muốn về mock: tắt cờ rồi `kb:reembed -- enqueue <workspaceId>` (worker sẽ tạo lại sang mô hình mock; khi cờ tắt `count` sẽ ghi đích là mock).
- Giải phóng RAM: `pnpm cf:dev stop ml`.

### Lưu ý
- Đổi mô hình embedding mà **chưa** chạy Bước 6 thì tìm kiếm vector không thấy đoạn nào (chỉ lọc đúng mô hình); nhánh tìm theo chữ vẫn chạy. Vì vậy làm Bước 5 và 6 liền nhau.
- Chưa có thử nghiệm với model thật trong CI; kết quả ở Bước 4 và 6 là bằng chứng nghiệm thu của mục này — dán lại cho tôi (bỏ khóa nếu có) để tôi ghi vào `docs/testing`.
