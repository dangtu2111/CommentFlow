# Handoff `feat-autosend-lang-partial` (claude, làn d)

## Đã làm
- `packages/ai/src/gate/lang-autosend.ts`: `resolveReplyLang`, `resolveLangLevel`, `resolveLangSettings`, `decideAutoSendByLang` bọc `decideAutoSend` (chỉ chặn thêm). Test + property-based cùng thư mục. Q-ALP1.
- Hỏi lại/chuyển hướng (FR-147) dùng cổng gốc (`allow_clarify`/`allow_partial`); thêm test vi/en.

## Đã đọc + điều rút ra
- `auto-send-gate.ts`: cổng 6 đã xử lý `allow_clarify`/`allow_partial`/`handoff`; `levels.channelLabel` + `settings.threshold/dailyCap` là chỗ lớp ngôn ngữ ghi đè.
- `automation/settings.ts`: cấu hình chưa có chiều ngôn ngữ (`rules` chỉ kênh × đối tượng × nhãn).

## Còn lại (làn b / nối pipeline)
- Migration cột `automation_settings.lang` + ghi đè ngưỡng/giới hạn theo ngôn ngữ (docs/10).
- Nạp `channels.reply_language`, `drafts.lang`, danh sách ngôn ngữ đã đạt bộ đánh giá, đếm tự gửi/ngày theo (kênh, nhãn, ngôn ngữ); gọi `decideAutoSendByLang` thay `decideAutoSend` ở pipeline.
- UI Tự động hóa: cột/bộ lọc theo ngôn ngữ (docs/08 §…).
