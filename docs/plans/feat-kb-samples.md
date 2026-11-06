# Kế hoạch `feat-kb-samples` — Câu mẫu của shop (đã che PII)

## Việc

Mã gap matrix: `KB-SAMPLES` · Spec: `docs/05` FR-132, `docs/10` §3 (`kb_answer_examples`) + §5.4.

**Tóm tắt:** Khi nhân viên gửi câu trả lời (giữ nguyên bản AI soạn hoặc đã sửa), hệ thống biến câu đó thành "mẫu giọng văn": che SĐT/email, thay số tiền/tồn kho bằng chỗ trống (`{price:<id biến thể>}`, `{stock:<id>}`) để không lộ giá cũ. Khi soạn, lấy 2–3 mẫu gần nhất cùng nhãn + ngôn ngữ làm ví dụ, điền lại giá/tồn hiện tại. Owner tắt được từng mẫu. Bảng `kb_answer_examples` chưa có (cần migration — chỉ làn b) nên làm LÕI thuần + kho giả trong bộ nhớ sau interface; rủi ro chính: lọt PII/giá cũ vào mẫu → bị chặn bằng từ chối mẫu khi còn dữ kiện không thay được.

## Điểm chưa rõ

Không có (mọi quyết định ghi ở Q-KSM1).

## Tiêu chí nghiệm thu

1. Câu có SĐT/email → bị che (`[sđt]`/`[email]`); SĐT/email/link còn sót sau che → từ chối mẫu — kiểm bằng `example-template.test.ts`.
2. Số tiền khớp giá một biến thể → `{price:<id>}`; không khớp biến thể nào (hoặc khoảng giá) → từ chối — test cùng file.
3. Số tồn kho khớp một biến thể → `{stock:<id>}`; không khớp → từ chối; ngày/phần trăm → từ chối (dễ cũ) — test.
4. Điền lại bằng giá/tồn HIỆN TẠI; biến thể đã mất → mẫu bị bỏ (docs/10 §5.4) — test `fillExampleTemplate`.
5. Chỉ nhận nguồn `staff_verbatim`/`staff_edited`; AI tự gửi bị từ chối — test `captureAnswerExample`.
6. Lấy tối đa 3 mẫu `active`, đúng workspace/nhãn/ngôn ngữ, kênh trùng hoặc `null`, mới nhất trước; mẫu tắt không được lấy; thiếu thì lùi sang mẫu kế — test `pickVoiceExamples`.
7. Trần 2.000 mẫu/workspace: vượt thì bỏ mẫu ít dùng + cũ nhất, giữ mẫu mới — test.
8. Cách ly workspace: kho không trả/đổi mẫu của workspace khác — test `example-store.test.ts`.

## File sẽ đọc (đã đọc)

`guard-money.ts` (`extractClaims`), `shared/src/pii.ts` (`maskPii`), `ai/src/pii/mask-pipe.ts`, `vitest.config.ts` (ngưỡng), `docs/10` §3/§5.4.

## File sẽ sửa / tạo

- `packages/ai/src/examples/example-template.ts` (+test): che PII, thay giá/tồn bằng placeholder, điền lại.
- `packages/ai/src/examples/example-store.ts` (+test): kiểu `AnswerExample`, interface `ExampleStore`, kho giả trong bộ nhớ (fixture).
- `packages/ai/src/examples/answer-examples.ts` (+test): `captureAnswerExample`, `pickVoiceExamples`, `setExampleStatus`.
- `packages/ai/src/index.ts`, `packages/ai/vitest.config.ts` (thêm glob 95% nhánh `src/examples/*.ts`).
- docs: `codemap.md`, `gap-matrix.md`, `plans/MASTER.md`, `QUYET_DINH_CHO_DUYET.md`, `CAN_BAN_CUNG_CAP.md`, `testing/KIEM_TRA_TAY.md`, `handoff/feat-kb-samples.md`.

## Migration

Không có (làn d). Phần còn lại ghi gap matrix `KB-SAMPLES-PERSIST`: bảng `kb_answer_examples` + RLS (ghi theo vai trò Owner qua `withActor`), nối `ExampleStore` thật, embedding, API `/kb/examples`, giao diện Owner.

## Test viết trước

Toàn bộ logic ở trên (che PII, placeholder, điền lại, chọn mẫu, trần) — viết test đỏ trước, kèm property test (`fast-check`, đã cài): mẫu tạo ra không chứa SĐT/email thô.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/examples` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Có — chạm che PII (`verifier-security` một lần, chỉ gửi diff + FR-132).

## Rủi ro / câu hỏi cho chủ dự án

Hai biến thể cùng giá: placeholder gắn biến thể đầu danh sách; nếu giá đổi riêng biến thể đó, câu có thể sai biến thể — chấp nhận vì còn guard số tiền ở bước soạn.

## Đề xuất thay đổi

Không đổi docs/01–16 (không cần).

## Complexity tracking

Interface `ExampleStore` khi mới có 1 bản (kho giả): vi phạm "≥ 2 nơi dùng" nhưng thuộc ngoại lệ tài nguyên ngoài/DB chưa có (AGENTS § Tài nguyên ngoài); bản DB thật sẽ là nơi dùng thứ hai.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec/Q-KSM1).
