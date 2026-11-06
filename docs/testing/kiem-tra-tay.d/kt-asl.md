## KT-ASL — Admin tạm khóa gửi (ADMIN-SEND-LOCK, FR-116)

Chỉ phần máy (chưa có bảng lưu khóa, chưa có giao diện): người thử chạy test.
1. `pnpm --filter @flow/ai exec vitest run src/send-lock src/gate/send-lock-gate.test.ts src/recheck/send-lock-recheck.test.ts` → xanh. Kết quả mong đợi: chỉ `super` (workspace + kênh) và `support` (chỉ kênh) khóa/mở khóa được, `finance` không; khóa Page áp xuyên workspace; khóa hết hạn/đã mở thì không chặn; khóa không đọc được thì chặn; cổng tự gửi cổng 1 và `sendRecheck` R3 đều trượt khi bị khóa.

---
