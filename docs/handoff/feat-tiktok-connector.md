# Bàn giao — nhánh `feat-tiktok-connector`

Cập nhật: 06/11/2026 · Mục gap matrix: TIKTOK-CONNECTOR · Agent vừa làm: claude
Kế hoạch: `docs/plans/feat-tiktok-connector.md`

## Đã làm
- `packages/connectors/src/tiktok/` (connector, fixtures, test), export ở `index.ts`; cờ + cấu hình + đăng ký ở worker; env.example; docs (Q-TT1, codemap, CBCC, KT-TT, gap, MASTER).

## Đã đọc và rút ra
| File | Điều cần nhớ |
|---|---|
| `instagram/connector.ts` | khuôn connector; tái dùng `readBoundedText`, timeout từ facebook |
| `declarations.ts` | tiktok: reply 150 ký tự/48 giờ, hide không hỗ trợ |

## Quyết định đã chốt trong phiên
- Q-TT1 (id ghép `video:comment`, polling-first, không ẩn, chữ ký `TikTok-Signature`).

## Còn lại
1. `TIKTOK-CHANNEL-CONNECT` (OAuth + kênh `platform='tiktok'`, cần migration — làn b). 2. `TIKTOK-POLLING`. 3. Đối chiếu endpoint/chữ ký với tài khoản thật (KT-TT).

## Lệnh test liên quan
```
pnpm --filter @flow/connectors exec vitest run src/tiktok
pnpm --filter @flow/worker exec vitest run src/config.test.ts src/channels
```
