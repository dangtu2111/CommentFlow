# Kế hoạch `feat-da-rules-legal` — Cam kết pháp lý/uy tín bắt buộc có nguồn

## Việc

Mã gap matrix: `DA-RULES-LEGAL` · Spec: docs/05 FR-160; docs/09 §4 (`decideAction`, cờ `risks.legalUnsourced`); docs/14 §4 (nhóm câu đánh giá FR-160).

**Tóm tắt:** Khi khách hỏi "hàng chính hãng không", "có xuất hóa đơn VAT không", "bảo hành bao lâu", "nguồn gốc", "hoàn tiền" mà kho kiến thức không có đoạn nào nói về điều đó, hệ thống không được để AI khẳng định bừa — phải chuyển người. Làm hai hàm thuần (không gọi AI, không đọc DB): một hàm đọc câu khách + nguồn để dựng cờ `legalUnsourced` cho `decideAction`; một hàm kiểm bản nháp AI (nháp nhắc cam kết pháp lý/uy tín mà không có nguồn, hoặc nêu thời hạn không có trong nguồn → chặn). Rủi ro: so khớp theo từ khóa nên có thể chặn thừa (an toàn hơn bỏ sót).

## Điểm chưa rõ

Không có (tự chọn, ghi Q-DRL1 ở `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Nhận ra 5 nhóm (chính hãng, hóa đơn/VAT, bảo hành, nguồn gốc, hoàn tiền) có/không dấu, hoa/thường, tiếng Anh cơ bản; "vật liệu" không bị nhận nhầm là VAT — kiểm bằng `legal-rules.test.ts` (FR-160).
2. Khách hỏi nhóm nào mà không nguồn nào nhắc nhóm đó → `legalUnsourced=true`; đủ nguồn từng nhóm → `false`; nguồn nói nhóm khác không "mở" nhóm này — test ví dụ + property-based.
3. Đầu vào hỏng → `legalUnsourced=true` (đóng khi lỗi), không ném — test.
4. Bản nháp nhắc nhóm pháp lý không có nguồn → `ok=false` kèm nhóm vi phạm; thời hạn "12 tháng/7 ngày" trong nháp phải có trong nguồn cùng nhóm — test.
5. Cờ nối được vào `decideAction`: `risks.legalUnsourced=true` → `handoff`/`legal_unsourced` — test.
6. Module `decide/legal-rules.ts` phủ nhánh ≥ 95% — `pnpm --filter @flow/ai test:coverage`.
7. Không migration, không đụng DB — `git diff --stat`.

## File sẽ đọc

`decide/decide-action.ts` (đã đọc: cờ `risks`, `legal_unsourced`), `decide/stock-rules.ts` (mẫu), `rules/price-rules.ts` (mẫu), `shared/products.ts` (`foldText`), `docs/codemap.md`, `docs/gap-matrix.md`, `MASTER.md`.

## File sẽ sửa / tạo

- Tạo `packages/ai/src/decide/legal-rules.ts` + `legal-rules.test.ts`
- Sửa `packages/ai/src/index.ts` (export), `docs/codemap.md` (dòng riêng), `docs/gap-matrix.md`, `docs/plans/MASTER.md`, `docs/plans/QUYET_DINH_CHO_DUYET.md`, `docs/testing/KIEM_TRA_TAY.md`, handoff.

## Migration

Không có. Nối vào pipeline thật (đọc đoạn nguồn, ghi `kb_gaps`) → gap `DA-RULES-LEGAL-WIRE`.

## Test viết trước

`legal-rules.test.ts`: ví dụ theo nhóm, ranh giới (không dấu, "vật liệu"), nguồn thiếu/đủ, đầu vào hỏng, nháp + thời hạn, tích hợp `decideAction`, property-based (fast-check): không ném với mọi đầu vào; không nguồn ⇒ chặn khi có hỏi; thêm nguồn không liên quan không bao giờ gỡ cờ; nguồn đủ từ khóa thì gỡ.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/decide/legal-rules.test.ts` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (chạm cổng quyết định trả lời/tự gửi: chặn khẳng định pháp lý không nguồn).

## Rủi ro / câu hỏi cho chủ dự án

Từ khóa là heuristic; bộ đánh giá AI (GĐ2) sẽ bổ sung câu mẫu. Nguồn nói "không bảo hành" vẫn tính là có nguồn (là một khẳng định có căn cứ).

## Đề xuất thay đổi

Không.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong FR-160/docs/09; chi tiết Q-DRL1).
