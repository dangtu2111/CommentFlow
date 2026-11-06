
## Làn migration (làn DUY NHẤT được thêm migration)

- Trước khi đặt số: `git fetch origin`, xem số migration lớn nhất trên `origin/{{base}}` **và trong các PR đang mở** (`gh pr list --state open`, xem file migration của chúng). Dùng số kế tiếp; nếu `origin/{{base}}` vừa nhảy số khi bạn làm → đổi số trước khi push.
- Migration mới chỉ **thêm** (bảng/cột/index/policy); không sửa migration đã có trên `{{base}}`; không `DROP` dữ liệu.
- Mọi bảng nghiệp vụ mới: cột khóa tenant + RLS ngay trong migration + test RLS. Kiểm bằng công cụ RLS/migration của repo.
- Chỉ chạy migration trên DB của làn (`{{laneDb}}`) hoặc DB dev/test/CI; **không bao giờ** staging/production từ máy này.
- Cần sửa schema ORM/`_journal.json`/snapshot: đó là file chung — sửa đúng phần của mình, không sinh lại cả file.
- Ghi vào mô tả PR: số migration đã dùng, để làn khác biết.
