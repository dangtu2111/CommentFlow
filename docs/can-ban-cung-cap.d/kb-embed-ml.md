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

### Bước 5. Bật dịch vụ ml ở máy code
Thêm một dòng vào `.env.local` (máy code; `ML_URL` đã có sẵn trong `.env`). Lệnh dưới ghi đúng một lần, không nhân đôi dòng:
```
kv=ML_EMBED_ENABLED=true; k=${kv%%=*}; if grep -q "^$k=" .env.local; then sed -i "s/^$k=.*/$kv/" .env.local; else printf '\n%s\n' "$kv" >> .env.local; fi
```
- `ML_EMBED_ENABLED=true` (cùng `ML_URL`): bật/tắt DỊCH VỤ ml. **Env không chọn model**: model đang hoạt động nằm ở DB (`cf.embedding_state`) và chỉ đổi bằng lệnh Bước 6 (FR-133, Q-EMB-1).
- Nếu Bước 2 có đặt `ML_API_TOKEN`, đặt cùng giá trị ở đây.
- Cờ `KB_REEMBED_ENABLED` và lệnh `kb:reembed` đã gỡ bỏ — xóa dòng `KB_REEMBED_ENABLED` khỏi `.env.local` nếu còn.

Khởi động lại worker và web để nạp biến mới (mỗi lệnh một cửa sổ terminal riêng, để chạy nền):
```
pnpm --filter @flow/worker dev
pnpm --filter @flow/web dev
```
Trước Bước 6, worker ghi log "DB chưa kích hoạt model embedding" và ô Thử AI hiện "Chưa kích hoạt model embedding"; trong lúc đó chỉ tìm toàn văn/trigram (không có vector giả).

### Bước 6. Kích hoạt / đổi model embedding (`kb:switch-embedding`)
Lệnh riêng, chạy bằng kết nối worker (không dùng khóa admin), áp dụng cho TOÀN BỘ dữ liệu của mọi workspace (đoạn kiến thức nháp + đã xuất bản, tên sản phẩm).

**6a. Xem trạng thái TRƯỚC** (chỉ đọc):
```
pnpm --filter @flow/worker kb:switch-embedding -- --status
```
Lần đầu: `Model đang hoạt động: (chưa kích hoạt)`.

**6b. Chuyển sang bge-m3** (dịch vụ ml ở Bước 4 phải đang chạy):
```
pnpm --filter @flow/worker kb:switch-embedding -- bge-m3
```
Lệnh tạo vector mới vào cột đệm cho mọi dòng trong khi truy vấn vẫn dùng model cũ; đủ 100% mới đổi model hoạt động trong MỘT giao dịch (bảng bị khóa ghi vài giây). Lỗi hoặc Ctrl+C giữa chừng → model cũ giữ nguyên, chạy lại lệnh để tiếp tục. Nếu dịch vụ ml trả model khác model đích, lệnh từ chối ngay.

**6c. Kiểm SAU:**
```
pnpm --filter @flow/worker kb:switch-embedding -- --status
```
**Kết quả đúng:** `Model đang hoạt động: bge-m3` và `Đang chuyển sang: (không)`. Ô Thử AI không còn banner "Chưa kích hoạt model embedding".

### Quay lui
- Tắt dịch vụ: đặt `ML_EMBED_ENABLED=false` ở `.env.local` và `.env.cf-dev`, `pnpm cf:dev up -d ml`; nhánh vector tắt (toàn văn/trigram), model hoạt động ở DB giữ nguyên.
- Đổi model: chạy lại Bước 6b với tên model khác (dịch vụ ml phải phục vụ đúng model đó).
- Giải phóng RAM: `pnpm cf:dev stop ml`.

### Lưu ý
- Không thể "quên" đổi dữ liệu: chưa kích hoạt model thì ứng dụng không ghi vector nào (DB từ chối), nên không có tình trạng nửa cũ nửa mới. Dữ liệu cũ do bản giả tạo (model `mock-…`/`fixture-…`) bị thay hoàn toàn ở Bước 6b.
- Dịch vụ ml chết giữa lúc chạy: ô Thử AI/worker vẫn trả lời bằng toàn văn/trigram và báo sự cố (không mock).
- Chưa có thử nghiệm với model thật trong CI; kết quả ở Bước 4 và 6 là bằng chứng nghiệm thu của mục này — dán lại cho tôi (bỏ khóa nếu có) để tôi ghi vào `docs/testing`.
