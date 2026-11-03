---
name: "source-command-codemap-init"
description: "Lập docs/codemap.md một lần duy nhất ở GĐ0 (quét repo có giới hạn)"
---

# source-command-codemap-init

Use this skill when the user asks to run the migrated source command `codemap-init`.

## Command Template

Lập bản đồ source vào `docs/codemap.md` theo đúng khung có sẵn trong file đó. Đây là lần quét repo **duy nhất**; các việc sau sẽ dựa vào bản đồ này.

1. Đọc `package.json` (và workspace/monorepo config, `pyproject.toml` nếu có) để điền mục **Lệnh & công cụ** — chỉ ghi lệnh thực sự có trong file, không đoán. Điền luôn mục **Lệnh** trong `AGENTS.md`.
2. Liệt kê cây thư mục 3 tầng (bỏ `node_modules`, build, `.git`, `.env*`).
3. Với từng miền trong bảng **Bản đồ theo miền**, tìm thư mục/file chính bằng Grep tên đặc trưng (ví dụ `webhook`, `graph.facebook`, `openai|anthropic|generateObject`, `prisma|drizzle|migration`, `shopify`). Đọc phần đầu file đủ để viết vai trò 1 dòng; không đọc toàn bộ.
4. Ghi **Điểm vào quan trọng** (tên hàm + file:dòng) cho: nhận webhook, gửi trả lời bình luận, mọi chỗ gọi LLM, kết nối DB.
5. Miền không tìm thấy → ghi "Chưa có". Không chắc → ghi "Không chắc" + lý do.
6. Giữ file dưới ~150 dòng. Điền ngày và commit hiện tại (`git rev-parse --short HEAD`).

Cuối cùng in tóm tắt tối đa 10 dòng: miền đã có, miền chưa có, điều bất ngờ.
