# Kế hoạch `feat-litellm-langfuse` — LiteLLM nhiều nhà cung cấp + trace Langfuse

## Việc

Mã gap matrix: `LITELLM-LANGFUSE` (GĐ5) · Spec: `docs/09_System_Architecture.md` (LiteLLM, Langfuse), nguyên tắc 6–7 của `AGENTS.md`, FR-033/034.

**Tóm tắt:** Dựng phần mã và cấu hình để (1) định tuyến mỗi bước pipeline (phân loại, soạn, viết lại, embedding) tới nhóm model riêng có model dự phòng, kèm giới hạn ngân sách theo khóa ảo (LiteLLM = cổng trung gian tới nhiều nhà cung cấp LLM); (2) gửi trace sang Langfuse (công cụ quan sát lần gọi LLM) qua một interface, luôn che SĐT/email trước khi gửi. Toàn bộ chạy bằng mock, hai cờ mặc định TẮT; không gọi dịch vụ thật nên không tốn tiền. Rủi ro: lộ PII ra Langfuse nếu quên che → che nằm ngay trong sink, có test thuộc tính. Chưa nối vào `llm-client`/pipeline (nối ở bước sau để không đụng file của làn khác).

## Điểm chưa rõ

Không có. Quyết định tự chọn: Q-LLF1 (xem `docs/plans/quyet-dinh/qllf1.md`).

## Tiêu chí nghiệm thu

1. Cờ `LITELLM_MULTI_PROVIDER_ENABLED` tắt → mọi bước đi `mock-llm`; bật → mỗi bước có model + dự phòng; bước lạ → tuyến mặc định — test `routing.test.ts`.
2. Giới hạn ngân sách sinh đúng tham số khóa ảo LiteLLM (`max_budget`, `budget_duration`, `model_max_budget`); giá trị không hợp lệ bị từ chối; `checkBudget` trả ok/warn(≥80%)/exceeded — test `budget.test.ts`.
3. Cấu hình đọc từ biến môi trường; Langfuse bật mà thiếu host/khóa → `CONFIG_INVALID` (thông báo chỉ nêu TÊN biến) — test `config.test.ts`.
4. Sink Langfuse che PII (SĐT, email) ở input/output/metadata/lỗi trước khi gửi (kể cả property test); không bao giờ gửi bản gốc; lỗi mạng không làm hỏng luồng gọi LLM — test `langfuse-trace.test.ts`.
5. Cờ tắt → sink no-op, không gọi `fetch` — test.
6. `pnpm --filter @flow/ai test:coverage` đạt ngưỡng; `pnpm precheck` xanh.

## File sẽ đọc

`docs/plans/MASTER.md` (dòng LITELLM-LANGFUSE), `packages/ai/src/pii/mask-pipe.ts` (`maskForTrace`), `packages/ai/src/cache/semantic-cache.ts` (mẫu cờ), `infra/litellm/*.yaml`, `packages/ai/vitest.config.ts`.

## File sẽ sửa / tạo

- `packages/ai/src/observability/{routing,budget,config,langfuse-trace,index}.ts` + test — logic thuần, fetch tiêm vào.
- `packages/ai/src/index.ts` — thêm đúng một dòng `export * from './observability';`.
- `infra/litellm/multi-provider.example.yaml` — mẫu nhiều nhà cung cấp, KHÔNG nạp mặc định, chỉ tên biến môi trường.
- `env.example` — chỉ tên biến mới.
- Tài liệu: `docs/can-ban-cung-cap.d/litellm-langfuse.md`, `docs/testing/kiem-tra-tay.d/{kt,tt}-llf.md`, `docs/plans/quyet-dinh/qllf1.md`, `docs/codemap.d/…`, dòng gap-matrix/MASTER, `docs/handoff/feat-litellm-langfuse.md`.

## Migration

Không có. Phần cần bảng (lưu cấu hình định tuyến/ngân sách theo workspace, `AI-VIRTUALKEY`) → ghi gap cho làn b.

## Test viết trước

Tất cả file `*.test.ts` trong `observability/` viết trước, chạy thấy đỏ (thiếu module) rồi mới viết mã.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/observability` · `pnpm --filter @flow/ai test:coverage`

## Cần kiểm chứng độc lập không?

Có — `verifier-security` một lần (che PII trước Langfuse).

## Rủi ro / câu hỏi cho chủ dự án

Cần khóa nhà cung cấp LLM thật và dự án Langfuse (xem CAN_BAN_CUNG_CAP). Không chặn việc.

## Đề xuất thay đổi

Không có.

## Complexity tracking

Không có (không thêm thư viện: dùng `fetch` có sẵn; `fast-check` đã cài).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới"

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR hoặc ghi Q-LLF1).
