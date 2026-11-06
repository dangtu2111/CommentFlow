# Kế hoạch `feat-pipe-normalize-lang` — Chuẩn hóa văn bản + nhận diện ngôn ngữ (PIPE-NORMALIZE-LANG)

## Việc

Mã gap matrix: `PIPE-NORMALIZE-LANG` (FR-025, FR-120, FR-159) · Spec: `docs/05` FR-025/120/159, `docs/09` §5 (quy tắc 0–5).

**Tóm tắt:** Thêm hàm thuần `normalizeAndDetectLang` vào `packages/ai`: chuẩn hóa chữ (Unicode NFC, viết thường, mở rộng viết tắt bằng từ điển truyền vào qua interface — bảng `abbreviations` do làn b làm) và nhận ngôn ngữ `vi`/`en`/`other` theo thứ tự quy tắc §5. Chữ viết lạ (Hán, Thái, Hàn, Nga…) → `other` (chuyển người). Không gọi dịch vụ ngoài; bộ nhận diện (lingua) cắm qua interface, mặc định là heuristic từ khóa. Rủi ro: heuristic mặc định thô cho câu ngắn không dấu → rơi về ngôn ngữ trước/mặc định (đúng §5 quy tắc 4).

## Điểm chưa rõ

Không có. Lựa chọn tự chốt: Q-PNL1 trong `QUYET_DINH_CHO_DUYET.md`.

## Tiêu chí nghiệm thu

1. NFC + viết thường + gộp khoảng trắng; chạy lại không đổi (idempotent) — kiểm bằng: test đơn vị + property-based (fast-check) FR-025.
2. Viết tắt trong từ điển (đã chuẩn hóa NFC/thường, bỏ dấu câu hai đầu từ) được mở rộng, dấu câu giữ nguyên; không từ điển → không đổi — kiểm bằng: test đơn vị FR-025.
3. Ký tự chữ khác Latin (Hán, Thái, Hangul, Kana, Cyrillic…) → `other`, mọi trường hợp (property-based); detector đầy đủ trả `other` độ tin cậy ≥ 0,9 → `other` — kiểm bằng: test FR-159.
4. Quy tắc 1–5 theo thứ tự: dấu tiếng Việt → vi; trúng từ điển viết tắt → vi; detector {vi,en} đủ tin → dùng; câu ≤ 3 từ/không chắc → ngôn ngữ trước, rồi `reply_language`, rồi `vi`; trộn → đa số từ, hòa → vi — kiểm bằng: test FR-120 / §5.
5. Hàm không ném lỗi với mọi chuỗi; kết quả `lang ∈ {vi,en,other}` — kiểm bằng: property-based.
6. Không đổi ngưỡng coverage `packages/ai` — kiểm bằng: `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

`docs/05` FR-025/120/159, `docs/09` §5, `packages/ai/src/index.ts`, `packages/ai/vitest.config.ts`, `confidence.test.ts` (kiểu test + fast-check) — đã đọc.

## File sẽ sửa / tạo

- `packages/ai/src/normalize/normalize-lang.ts` + `normalize-lang.test.ts` (mới).
- `packages/ai/src/index.ts`: xuất API.
- Docs: `QUYET_DINH_CHO_DUYET.md`, `gap-matrix.md`, `MASTER.md`, `codemap.md`, `CAN_BAN_CUNG_CAP.md`, `testing/KIEM_TRA_TAY.md`, `docs/handoff/feat-pipe-normalize-lang.md`.

## Migration

Không có (bảng `abbreviations` thuộc ABBREV-DICT, làn b; ở đây chỉ interface `AbbreviationDict`).

## Test viết trước

`normalize-lang.test.ts` viết và chạy đỏ (module chưa có) trước khi viết mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/normalize/normalize-lang.test.ts` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Không (hàm thuần, không chạm auth/RLS/cổng tự gửi/PII; che PII là PII-MASK-PIPE).

## Rủi ro / câu hỏi cho chủ dự án

Chưa nối vào pipeline (job `process`) và chưa có lingua thật (cần thêm thư viện + giấy phép — để việc riêng). Cần ABBREV-DICT để có dữ liệu từ điển.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có (không thư viện mới; `fast-check` đã có trong `packages/ai`). Interface `LangDetector`/`AbbreviationDict` có ≥ 2 bên dùng (heuristic mặc định + lingua/mock; từ điển hệ thống + workspace) — thuộc ngoại lệ connector/saas-core.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ghi ở QUYET_DINH_CHO_DUYET.md; không còn thẻ chưa rõ).
