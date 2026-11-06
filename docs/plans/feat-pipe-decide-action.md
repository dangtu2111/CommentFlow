# Kế hoạch `feat-pipe-decide-action` — `decideAction`: trả lời / hỏi lại / chuyển hướng / chuyển người (FR-147) + gợi ý một phần (FR-141)

## Việc

Mã gap matrix: `PIPE-DECIDE-ACTION` · Spec: FR-147, FR-141 (`docs/05`), `docs/09` §4 (bước `decideAction`), §6 mục 6 (`allow_partial`/`allow_clarify`), `docs/07` UF-2b, `docs/10` (`drafts.action`, `kb_gaps.topic`, `brand_voice.handoff_templates`, `automation_settings.allow_partial/allow_clarify`).

**Tóm tắt:** Thêm vào `packages/ai` một hàm thuần `decideAction` (không gọi LLM, không DB): từ kết quả tách thông tin (`extract`), sản phẩm đã nhận ra, danh sách ý khách hỏi (có nguồn hay không), lịch sử hỏi lại trong chuỗi và các cờ rủi ro, **code** chọn đúng một trong bốn hành động theo thang FR-147: trả lời (mọi ý có nguồn) → hỏi lại khách (thiếu thông tin phía khách: mẫu nào, size/màu, chiều cao/cân nặng, câu mơ hồ, ảnh chưa nhận ra sản phẩm; tối đa 1 câu hỏi mỗi lượt, 2 lần mỗi chuỗi) → chuyển hướng (thiếu thông tin phía shop: trả lời phần có nguồn + câu mời ib theo mẫu, gắn tag "Cần hỗ trợ thêm", ghi chủ đề cho `kb_gaps` — FR-141, AI không tự tính tổng/giảm giá/phí ship) → chuyển người (rủi ro: khiếu nại, xung đột giá, cam kết pháp lý không nguồn, mạo danh, ngôn ngữ ngoài vi/en, hỏi lại quá số lần). Bước soạn (`drafter`) nhận "tóm tắt hành động" để LLM **chỉ viết câu** cho hành động đã chọn; `handoff` không gọi LLM. Rủi ro: các quy tắc phát hiện chi tiết (lệch giá, tồn kho cũ, pháp lý, đơn hàng, giờ làm việc) thuộc việc `DA-RULES-*` — ở đây chỉ nhận cờ đầu vào; chưa nối pipeline/ghi `drafts.action`.

## Điểm chưa rõ

Không có. Tự quyết (Q-PDA1 ở `QUYET_DINH_CHO_DUYET.md`): (a) hình dạng đầu vào (sản phẩm ứng viên + trục biến thể còn thiếu; ý hỏi theo chủ đề `kb_gaps.topic` kèm `sourced`; `thread.clarifyCount/repeatCount`; `risks`) — phần phát hiện do bước trước/`DA-RULES-*` cấp; (b) ảnh mà chưa nhận ra sản phẩm → hành động `clarify` (FR-147) nhưng `needsHuman = true` (FR-143, §6 mục 6) — gợi ý câu hỏi cho nhân viên, không tự gửi; (c) `autoSendPolicy` chỉ là gợi ý cổng nào áp dụng (`allow_partial`/`allow_clarify`/`never`), cài đặt thật đọc ở AUTO-SEND-GATE; (d) đầu vào không đọc được → `handoff` lý do `input_unreadable`, không ném (như FR-032); (e) `DRAFT_PROMPT_VERSION` lên `draft@2` vì khối hệ thống thêm hướng dẫn theo hành động.

## Tiêu chí nghiệm thu

