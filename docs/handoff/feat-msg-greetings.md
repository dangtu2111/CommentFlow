# Bàn giao — nhánh `feat-msg-greetings`

Cập nhật: 06/11/2026 · Mục gap matrix: MSG-GREETINGS · Agent vừa làm: claude · Kế hoạch: `docs/plans/feat-msg-greetings.md`

## Đã làm
- `packages/ai/src/greetings/` (`selectGreeting`, `greetingConfigSchema`, nhãn lý do) + test ví dụ/biên/property; export `openingPhrase` + `InvitationLang` từ `decide/order-hours-rules.ts`.
- Docs: Q-MSG1, codemap, KT-MSG1, dòng gap matrix/MASTER.

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `decide/order-hours-rules.ts` | `evaluateBusinessHours` (thiếu giờ = `unknown`), `promisesImmediateReply`, `openingPhrase` |
| `gate/lang-autosend.ts` | `resolveReplyLang` (`other` khi ngoài vi/en) |
| `private-reply/private-reply-check.ts` | mẫu hàm thuần + nhãn lý do |

## Còn lại
1. `MSG-GREETINGS-WIRE` (làn b): bảng/cột cấu hình theo kênh + mốc đã chào/đã báo (migration); job gọi `selectGreeting` → `sendRecheck` R8 → connector; `automation_events`.
2. `MSG-GREETINGS-UI`: thẻ cấu hình mẫu/giờ trong Cài đặt kênh (chờ bộ thành phần chung).

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/greetings
pnpm --filter @flow/ai test:coverage
```
