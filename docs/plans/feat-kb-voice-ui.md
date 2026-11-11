# Kế hoạch `feat/kb-voice-ui` — dựng giao diện Giọng văn (kb-voice)

## Việc

Mã gap matrix: UI KB (Phần 4a). Yêu cầu chủ dự án 11/11/2026: "làm hết các màn stitch đã có cho cơ sở tri thức".

**Tóm tắt (2–3 câu dễ hiểu):** Trang `/app/kb/voice` chia biểu mẫu thành ba khối đánh số theo `design/stitch/kb-voice.html`: Khối 01 cặp xưng hô, Khối 02 sắc thái (mô tả giọng điệu), Khối 03 lời chào/kết. Các ô lưu thật và nhãn giữ nguyên. Điều khiển thiết kế chưa có chỗ lưu (độ dài phản hồi, mức emoji) hiện là ô tắt kèm "Sắp có"; persona mẫu, điểm nhất quán, bảng emoji không dựng vì không có dữ liệu thật.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. Lưu giọng văn theo từng ngôn ngữ như cũ (E2E `kb-content` giọng văn xanh).
2. Không tràn ngang ở 1440/390.
3. typecheck, `lint:i18n`, biome xanh; `ui:fidelity kb-voice`: lệch 13/45 (nền 13/45, giữ nguyên vì khung ngoài không đổi).

## File sẽ đọc / sửa

Thêm `components/kb/voice-ui.tsx`. Sửa `app/app/(guarded)/kb/voice/page.tsx`, i18n `vi/en` (`kbContent.voice.blocks.*`). Ảnh sau ở `docs/plans/ui-fidelity/kb-voice/`.

## Migration

Không.

## Test viết trước

Không áp dụng (trình bày; hành vi giữ nguyên, đã có E2E).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/web typecheck && pnpm lint:i18n`; E2E ở CI.

## Cần kiểm chứng độc lập không?

Không.

## Rủi ro / câu hỏi cho chủ dự án

Đủ thành phần chữ 5,1%: phần lớn chữ thiết kế là dữ liệu/tính năng chưa có. Muốn lưu độ dài/emoji/persona cần cột mới (migration) — chưa làm.
