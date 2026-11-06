# Kế hoạch `feat-leads-store` — LEADS-STORE (bảng `leads` + truy vấn + kho SĐT/email đã mã hóa)

Mã gap matrix: `LEADS-STORE` (phần dữ liệu của `LEADS-KANBAN`) · Spec: FR-082, FR-033, FR-162, US-051; `docs/10_Database_Design.md` §3.5 (`leads`).

**Tóm tắt:** Tạo bảng `cf.leads` (khách tiềm năng theo workspace, có RLS) để lưu SĐT/email lấy ra TRƯỚC khi che (PII-MASK-PIPE). SĐT/email không nằm dạng thô trong DB: mã hóa AES-256-GCM (để hiển thị cho người được giao) + chỉ mục băm HMAC (để chống trùng mà không lộ số). Có thêm `ContactSink` thật (ghi qua `withJob`) và truy vấn liệt kê/đổi giai đoạn/giao người. Rủi ro: dữ liệu cá nhân (PII) — khóa chỉ nằm ở biến môi trường, test không dùng số thật; chưa có giao diện Kanban và chưa nối vào pipeline (cờ TẮT).

## Điểm chưa rõ

Không có (tự chọn phương án khuyến nghị, ghi Q-LDS1 trong `QUYET_DINH_CHO_DUYET.md`).

## Tiêu chí nghiệm thu

1. Chuẩn hóa SĐT/email, `last4`, lập nhóm lead từ liên hệ (phone→lead, email đầu gắn vào lead đầu; tối đa 3 lead/lần) đúng quy tắc, bất biến theo property-based — `packages/shared/src/lead-contact.test.ts`.
2. Mã hóa AES-GCM khứ hồi; sai workspace/lead/trường/phiên bản khóa → không giải mã; băm cùng đầu vào cùng kết quả, khác workspace/loại khác kết quả; khóa sai định dạng → lỗi cấu hình không lộ khóa — `packages/db/src/lead-vault.test.ts`.
3. `cf.leads` không chứa SĐT/email thô; CHECK stage/source_type/độ dài/last4; chống trùng theo băm trong workspace — `packages/db/tests/leads.int.test.ts`.
4. RLS: INSERT chỉ hệ thống (`withJob`); thành viên đọc + sửa stage/ghi chú/giao người; Staff/Owner/`withWorkspace` trần không INSERT được; Owner hoặc hệ thống DELETE; workspace khác không thấy/ghi chéo; cột định danh/PII bất biến — cùng test + `pnpm db:check-rls`.
5. Giao người chỉ cho thành viên đang hoạt động của chính workspace — cùng test.
6. `ContactSink` thật: lưu số gốc trước khi che, trả `saved:false` khi lỗi, không log PII, bỏ qua khi thiếu khóa (cờ tắt) — `packages/db/src/lead-sink.test.ts` + int test.
7. lint, lint:i18n, typecheck, depcruise, check:plans, test:trace, coverage `packages/shared`, `CF_LANE=b pnpm test:db`.

## File sẽ đọc

`docs/10` §3.5 (đã đọc), `packages/db/src/queries/spam-rules.ts` + migration 0050 + `check-rls.ts` (mẫu), `packages/connectors/src/token-cipher.ts` (mẫu mã hóa), `packages/ai/src/pii/mask-pipe.ts` (interface `ContactSink`), `packages/shared/src/pii.ts`, `packages/db/tests/spam-rules.int.test.ts` (mẫu test).

## File sẽ sửa / tạo

- `packages/shared/src/lead-contact.ts` (+test) — chuẩn hóa, last4, lập nhóm, cập nhật hợp lệ (Zod); `index.ts`.
- `packages/db/src/lead-vault.ts` (+test) — AES-256-GCM + chỉ mục băm HMAC, khóa từ `LEADS_ENC_KEYS`/`LEADS_HASH_KEY`.
- `packages/db/src/schema/cf/leads.ts` + `index.ts`; migration `0051_leads_store.sql` + `meta/*`.
- `packages/db/src/queries/leads.ts`, `lead-sink.ts` (+test), `runtime.ts` (xuất).
- `packages/db/src/check-rls.ts` — kỳ vọng RLS `cf.leads`.
- `packages/db/tests/leads.int.test.ts`.
- `env.example` (tên biến), `docs/CAN_BAN_CUNG_CAP.md`, `docs/testing/KIEM_TRA_TAY.md`, `docs/10`, `docs/codemap.d/*`, `docs/plans/quyet-dinh/q-lds1.md`, `docs/gap-matrix.md`/`MASTER.md` (dòng của việc), `docs/handoff/feat-leads-store.md`.

## Migration

`0051_leads_store` (fetch origin trước khi đặt số: sau 0050). Tạo `cf.leads`; RLS; GRANT theo cột. Đường lùi: `DROP TABLE cf.leads` + bỏ kỳ vọng check-rls; ContactSink về `saved:false` (pipeline chưa nối nên không ảnh hưởng).

## Test viết trước

Unit (shared, db vault, sink) viết trước và thấy đỏ; int test RLS/CHECK viết cùng migration trước khi viết truy vấn.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/shared exec vitest run src/lead-contact.test.ts`; `pnpm --filter @flow/db exec vitest run src/lead-vault.test.ts src/lead-sink.test.ts`; `CF_LANE=b pnpm test:db` (leads); `pnpm db:check-rls`.

## Cần kiểm chứng độc lập không?

Có — `verifier-db` (migration + RLS) và `verifier-security` (PII mã hóa/băm, RLS ghi theo vai trò).

## Rủi ro / câu hỏi cho chủ dự án

Khóa `LEADS_ENC_KEYS`/`LEADS_HASH_KEY` chủ dự án tạo trên staging/production (xem `CAN_BAN_CUNG_CAP`). Mất `LEADS_HASH_KEY` = mất khả năng chống trùng (không mất dữ liệu). Chưa ghi nhật ký mỗi lần giải mã số (việc LEADS-KANBAN UI).

## Đề xuất thay đổi

Cập nhật docs/10 `leads` theo thực tế 0051 (đã ghi vào Q-LDS1).

## Complexity tracking

- `fast-check` 4.10.2 (MIT) thêm vào devDependencies của `shared` và `db`: STANDARD §5 yêu cầu property-based cho logic PII; đã dùng ở `ai`/`connectors` cùng phiên bản. Phương án loại: test ví dụ thuần — không phủ không gian đầu vào.

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, mẫu `is_workspace_owner`) hay chỉ theo workspace (`withWorkspace`) — hoặc "không có bảng mới": INSERT chỉ hệ thống (`withJob`); UPDATE thành viên (`withActor`) hoặc hệ thống; DELETE Owner hoặc hệ thống

## Trạng thái duyệt

**Đã duyệt** (tự duyệt: mọi quyết định đã có trong spec/ADR; Q-LDS1).
