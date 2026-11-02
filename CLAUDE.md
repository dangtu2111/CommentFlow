@AGENTS.md

# Riêng cho Claude Code

Lệnh tắt: `/feature <mã>` = `docs/workflows/feature.md` · `/finish` = `docs/workflows/finish.md` · `/stitch-sync` = `docs/workflows/stitch-sync.md` · `/codemap-init` (chỉ chạy một lần ở GĐ0) · `/fix-issues [nhánh]` (máy chính: sửa lỗi staging từ GitHub Issues) · `/staging-verify <nhánh>` và `/mech <việc>` (chỉ máy phụ — xem `AGENTS.md` § Hai máy).

## Subagent của Claude Code

Chỉ khi có **giá trị kiểm chứng độc lập** hoặc **chuyên môn bổ sung**:

| Dùng | Agent | Đầu vào (không hơn) |
|---|---|---|
| Thay đổi chạm auth, token, webhook chữ ký, RLS, thanh toán, cổng tự gửi, `sendRecheck`, che PII | `verifier-security` | diff + mục spec liên quan; **không** kèm lập luận của người viết |
| Migration, index, RLS policy, truy vấn tìm kiếm | `verifier-db` | diff migration/SQL + `docs/10_Database_Design.md` mục liên quan |
| Lập/cập nhật gap matrix cho một nhóm spec (GĐ0, hoặc khi spec đổi lớn) | `gap-analyzer` | mục spec + `docs/codemap.md` |

**Làn Haiku** — chỉ khi đủ cả 3 điều kiện: việc tự đứng được với đầu vào ghi rõ; kết quả kiểm được bằng công cụ (test/typecheck/lint); không cần ngữ cảnh mà phiên chính đang giữ.

| Việc | Cách chạy |
|---|---|
| Chạy bộ test dài / E2E / build toàn bộ, chỉ trả lỗi | agent `test-runner` (haiku) |
| Việc cơ học trải nhiều file: tách chuỗi giao diện ra `vi.json`/`en.json`, đổi tên theo danh sách, thêm `workspace_id` vào loạt truy vấn theo mẫu đã duyệt | **phiên mới** `claude --model haiku` với mô tả việc + danh sách file; kiểm bằng typecheck/test |
| Dịch chuỗi giao diện sang tiếng Anh | phiên Haiku; chủ dự án duyệt |

Không đưa cho Haiku: logic cổng tự gửi, `sendRecheck`, RLS, thanh toán, prompt AI sản phẩm, quyết định thiết kế. Không đổi `/model` qua lại giữa chừng một phiên (mất cache, đọc lại ngữ cảnh). Haiku làm sai 2 lần → phiên chính tự làm, không gọi lần ba.

Không dùng AI thứ hai để: viết code, sửa lỗi build thường, chạy test, review thay đổi giao diện/văn bản, tóm tắt log ngắn, "kiểm tra lại cho chắc" khi công cụ đã xanh.

