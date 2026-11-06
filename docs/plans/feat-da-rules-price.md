# Kế hoạch `feat-da-rules-price` — Quy tắc giá của decideAction (xung đột giá + khoảng giá)

## Việc

Mã gap matrix: `DA-RULES-PRICE` · Spec: FR-150, FR-158 (`docs/05`), US-108 (`docs/04`), `docs/09` §4 (`decideAction`), `docs/10` (`post_price_mentions`).

**Tóm tắt:** Thêm vào `packages/ai` các hàm thuần (không LLM, không DB) để (a) so số tiền trong caption bài/quảng cáo với giá kho và so giá khách nhắc với giá hiện tại — lệch thì bật cờ `risks.priceConflict` để `decideAction` chuyển người, kèm hai con số cho cảnh báo Owner; (b) tính khoảng giá "từ X đến Y" khi biến thể khác giá mà khách chưa nói size/màu, kèm trục cần hỏi lại. Rủi ro: nhận diện số tiền theo mẫu có thể báo nhầm (caption nhắc phí ship) — thiên về chuyển người, an toàn. Phần lưu `post_price_mentions` cần migration (làn b) nên chưa làm.

## Điểm chưa rõ

Không có. Tự quyết (Q-DRP1 ở `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Rút số tiền từ văn bản (150k ≡ 150.000đ), duy nhất + tăng dần, bỏ %/SĐT/số trần — kiểm bằng: `price-rules.test.ts` (FR-150).
2. Caption lệch giá kho → `conflict` kèm giá kho gần nhất; khớp → `matches`; không có số → `no_amount`; kho chưa có giá → `not_comparable` (không tự kết luận) — kiểm bằng: `price-rules.test.ts` (FR-150a).
3. Khách nhắc giá khác giá kho → `conflict`; đúng giá → `matches` — kiểm bằng: `price-rules.test.ts` (FR-150b).
4. `evaluatePriceRisk`: caption xung đột → `priceConflict` + `ownerAlert` hai con số; khách nhắc → chuyển người, không cảnh báo Owner; cờ cấp cho `decideAction` → `handoff` lý do `price_conflict` — kiểm bằng: `price-rules.test.ts` (FR-150, US-108).
5. `buildPriceQuote`: cùng giá → `single`; khác giá + chưa nói biến thể → `range` min/max + `missingAxes`; đã nói biến thể → chỉ xét biến thể đó; biến thể lạ/giá hỏng → `none`; `missingAxes` cấp cho `decideAction` → `clarify` `variant_missing` — kiểm bằng: `price-rules.test.ts` (FR-158).
6. Thuộc tính (fast-check, seed cố định): caption = đúng giá kho → không xung đột; xung đột ⇔ có số ngoài tập kho, bất biến thứ tự; min ≤ max, mọi giá trong khoảng; không ném với đầu vào bất kỳ — kiểm bằng: `price-rules.test.ts`.
7. Coverage `packages/ai` giữ ngưỡng; `src/rules/*.ts` ≥ 95% nhánh (thêm vào config) — kiểm bằng: `pnpm --filter @flow/ai test:coverage`; lint, typecheck, depcruise, check:plans, test:trace xanh.

## File sẽ đọc (≤ ~8, kèm lý do)

Đã đọc: `docs/05` FR-150/158, `docs/04` US-108, `docs/09` §4; `packages/ai/src/decide/decide-action.ts` (cờ `risks.priceConflict`, `missingAxes`), `guard-money.ts` (`extractClaims`), `vitest.config.ts`, `index.ts`.

## File sẽ sửa / tạo

- Tạo `packages/ai/src/rules/price-rules.ts` + `price-rules.test.ts` (logic thuần + TDD + property-based).
- Sửa `packages/ai/src/index.ts` (export), `packages/ai/vitest.config.ts` (ngưỡng `src/rules/*.ts`).
- Docs: `QUYET_DINH_CHO_DUYET.md`, `KIEM_TRA_TAY.md`, `gap-matrix.md`, `MASTER.md`, `codemap.md`, handoff.

## Migration

Không có. `post_price_mentions` (docs/10 §3) cần migration → làn b; ghi gap `DA-RULES-PRICE-DB`.

## Test viết trước

Toàn bộ `price-rules.test.ts` viết và chạy đỏ (thiếu module) trước khi viết `price-rules.ts`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/rules` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Có — một lần `verifier-security` (cờ chuyển người liên quan cổng tự gửi / nguyên tắc #4); đầu vào: diff + FR-150/158.

## Rủi ro / câu hỏi cho chủ dự án

Báo nhầm xung đột khi caption nhắc số tiền không phải giá bán (phí ship, ngưỡng freeship) → chuyển người thêm; chấp nhận, Owner xem hai con số.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có (không thêm thư viện; `fast-check` đã có ở `packages/ai`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/Q-DRP1).
