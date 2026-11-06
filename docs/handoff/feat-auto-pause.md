# Handoff `feat-auto-pause` (claude, làn c)

**Đã làm:** module `packages/ai/src/autopause/` (`evaluateAutoPause` thuần, store + bản bộ nhớ, dịch vụ `apply`/`resume`/`isPaused`), test + property-based, tài liệu (Q-AP1, codemap, KT-AP, gap matrix, MASTER).
**Đã đọc, rút ra:** `evaluateMarkedWrongSignal` tái dùng được; scheduler đã nhận lý do `ai_paused`; `sendRecheck` có `aiPaused`; docs/09 §11.2 quy định spike chỉ cảnh báo, 368 chỉ khóa kênh.
**Còn lại:** `AUTO-PAUSE-WIRE` (migration làn b, job `abuse`, banner, nối `isPaused` vào pipeline, khóa kênh qua `channels.send_suspended_until`).
