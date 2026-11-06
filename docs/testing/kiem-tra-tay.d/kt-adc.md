## KT-ADC — Khoảng trễ tự gửi có hủy (AUTO-DELAY-CANCEL, FR-071, US-042, feat-auto-delay-cancel)

> Chưa nối pipeline/giao diện nên kiểm bằng lệnh. / Not wired to pipeline/UI yet — verify by command.

| # | Bước / Step | Kết quả mong đợi / Expected |
|---|---|---|
| 1 | `pnpm --filter @flow/ai exec vitest run src/delay` | Mọi test xanh (gồm property-based: câu đã hủy không bao giờ được giao; không giao trước `runAt`; mỗi câu giao đúng một lần). / All green. |