1. Mọi ý có nguồn, không thiếu thông tin phía khách → `answer`, `autoSendPolicy = standard` — kiểm bằng: `decide-action.test.ts` (FR-147).
2. Thiếu thông tin phía khách → `clarify` với đúng MỘT câu hỏi theo ưu tiên (ảnh/mẫu nào → biến thể size/màu → chiều cao/cân nặng → câu mơ hồ), có gợi ý lựa chọn; trục biến thể khách đã nói không hỏi lại; `clarifyCount ≥ 2` mà vẫn cần hỏi → `handoff` lý do `clarify_limit` — kiểm bằng: `decide-action.test.ts` (FR-147).
3. Có ý thiếu nguồn hoặc tồn kho cũ → `redirect`: `answeredTopics`/`unansweredTopics` tách đúng, `needsSupportTag = true`, `redirectTemplates` đúng khóa `handoff_templates` (`shipping`/`discount`/`order_status`/`stock_check`/`other`), chính sách `allow_partial` khi có phần trả lời được, `allow_clarify` khi không có ý `fact` nào — kiểm bằng: `decide-action.test.ts` (FR-141, FR-147).
4. Rủi ro → `handoff` bất kể các tín hiệu khác: `lang = other` (FR-159), nhãn `complaint` ở bất kỳ vị trí (FR-145), `impersonation`, `priceConflict`, `legalUnsourced`, `repeatCount ≥ 3`; `needsHuman = true`, `autoSendPolicy = never` — kiểm bằng: `decide-action.test.ts` (FR-147).
5. Đầu vào hỏng (không phải object, nhãn lạ, số âm) → `handoff` lý do `input_unreadable`, không ném — kiểm bằng: `decide-action.test.ts` (FR-147, FR-032).
6. Thuộc tính (fast-check, seed cố định): hành động luôn thuộc 4 loại; xác định; đổi thứ tự `topics`/`labels`/`candidates` không đổi hành động; có `complaint`/`other`/rủi ro → luôn `handoff`; `answer` ⇔ mọi ý có nguồn và không cần hỏi; `unansweredTopics` ⊆ ý không nguồn; tăng `clarifyCount`/`repeatCount` không bao giờ đổi `handoff` thành hành động khác; dữ liệu tùy ý không ném — kiểm bằng: `decide-action.test.ts` "property-based" (FR-147, FR-141).
7. `drafter`: `decision.action = handoff` → không gọi LLM, trả `needs_human`; `clarify`/`redirect` không cần nguồn đạt ngưỡng vẫn gọi LLM một lần; khối người dùng ghi hành động + câu hỏi/chủ đề mời; khối hệ thống (cache) có hướng dẫn "chỉ viết câu cho hành động đã chọn, không tự tính" — kiểm bằng: `drafter.test.ts`, `draft-prompt.test.ts` (FR-147, FR-141).
8. Ngưỡng coverage `packages/ai` giữ (100% dòng) + `src/decide/*.ts` ≥ 95% nhánh; cổng chung xanh — kiểm bằng: `pnpm --filter @flow/ai test:coverage`, lint, lint:i18n, typecheck, depcruise, check:plans, test:trace.

## File sẽ đọc (≤ ~8, kèm lý do)

Đã đọc: `docs/09` §4, §6 (thang + cổng 6); `docs/05` FR-141, FR-143, FR-145, FR-147–FR-160 (các cờ rủi ro); `docs/07` UF-2b; `docs/10` dòng `automation_settings`, `brand_voice`, `kb_gaps`; `packages/ai/src/{classify/extract-result.ts, confidence/confidence.ts, draft/draft-result.ts, draft/drafter.ts, draft/draft-prompt.ts, draft/fixture-drafter.ts}` (kiểu đầu vào/đầu ra để nối); `confidence.test.ts` (mẫu fast-check).

## File sẽ sửa / tạo

- Tạo `packages/ai/src/decide/decide-action.ts` (Zod đầu vào, thang FR-147, FR-141, mã lý do) + `decide-action.test.ts` (TDD + property-based).
- Sửa `packages/ai/src/draft/draft-prompt.ts` (`DraftInput.decision`, khối hướng dẫn theo hành động, `draft@2`), `drafter.ts` (`handoff` không gọi LLM; `clarify`/`redirect` không bắt buộc nguồn), `draft-prompt.test.ts`, `drafter.test.ts`, `packages/ai/tests/ai-usage.int.test.ts` (chuỗi `draft@1` → `DRAFT_PROMPT_VERSION`), `packages/ai/src/index.ts` (xuất), `packages/ai/vitest.config.ts` (ngưỡng nhánh theo file), `docs/testing/KIEM_TRA_TAY.md` (KT-DA), `docs/plans/{MASTER,QUYET_DINH_CHO_DUYET}.md`, `docs/gap-matrix.md`, `docs/codemap.md`, `docs/handoff/feat-pipe-decide-action.md`.

## Migration

Không có (cột `drafts.action` đã có trong `docs/10`; ghi khi nối pipeline; làn c không thêm migration).

## Test viết trước

`decide-action.test.ts` viết trước, chạy đỏ (module chưa có) rồi mới viết mã (`decideAction` là logic quy tắc §4 STANDARD). Phần `drafter`: thêm test đỏ trước khi sửa.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/decide src/draft` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Có — một lần `verifier-security` (`decideAction` quyết định hành động đầu vào cổng tự gửi §6 mục 6 và `needsHuman`; kiểm "code quyết định, không có đường để JSON AI đổi hành động", rủi ro luôn thắng, giới hạn hỏi lại).

## Rủi ro / câu hỏi cho chủ dự án

Không cần tài nguyên ngoài, không gọi LLM thật (drafter dùng LLM giả trong test). Các quy tắc phát hiện lệch giá/tồn kho cũ/pháp lý/đơn hàng/giờ làm việc là việc `DA-RULES-*` (chỉ nhận cờ ở đây).

## Đề xuất thay đổi

Không đổi `docs/01–16` (FR-143 và FR-147 được dung hòa theo Q-PDA1(b), không sửa chữ spec).

## Complexity tracking

Không có (không thêm thư viện: `fast-check`, `zod` đã có; không thêm tầng trừu tượng).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong FR-147/FR-141/§6 + Q-PDA1).
