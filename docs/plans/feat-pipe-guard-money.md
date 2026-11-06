# Kế hoạch `feat-pipe-guard-money` — Guard số tiền/%/ngày/SĐT/link (PIPE-GUARD-MONEY)

## Việc

Mã gap matrix: `PIPE-GUARD-MONEY` · Spec: `docs/05` FR-030, `docs/09` §4 (bước `guard`) + §6 mục 6, `docs/testing/STANDARD.md` §4–5.

**Tóm tắt:** Thêm một hàm thuần (không gọi LLM, không DB) kiểm câu AI soạn: mọi số tiền, %, ngày, SĐT, email, link xuất hiện trong câu phải có trong văn bản nguồn đã trích (hoặc trong bảng giá đọc từ DB). Có số "lạ" → trả danh sách vi phạm để bước sau (PIPE-CONFIDENCE/`decideAction`) ép "cần người" và không tự gửi. Rủi ro: quá chặt thì nhiều câu chuyển người (chọn an toàn); quá lỏng thì lọt giá bịa — nên có test theo thuộc tính (fast-check).

## Điểm chưa rõ

Không có. Các lựa chọn tự chốt ghi ở `QUYET_DINH_CHO_DUYET.md` (Q-PGM1).

## Tiêu chí nghiệm thu

1. Số tiền trong câu (`150.000đ`, `150k`, `1,5 triệu`, `2tr5`, `100-150k`, `1.500.000`) quy về đồng và khớp nguồn bất kể cách viết; không có trong nguồn → vi phạm `money` — kiểm bằng: test đơn vị + property FR-030.
2. Tổng tiền AI tự tính (ví dụ 2 × 150k = 300k) không có trong nguồn bị bắt — kiểm bằng: test ví dụ.
3. %, ngày (`15/11`, `ngày 15 tháng 11 năm 2026`, `tháng 11`), SĐT (`0912 345 678`, `+84…`, hotline 1900), email, link (có/không `https://www`, dấu câu cuối) so khớp theo dạng chuẩn hóa — kiểm bằng: test đơn vị từng loại.
4. Số không phải tiền (size 38, "2 cái", giờ 10:30) không bị coi là vi phạm — kiểm bằng: test ví dụ.
5. Property: (a) văn bản chứa số tiền X mà nguồn không có X → luôn có vi phạm; nguồn chứa X → không vi phạm; (b) câu không có số/link → `ok`; (c) SĐT dạng bất kỳ không có trong nguồn luôn bị bắt — kiểm bằng: fast-check.
6. Vi phạm không chứa SĐT/email thô (che PII) — kiểm bằng: test.
7. `guard-money.ts` ≥ 95% nhánh; ngưỡng gói `packages/ai` không hạ — kiểm bằng: `pnpm --filter @flow/ai test:coverage`.

## File sẽ đọc

`packages/shared/src/pii.ts` (regex SĐT, `maskPii`), `packages/ai/vitest.config.ts`, `packages/ai/src/index.ts`, `docs/09` §4 bước guard — đã đọc.

## File sẽ sửa / tạo

- `packages/ai/src/guard-money.ts` (mới): `extractClaims`, `checkGuardMoney`.
- `packages/ai/src/guard-money.test.ts` (mới): ví dụ + ca biên + fast-check.
- `packages/ai/src/index.ts`: xuất API mới. `packages/ai/vitest.config.ts`: ngưỡng ≥95% nhánh cho file mới. `packages/ai/package.json` + `pnpm-lock.yaml`: devDependency `fast-check`.
- Docs: `docs/plans/QUYET_DINH_CHO_DUYET.md`, `gap-matrix.md`, `MASTER.md`, `codemap.md`, `CAN_BAN_CUNG_CAP.md` (không cần tài nguyên → ghi "không có"), `testing/KIEM_TRA_TAY.md`, `docs/handoff/feat-pipe-guard-money.md`.

## Migration

Không có.

## Test viết trước

Toàn bộ `guard-money.test.ts` viết và chạy đỏ (module chưa có) trước khi viết `guard-money.ts`.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/guard-money.test.ts` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (cổng an toàn số tiền/SĐT/link, che PII trong vi phạm).

## Rủi ro / câu hỏi cho chủ dự án

PIPE-DRAFT chưa làm → hàm chưa được nối vào pipeline; nối khi PIPE-DRAFT/PIPE-CONFIDENCE có (ghi gap matrix). Không cần tài nguyên ngoài, không gọi LLM.

## Đề xuất thay đổi

Không có.

## Complexity tracking

- Thêm `fast-check` 4.10.2 (MIT) vào `packages/ai` (devDependency): STANDARD §5 yêu cầu property-based cho guard; đã dùng ở `apps/web`, `packages/connectors` cùng phiên bản. Phương án loại: tự viết bộ sinh ngẫu nhiên — kém tái hiện.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định có trong spec FR-030/`docs/09`; chọn lựa nhỏ ghi Q-PGM1). Không có bảng mới.
