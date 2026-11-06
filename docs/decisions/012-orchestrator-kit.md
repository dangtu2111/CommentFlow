# 012 — Bộ điều phối nhiều làn nằm trong repo (`tools/orchestrator`) (06/11/2026)

Trạng thái: **Đề xuất áp dụng** ở `chore/orchestrator-kit`. Quy trình chạy: `docs/workflows/orchestrator.md`.

## Quyết định

Đóng gói driver điều phối làn (trước là script bash cứng đường dẫn/tên dự án) thành công cụ Node cấu hình bằng `orchestrator.config.json`, đặt ở `tools/orchestrator/` cùng prompt khung và test.

## Vì sao trong repo (chưa tách riêng)

- Còn đang tinh chỉnh theo bài học thực tế; sửa và dùng ngay trong cùng PR, cùng CI (Vitest nhóm Node).
- Chưa có người dùng thứ hai; tách repo sớm tốn công phát hành/đồng bộ phiên bản mà chưa thêm giá trị.
- Không kéo rủi ro: chỉ stdlib Node, không import gói nội bộ (đúng tinh thần ranh giới `saas-core`), không chạm `.github/workflows`, không giữ bí mật.

## Cách tách ra repo riêng sau

1. Sao nguyên thư mục `tools/orchestrator/` (đã tự đứng: `package.json`, `bin/`, `src/`, `templates/`, `tests/`, config mẫu) sang repo mới, giữ lịch sử bằng `git subtree split -P tools/orchestrator`.
2. Mô tả hiện nằm trong `docs/workflows/orchestrator.md` → chuyển thành README của repo mới; ADR này giữ lại ở đây làm lịch sử.
3. Dự án dùng: `pnpm add -D` từ git/registry hoặc `git submodule`; chỉ cần thêm `orchestrator.config.json` + `orchestrator/prompts/`. Template riêng đặt ở `<promptDir>/_templates/` để ghi đè mà không sửa gói.
4. Điều kiện nên tách: có ≥ 2 dự án dùng thật, hoặc cần phát hành phiên bản độc lập.

## Đảo ngược

Xóa `tools/orchestrator/`, `docs/workflows/orchestrator.md`, ADR này và các dòng trỏ tới; không ảnh hưởng mã sản phẩm.
