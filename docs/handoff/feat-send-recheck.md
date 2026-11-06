# Bàn giao — nhánh `feat-send-recheck`

Cập nhật: 2026-11-06 · Mục gap matrix: SEND-RECHECK · Agent vừa làm: claude · Commit cuối: xem `git log -1`
Kế hoạch: `docs/plans/feat-send-recheck.md`

## Đã làm
- `packages/ai/src/recheck/send-recheck.ts`: `sendRecheck(raw)` — Zod đầu vào đã đo; `RULES` 9 hàm đúng thứ tự `docs/09` §6.1; trượt → `{ok:false, rule:'recheck:R#', reason, action, rulesPassed}`; đầu vào hỏng → `rule:'recheck:input'`. R1 trạng thái theo chế độ (`human` chỉ `sending`); R4/R6/R7 chỉ `mode:'auto'` (thiếu dữ liệu → trượt); R5 cần `price.hasMoney` do code dò (auto + `null` → `price_unknown`), so bằng ảnh chụp giá theo sản phẩm (auto → `hold_review`, human → `ask_confirm`); R8 24 giờ / 7 ngày HUMAN_AGENT (chỉ người gửi); R9 `rate:null` → qua, hết lượt → `defer`.
- Test TDD + property-based (`send-recheck.test.ts`, seed 20261106, có oracle độc lập viết lại từ bảng §6.1); ngưỡng nhánh 95 % cho `src/recheck/*.ts`; Stryker cài ở `packages/ai` (`stryker.config.mjs`, `test:mutation`): `send-recheck.ts` 95,2 %, gate 87,7 %, guard-money 80,7 %.
- verifier-security (một lần): không chặn merge; 2 "nên sửa" đã sửa (R1 theo chế độ, R5 `hasMoney`); ghi nhận → Q-SR1 (i).
- Worker `apps/worker/src/jobs/send.ts`: R1–R3 viết thẳng → `sendRecheck(recheckInputFromRow(row, now))` + `settlementForRecheck`; R9 → `SendRetryableError('recheck:R9')`; `@flow/ai` thêm vào deps worker. Test đơn vị `send-recheck-input.test.ts`; test tích hợp `apps/worker/tests/send.int.test.ts` (R1–R3) KHÔNG chạy ở làn c — CI/làn b chạy.
- Web: `reply-errors.ts` + i18n `recheckR4–R9` (vi/en); `reply-state.test.ts`.
- Sửa CI đỏ (job Database, test `R2 deleted_at` → `recheck:input`): NGUYÊN NHÂN GỐC là Drizzle/node-postgres trả cột `timestamptz` của `tx.execute()` dưới dạng CHUỖI thô Postgres (`2026-11-06 05:43:03.943757+00`), không phải `Date`, nên Zod `z.iso.datetime` từ chối → `recheck:input`. Thêm `packages/db/src/row-timestamp.ts` (`timestampFromRow`, `RawTimestamp`, dùng bộ phân tích của `pg`; chuỗi hỏng → ném `AppError`) + test; `send.ts` đọc `deleted_at`/`comment_created_time` qua nó (cả `referenceAt` của `evaluateAction` và `fetchComments`); test hồi quy trong `send-recheck-input.test.ts`. Merge `origin/main` (AI-READINESS, injection) giữ cả hai phía ở `KIEM_TRA_TAY.md`, `packages/ai/src/index.ts`, `vitest.config.ts`.
- Docs: Q-SR1, gap matrix (SEND-RECHECK ✅, SEND-RECHECK-WIRE, MUTATION-STRYKER, SEND-RATE-LIMIT), MASTER, codemap, STANDARD §8, CAN_BAN §2j, KT-SR.

## Đã đọc và rút ra (để phiên sau không đọc lại)
| File | Điều cần nhớ |
|---|---|
| `docs/09` §6.1 | Bảng R1–R9: cột "Áp dụng" (mọi lần / chỉ tự gửi / câu có số tiền / tin nhắn) và "Trượt thì" quyết định `action` |
| ADR 008 | Outbox `comment_replies` chỉ có `queued/sending/sent/failed/cancelled` — không có "chờ duyệt"; R1 hủy không đụng bình luận, R2 trả `previous_status`, R3 `failed`+`send_failed` |
| `send.ts` `prepare` | Khóa `FOR UPDATE OF r, c`; `Row` có đủ cột cho R1–R3; `settle(..., fenceAttempts)` rào ghi; ném trong `withJob` = rollback |
| `reply-errors.ts` | `CODE_TO_KEY` là nơi duy nhất ánh xạ mã → khóa i18n `comments.reply.errors.*` |
| Stryker + pnpm | Phải khai `plugins: ['@stryker-mutator/vitest-runner']`, nếu không "no TestRunner plugins were loaded" |

## Quyết định đã chốt trong phiên
- Q-SR1 (xem `QUYET_DINH_CHO_DUYET.md`). Kiểm chứng `verifier-security` một lần — kết quả ghi ở mục cùng tên trong plan/commit.

## Còn lại (việc khác)
1. `SEND-RECHECK-WIRE`: đường tự gửi cấp `automation`/`price`/`kb`/`quota`/`message` thật từ `drafts`/`automation_settings`/`products`/`usage_counters` (bảng làn b), ghi `automation_events.gate`; trạng thái "xác nhận giá mới" cho `ask_confirm` ở hộp soạn.
2. `SEND-RATE-LIMIT`: bộ đếm theo Page → truyền `rate` vào `recheckInputFromRow`.
3. `MUTATION-STRYKER`: thêm `src/decide`, job CI.

## Lệnh test liên quan
```
pnpm --filter @flow/ai exec vitest run src/recheck
pnpm --filter @flow/ai test:coverage
pnpm --filter @flow/ai test:mutation
pnpm --filter @flow/worker exec vitest run src/jobs/send-recheck-input.test.ts
pnpm --filter @flow/web exec vitest run src/lib/reply-state.test.ts
```
