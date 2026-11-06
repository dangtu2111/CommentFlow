# Handoff `feat-emergency-stop` (claude, làn c)

**Đã làm:** module `packages/ai/src/emergency/` (quy tắc vai trò, store + bản bộ nhớ, dịch vụ Dừng/Bật lại + hủy hẹn giờ), test + property-based, tài liệu (Q-ES1, codemap, KT-ES, gap matrix, MASTER).
**Đã đọc, rút ra:** gate/recheck đã nhận cờ `emergencyStopped`; `AutoSendDelayScheduler.cancelAllForWorkspace` chỉ nhận lý do hệ thống; `cf_app` chưa ghi được `emergency_stopped_at` (0018, `WS-OWNER-COLUMNS`).
**Còn lại:** `EMERGENCY-STOP-WIRE` (migration làn b + store DB + nút topbar đợt UI + pipeline đọc `isStopped`); `AUTO-PAUSE` làm sau.
