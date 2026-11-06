# Bàn giao `feat-flags-reconnect` (agent: claude, làn a)

## Đã làm
- `packages/saas-core/src/flags/flags.ts`: LISTEN tự nối lại lùi dần 1s→60s, `start()` không ném, sự kiện `onListenEvent` (`lost`/`reconnect_failed`/`reconnected`), xóa cache khi mất và khi nối lại, `stop()` hủy hẹn giờ. Q-FR1.
- Test `flags-reconnect.test.ts` (fake timers, mã FR-117). Export kiểu `FlagsListenEvent`.
- Docs: docs/09 §10 dòng "Mất LISTEN", gap-matrix, MASTER, codemap, KT-021.

## Đã đọc và rút ra
- `flags.ts`, `flags.test.ts`: `fakeDb` không export nên test mới dựng fake riêng. `db.listen(channel,onNotify,onError)` trả hàm hủy.

## Còn lại
- Chưa có nơi dựng `createFlags` trong apps/worker: khi có, nối `onListenEvent` vào log/cảnh báo (che thông tin kết nối trong `error`).
