# Kế hoạch `fix/rewrite-no-post` — viết lại câu hỏi không thêm "bài này" khi lượt không có bài viết

## Việc

Mã gap matrix: `PIPE-REWRITE` (FR-137) · lệnh chủ dự án 11/11/2026.

**Tóm tắt (2–3 câu dễ hiểu):** Bước viết lại câu hỏi bằng LLM đôi khi tự thêm "in this post / bài này" dù khách chưa nhắc bài viết nào (mẫu EVAL en-06: "Do you ship to Canada?" thành "…the product shown in this post to Canada?"), làm tìm kiếm lệch và AI từ chối oan. Sửa hai lớp: lời nhắc dặn không thêm ngữ cảnh bài khi không có caption/sản phẩm gắn bài, và code bỏ cụm đó khỏi câu tìm kiếm khi lượt không có bài viết. Rủi ro thấp: chỉ ảnh hưởng câu tìm kiếm; không chạm guard.

## Điểm chưa chốt

Không có.

## Tiêu chí nghiệm thu

1. Không có caption và không có sản phẩm gắn bài: câu LLM "…shown in this post to Canada?" → "Do you ship the product to Canada?" (hồi quy en-06) — `rewriter.test.ts`.
2. Có caption hoặc sản phẩm gắn bài → giữ nguyên câu LLM.
3. Prompt có dòng dặn không thêm ngữ cảnh bài; `prompt_version` = `rewrite@2`.

## File sẽ đọc / sửa

Sửa: `packages/ai/src/rewrite/{rewriter,rewrite-prompt}.ts`, `rewriter.test.ts`.

## Migration

Không.

## Test viết trước

Có.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/rewrite`.

## Cần kiểm chứng độc lập không?

Không: không chạm guard/cổng tự gửi/RLS. Tự merge được sau khi #321 vào main (theo lệnh) và CI xanh.

## Rủi ro / câu hỏi cho chủ dự án

Không. Câu viết lại đã đổi cách diễn đạt có thể làm một số mẫu EVAL đổi nhẹ; sẽ thấy ở lần đo kế tiếp.
