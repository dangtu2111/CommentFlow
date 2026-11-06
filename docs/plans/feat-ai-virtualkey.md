# Kế hoạch `feat-ai-virtualkey` — AI-VIRTUALKEY (khóa ảo LiteLLM theo workspace)

Mã gap matrix: `AI-VIRTUALKEY` · Spec: FR-034, NFR-C3 (docs/06), docs/12 §LiteLLM ("1 key / workspace, `max_budget` theo tháng = trần chi phí AI"), docs/13 §4 (khóa luôn chứa `workspace_id`).

**Tóm tắt:** Hiện mọi workspace dùng chung một khóa LiteLLM, nên một shop có thể ăn hết ngân sách của cả hệ thống. Việc này thêm module `virtual-key` trong `@flow/ai`: mỗi workspace có khóa ảo riêng (LiteLLM "virtual key" = khóa con có ngân sách riêng) với `max_budget` lấy từ cùng trần `ai_cost_cap_usd` mà cổng chi phí đang dùng. Làm sau interface + mock, cờ mặc định TẮT; chưa gọi LiteLLM thật, chưa có giao diện, không migration (lưu khóa bền vào DB cần migration → làn b, ghi gap matrix).

## Điểm chưa rõ

Không có (các lựa chọn tự chọn ghi ở `docs/plans/quyet-dinh/qavk1.md`).

## Tiêu chí nghiệm thu

1. Cờ `LITELLM_VIRTUAL_KEYS_ENABLED` chỉ bật khi đúng chữ `true`; tắt → `resolveKey` trả khóa dùng chung, không gọi admin/store — test đơn vị.
2. Bật → mỗi workspace có khóa riêng, khác khóa dùng chung; alias chứa `workspace_id` (chữ thường); hai workspace không bao giờ chung khóa — test + property-based.
3. `max_budget` = trần `ai_cost_cap_usd` (đọc qua `CostLedger`); trần đổi → khóa được cập nhật; chưa đặt trần → dùng ngân sách mặc định cấu hình — test.
4. Gọi đồng thời nhiều lần cho cùng workspace chỉ tạo MỘT khóa (single-flight) — test đua.
5. Lỗi admin/store/ledger → ném `AppError` (đóng khi không chắc), KHÔNG rơi về khóa dùng chung; thông báo lỗi không chứa khóa — test.
6. Client HTTP LiteLLM gọi đúng `/key/generate`, `/key/update`, `/key/delete` bằng master key (chỉ ở admin), thân yêu cầu đúng, lỗi không lộ khóa — test với `fetchImpl` giả.
7. `createVirtualKeyLlmCaller` dùng đúng khóa của workspace khi gọi LLM và ghép được với `createCostGatedLlmClient` — test.
8. `pnpm --filter @flow/ai test:coverage` không hạ ngưỡng; lint, typecheck, depcruise, check:plans, precheck xanh.

## File sẽ đọc

`llm-client.ts`, `cost-gate/{ledger,gated-llm-client,index}.ts`, `cache/semantic-cache.ts` (mẫu cờ), docs/gap-matrix + MASTER (đã đọc).

## File sẽ sửa / tạo

- `packages/ai/src/virtual-key/{config,admin,store,resolver,caller,index}.ts` + test cùng thư mục (mới)
- `packages/ai/src/index.ts`: thêm đúng một dòng `export * from './virtual-key';`
- `env.example`: thêm TÊN biến `LITELLM_VIRTUAL_KEYS_ENABLED`, `LITELLM_MASTER_KEY`, `LITELLM_VIRTUAL_KEY_DEFAULT_BUDGET_USD`
- Docs bằng file riêng: `docs/plans/quyet-dinh/qavk1.md`, `docs/can-ban-cung-cap.d/ai-virtualkey.md`, `docs/testing/kiem-tra-tay.d/{kt,tt}-avk.md`, `docs/codemap.d/mien-packages-ai-src-virtual-key.md`, `docs/handoff/feat-ai-virtualkey.md`; sửa dòng AI-VIRTUALKEY ở gap-matrix và MASTER.

## Migration

Không có. Lưu khóa bền (mã hóa) cần bảng mới → ghi gap matrix `AI-VIRTUALKEY-DB` (làn b); trong lúc đó `VirtualKeyStore` có bản bộ nhớ + interface.

## Test viết trước

Toàn bộ tiêu chí 1–7 (logic quy tắc: cờ, ngân sách, cô lập workspace, đóng khi lỗi). Property-based bằng `fast-check` (đã có trong devDependencies).

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/virtual-key`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (khóa/bí mật LLM, cô lập workspace, đóng khi lỗi). Không migration nên không cần `verifier-db`.

## Rủi ro / câu hỏi cho chủ dự án

Cần master key LiteLLM thật + chỗ lưu khóa bền mới bật được (ghi CAN_BAN_CUNG_CAP). Cờ tắt nên không ảnh hưởng hiện tại.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có (không thư viện mới; interface `VirtualKeyAdmin`/`VirtualKeyStore` có ≥ 2 bản dùng thật: HTTP + mock — ngoại lệ connector được phép).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking

## Trạng thái duyệt

Đã duyệt (tự duyệt: mọi quyết định có trong spec/ADR hoặc ghi ở Q-AVK1).
