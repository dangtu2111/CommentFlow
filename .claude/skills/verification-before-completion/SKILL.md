---
name: verification-before-completion
description: Dùng trước khi tuyên bố việc xong/đã sửa/test qua, trước khi commit hoặc báo chủ dự án — phải chạy lệnh kiểm và đọc kết quả mới được nói "xong". Bằng chứng trước lời khẳng định.
---

# Kiểm chứng trước khi báo xong — CommentFlow

> Phỏng theo skill `verification-before-completion` của obra/superpowers (MIT, © 2025 Jesse Vincent), bản dịch/chỉnh cho repo này. Nguồn, commit và giấy phép: `docs/decisions/006-skills.md`. Bổ trợ `docs/workflows/finish.md`, không thay thế.

**Nguyên tắc:** bằng chứng trước lời khẳng định.

```
KHÔNG TUYÊN BỐ HOÀN THÀNH KHI CHƯA CÓ BẰNG CHỨNG KIỂM MỚI
```

Chưa chạy lệnh kiểm **trong lượt này** thì không được nói nó qua.

## Cổng kiểm

Trước khi nói bất cứ điều gì về trạng thái ("xong", "test qua", "build ổn"):

1. **Xác định:** lệnh nào chứng minh điều khẳng định?
2. **Chạy:** lệnh đầy đủ, mới.
3. **Đọc:** toàn bộ output, mã thoát, đếm số lỗi.
4. **Đối chiếu:** output có xác nhận điều khẳng định không? Không → nói trạng thái thật kèm bằng chứng. Có → nói kèm bằng chứng.
5. Chỉ sau đó mới khẳng định.

## Cái gì chứng minh cái gì

| Khẳng định | Cần | Không đủ |
|---|---|---|
| Test qua | Output lệnh test: 0 lỗi | Lần chạy trước, "chắc qua" |
| Lint sạch | `pnpm lint` 0 lỗi | Kiểm một phần |
| Typecheck ổn | `pnpm typecheck` mã thoát 0 | Lint qua |
| Build ổn | `pnpm build` mã thoát 0 | Lint qua, log trông ổn |
| Lỗi đã sửa | Test tái hiện triệu chứng gốc nay qua | Đã đổi mã nên chắc xong |
| Test hồi quy hiệu quả | Chu trình đỏ-xanh: bỏ bản sửa → đỏ → khôi phục → xanh | Test qua một lần |
| Agent/subagent đã làm | `git diff` thấy thay đổi | Agent báo "thành công" |
| Đủ tiêu chí nghiệm thu | Đối chiếu từng tiêu chí của plan với bằng chứng | "Test qua nên xong" |

Bộ lệnh cuối nhánh của repo: `pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise && pnpm check:plans && pnpm check:migrations && pnpm test && pnpm test:trace` (+ `pnpm test:coverage`; nhánh có DB: `pnpm test:db`, `pnpm db:check-rls`).

## Dấu hiệu phải dừng

Dùng "chắc", "có lẽ", "hình như" · vui mừng trước khi kiểm ("Tuyệt!", "Xong!") · sắp commit/PR mà chưa kiểm · tin báo cáo của agent · chỉ kiểm một phần · "lần này thôi" · mệt muốn xong.

## Bao biện thường gặp

| Lời bào chữa | Sự thật |
|---|---|
| "Chắc qua rồi" | Chạy lệnh kiểm |
| "Tôi tự tin" | Tự tin ≠ bằng chứng |
| "Linter qua" | Linter ≠ compiler |
| "Agent báo thành công" | Tự kiểm độc lập (xem diff) |
| "Kiểm một phần đủ rồi" | Một phần không chứng minh gì |

## Khi nào áp dụng

Luôn, trước: mọi câu khẳng định thành công; mọi biểu hiện hài lòng; commit, tạo PR, kết thúc việc; sang việc kế; giao việc cho agent. Áp dụng cả với diễn đạt khác nghĩa tương tự. Việc chưa chạy thì báo "chưa chạy", không ngầm coi là qua.
