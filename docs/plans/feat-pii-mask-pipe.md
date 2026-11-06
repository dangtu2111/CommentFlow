# Kế hoạch `feat-pii-mask-pipe` — PII-MASK-PIPE (che SĐT/email trước LLM/Langfuse)

Mã gap matrix: `PII-MASK-PIPE` · Spec: FR-033 (`docs/05`), nguyên tắc bất biến #6 (`AGENTS.md`), FR-162 (`order_intent.phone`).

**Tóm tắt:** Trước khi văn bản khách đi tới LLM hay Langfuse (công cụ theo dõi), hệ thống phải che số điện thoại và email. Nhưng số thật vẫn cần để lưu vào "Khách tiềm năng", nên bước này trả về CẢ văn bản đã che LẪN danh sách số/email lấy từ văn bản gốc, và gọi một "nơi lưu" (interface, chưa có DB) TRƯỚC khi trả văn bản đã che. Không migration; phần ghi DB thật để làn b/nhánh nối pipeline.

## Điểm chưa rõ

Không có (quyết định đã ghi ở Q-PMP1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. `extractPii(text)` lấy đủ SĐT (chuẩn hóa về `0xxxxxxxxx`, bỏ trùng) và email (chữ thường, bỏ trùng) đúng với những gì `maskPii` che — kiểm bằng: test ví dụ + property (mọi SĐT/email sinh ngẫu nhiên đều được lấy và bị che).
2. Văn bản không có PII không đổi qua `maskAndCapture`; kết quả che không còn chứa số/email lấy được (property) và lũy đẳng — kiểm bằng: property `fast-check`.
3. `maskAndCapture` gọi `sink.save` với liên hệ gốc TRƯỚC khi trả kết quả và không gọi khi không có liên hệ — kiểm bằng: test thứ tự gọi.
4. `sink.save` lỗi → văn bản đã che vẫn trả (không bao giờ trả bản chưa che), kết quả có `saved:false` + `errorCode`, không nuốt lỗi âm thầm, không kèm PII trong thông báo — kiểm bằng: test.
5. `fillOrderIntentPhone` điền số đầu tiên vào `order_intent.phone` chỉ khi có `order_intent` và có số; không đổi gì khác — kiểm bằng: test.
6. `maskForTrace` (Langfuse) trả kiểu `MaskedText` và che cả giá trị lồng trong object/mảng — kiểm bằng: test + property.
7. Module `src/pii/*` ≥ 95% nhánh; `pnpm lint`, `typecheck`, `depcruise`, `check:plans`, `test:trace` xanh — kiểm bằng: `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

`packages/shared/src/pii.ts` + test (đã đọc), `packages/ai/src/classify/extract-result.ts` (đã đọc dòng 40–75), `packages/ai/vitest.config.ts`, `packages/ai/src/index.ts`.

## File sẽ sửa / tạo

- `packages/shared/src/pii.ts` (+test, index): thêm `extractPii` dùng chung regex với `maskPii` (một nguồn).
- `packages/ai/src/pii/mask-pipe.ts` (+test, property test): `maskAndCapture`, `ContactSink`, `fillOrderIntentPhone`, `maskForTrace`.
- `packages/ai/src/classify/extract-result.ts`: kiểu `order_intent.phone` thành `string | null` (vẫn luôn `null` khi parse).
- `packages/ai/src/index.ts`, `packages/ai/vitest.config.ts` (thêm `'src/pii/*.ts': {branches: 95}`).
- Docs: codemap, gap-matrix, MASTER, handoff, QUYET_DINH, CAN_BAN_CUNG_CAP (không cần tài nguyên ngoài → ghi "không"), KIEM_TRA_TAY.

## Migration

Không có (làn c). Lưu thật vào `leads` cần `LEADS-KANBAN` (bảng + migration làn b) — ghi vào gap matrix.

## Test viết trước

Toàn bộ tiêu chí 1–6 viết test đỏ trước (module chưa tồn tại).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/pii.test.ts` · `pnpm --filter @flow/ai exec vitest run src/pii src/classify`

## Cần kiểm chứng độc lập không?

**Có** — che PII (`verifier-security`, một lần cuối nhánh; chỉ diff + FR-033).

## Rủi ro / câu hỏi cho chủ dự án

Regex chỉ phủ di động VN + email (như hiện tại); số máy bàn, tên, địa chỉ chưa che — ghi gap `PII-MASK-EXT`.

## Đề xuất thay đổi

Không sửa `docs/01–16`.

## Complexity tracking

Không có (`fast-check` đã là phụ thuộc của `@flow/ai`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/ADR + Q-PMP1).
