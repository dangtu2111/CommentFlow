@AGENTS.md

# Riêng cho Claude Code

Lệnh tắt: `/feature <mã>` = `docs/workflows/feature.md` · `/finish` = `docs/workflows/finish.md` · `/stitch-sync` = `docs/workflows/stitch-sync.md` · `/codemap-init` (chỉ chạy một lần ở GĐ0) · `/fix-issues [nhánh]` (máy chính: sửa lỗi staging từ GitHub Issues) · `/staging-verify <nhánh>` và `/mech <việc>` (chỉ máy phụ — xem `AGENTS.md` § Hai máy; mỗi máy vẫn chỉ một phiên).


## Một agent, một phiên (chủ dự án chốt 07/11/2026: không dùng multi-agent)

**Không gọi subagent** (`Agent`, `verifier-*`, `test-runner`, `gap-analyzer`, workflow nhiều agent), không chạy nhiều phiên/làn song song, không nạp việc cho agent nền. Phiên chính tự làm hết, từng nhánh một, tuần tự; xong nhánh này mới sang nhánh khác. Chủ dự án muốn chạy song song hay gọi agent phụ thì sẽ nói rõ trong phiên.

- **Kiểm chứng nhạy cảm** (auth, phiên, token, chữ ký webhook, RLS/`withWorkspace`, thanh toán, cổng tự gửi, `sendRecheck`, che PII, migration): vì không có người kiểm thứ hai, phiên chính chạy **bản kiểm tự kiểm theo `docs/workflows/verify.md`** trên diff cuối nhánh (mở lại diff như người đọc lạ, đi từng mục), nêu kết quả trong báo cáo cuối và gắn nhãn "tự kiểm, chưa có kiểm chứng độc lập". Nhánh nhạy cảm vẫn nên để chủ dự án (hoặc Codex, khi họ muốn) kiểm chéo trước khi merge; không tự merge nhánh loại này.
- **Test dài / E2E / build:** chạy thẳng bằng Bash ở phiên chính, lọc output chỉ lấy lỗi (`| tail`, `grep`); lệnh chạy lâu dùng `run_in_background`.
- **Lập gap matrix:** phiên chính đọc đúng mục spec + `docs/codemap.md`, từng nhóm một.
- **Việc cơ học trải nhiều file:** phiên chính làm bằng script hoặc sửa tuần tự, kiểm bằng typecheck/test. Không còn "làn Haiku".
- Không đổi `/model` qua lại giữa chừng một phiên (mất cache).

## Cấu hình và bản giả (chủ dự án chốt 08/11/2026 — đọc kỹ)

- **Không bao giờ đổi model embedding hay cờ ảnh hưởng dữ liệu chỉ cho MỘT lệnh** trong khi ứng dụng chạy cấu hình khác (tiền lệ: bge-m3 bật bằng cờ riêng cho lệnh `kb:reembed` còn ứng dụng chạy mock → nhánh vector vô nghĩa). Cần đổi → DỪNG và báo chủ dự án sửa `.env.local` rồi khởi động lại, SAU ĐÓ mới chạy lệnh. Không tự ghi/đọc `.env*`.
- **Ứng dụng KHÔNG chạy bản giả:** thiếu dịch vụ thật → lỗi rõ khi khởi động hoặc tắt tính năng kèm thông báo; không tự rơi về mock. Mock chỉ cho test tự động, cắm qua tham số, có chốt chặn `assertMockAllowed`. Khi thêm tính năng mới KHÔNG thêm đường mock chọn bằng biến môi trường.
- Cấu hình embedding đọc ở MỘT hàm (`resolveEmbeddingConfig`) cho web/worker/EVAL; mọi báo cáo EVAL ghi embedder đã dùng.
