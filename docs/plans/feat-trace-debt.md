# Kế hoạch `feat-trace-debt` — xóa nợ truy vết FR

Mã gap matrix: `TRACE-DEBT` · Spec: `docs/testing/STANDARD.md` §2.

**Tóm tắt:** Baseline còn 6 mã FR (002, 003, 004, 034, 117, 118) của dòng đã Xong nhưng chưa có test mang mã trong tiêu đề. Các test kiểm đúng hành vi đó đã tồn tại nên chỉ gắn mã vào tiêu đề `describe`/`it`; FR-118 gắn vào test ranh giới `saas-core` (không import sản phẩm). Không đổi hành vi; baseline về rỗng vì đã có test thật, không phải vì sửa che.

**Trạng thái duyệt:** Đã duyệt (tự duyệt — không quyết định mới).

## Điểm chưa rõ

Không có.

## Tiêu chí nghiệm thu

1. `trace-baseline.json` rỗng và `pnpm test:trace` đạt — kiểm bằng: `pnpm test:trace`.
2. Test đã đổi tên vẫn xanh — kiểm bằng: vitest từng gói (ai, saas-core, tools/boundaries).

## File sẽ đọc

`docs/testing/STANDARD.md`, `docs/testing/trace-baseline.json`, tiêu đề test liên quan.

## File sẽ sửa / tạo

Tiêu đề test trong `packages/db/tests/{actor-rls,invitations}.int.test.ts`, `packages/ai/src/llm-client.test.ts`, `packages/saas-core/src/flags/{flags,evaluate}.test.ts`, `tools/boundaries/rules.test.ts`; `docs/testing/trace-baseline.json`; `docs/plans/MASTER.md`; plan này.

## Migration

Không có.

## Test viết trước

Không có logic mới; chỉ đổi tiêu đề.

## Lệnh test phạm vi hẹp

`pnpm test:trace`; `pnpm --filter @flow/ai exec vitest run src/llm-client.test.ts`; `pnpm --filter @flow/saas-core exec vitest run src/flags`; `pnpm --filter ./tools/boundaries test`.

## Cần kiểm chứng độc lập không?

Không (chỉ đổi tên test).

## Rủi ro / câu hỏi cho chủ dự án

Test `*.int.test.ts` (DB) đổi tên chưa chạy ở làn c; CI job `database` sẽ chạy.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
