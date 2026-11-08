# Kế hoạch `feat/draft-fact-slots` — Code lập "fact plan", LLM chỉ viết câu với chỗ giữ chỗ

## Việc

Mã gap matrix: `DRAFT-FACT-SLOTS` · Spec: FR-140, FR-141, FR-160, FR-161, FR-162, docs/09 §4–§6 · ADR: `docs/decisions/017-draft-fact-slots.md` (đọc trước).

**Tóm tắt (2–3 câu dễ hiểu):** Hiện AI tự viết cả số liệu và khẳng định có/không (giá, phí ship, COD…) rồi code phải đoán lại có đúng nguồn không; mỗi lần đo lại lòi một kiểu lọt/chặn nhầm mới. Việc này đổi cách làm: **code lập sẵn danh sách "sự kiện cần nói" với giá trị lấy từ dữ liệu có cấu trúc (hoặc "không xác định")**, AI chỉ viết lời văn với chỗ giữ chỗ `{fact:id}`, **cấm chữ số và khẳng định có/không ngoài chỗ giữ chỗ**, code điền giá trị đúng định dạng; sự kiện không xác định thì code chèn câu mời theo mẫu của shop. Rủi ro: shop chưa điền chính sách có cấu trúc thì AI mời ib nhiều hơn (an toàn nhưng trả lời ít hơn); cần thêm bảng dữ liệu (migration) và một màn nhập thẻ.

## Điểm chưa rõ

Không có (chủ dự án trả lời và duyệt 08/11/2026). Các quyết định:

1. **Khu vực:** theo khuyến nghị (dòng khu vực = tên hiển thị + từ khớp + phí + thời gian; dòng "Toàn quốc"), thêm: (a) dòng "nội thành" **bắt buộc ghi thành phố** (không có thành phố thì không hợp lệ); (b) từ điển tỉnh/thành gồm **tên cũ và tên mới sau sáp nhập 2025**; "Toàn quốc" là mặc định cho địa điểm trong VN không khớp dòng khác; (c) khách **không nêu địa điểm** mà phí/thời gian phụ thuộc khu vực → **clarify hỏi tỉnh/thành** (FR-147), không redirect.
2. **Chuyển tiếp:** theo khuyến nghị; thêm: **mỗi lần đồng bộ Shopify tự tạo đề xuất nháp**; thanh **Độ sẵn sàng (FR-146)** nhắc Owner duyệt đề xuất.
3. **Guard chữ số:** theo khuyến nghị; thêm: **tên sản phẩm, thuộc tính biến thể (size 29, 32mm, A4, 14-in-1…) và số khách tự nêu cũng đi qua chỗ giữ chỗ** (`{fact:product_name}`, `{fact:variant}`, `{fact:customer_measure}`); test với tên sản phẩm có chữ số của sswiftly.
4. **Cờ theo workspace**, mặc định TẮT; bật cho `[EVAL]` và Shop Thử 2 khi đo.
5. **Màn thẻ:** chủ dự án tạo bằng Stitch (đã ghi `docs/plans/ui-thieu-thiet-ke.md`); **code lõi không chờ**.
6. **Tồn kho:** gộp STOCK-DISCLOSURE-OPTION; **tồn kho cũ (FR-151) → sự kiện tồn = `unknown`**.
7. **Bổ sung vào ADR 017:** định dạng tiền theo **tiền tệ của sản phẩm** (VND/USD); ngôn ngữ chỉ quyết định dấu phân cách; **khoảng giá** khi các biến thể khác giá là sự kiện riêng `{fact:price_range}` do code tính (FR-158).
8. **Thứ tự PR:** (1) lõi fact plan + guard + điền, sau cờ TẮT, không migration → (2) bảng `policy_facts` + RLS + trigger (**dừng gửi chủ dự án kiểm chéo**) → (3) đề xuất điền từ văn bản/Shopify → (4) UI thẻ → (5) bật cờ cho `[EVAL]`/Shop Thử 2, đo, báo.

## Tiêu chí nghiệm thu

1. **Fact plan (thuần, 0 lần gọi LLM):** với câu hỏi giá/tồn/ship/COD/đổi trả, đầu ra liệt kê từng sự kiện với giá trị hoặc `unknown`; địa điểm khớp dòng khu vực (kể cả tên cũ/mới sau sáp nhập 2025) → giá trị; địa điểm VN không khớp → dòng "Toàn quốc"; khách không nêu địa điểm mà giá trị phụ thuộc khu vực → **clarify hỏi tỉnh/thành** (không redirect); dòng "nội thành" thiếu thành phố → không hợp lệ; tồn cũ (FR-151) → `unknown`; khoảng giá = `{fact:price_range}` — kiểm bằng: `packages/ai/src/fact-plan/*.test.ts` (vi/en, có dấu/không dấu).
2. **Chỗ giữ chỗ:** tên sản phẩm/thuộc tính biến thể/số khách nêu cũng qua `{fact:product_name}`/`{fact:variant}`/`{fact:customer_measure}` (test với tên sswiftly có chữ số: "14-in-1", "A4", "32mm", "2 in1"); câu có chữ số, số-bằng-chữ cạnh đơn vị, hoặc khẳng định có/không ngoài `{fact:…}` → bị TỪ CHỐI CỨNG (không gọi LLM sửa; chuyển biến thể khác cùng tập chỗ giữ chỗ, hết thì câu mời theo mẫu); mọi biến thể phải dùng cùng tập chỗ giữ chỗ — kiểm bằng: `fact-plan/guard.test.ts` + test pipeline đếm số lần gọi LLM (≤ 2/lượt, FR-162).
3. **Điền giá trị:** tiền theo **tiền tệ của sản phẩm** (VND/USD; ngôn ngữ chỉ quyết định dấu phân cách: vi `99.000đ`/`$58,90`, en `99,000₫`/`$58.90`), tồn/thời gian theo ngôn ngữ, `claims`/`sources` do code sinh từ chỗ giữ chỗ — kiểm bằng: `fact-plan/fill.test.ts`.
4. **Không xác định → câu mời:** sự kiện `unknown` → câu theo `brand_voice.handoff_templates` (xưng hô, trong/ngoài giờ) + `unanswered_topics`; phần xác định vẫn được trả lời — kiểm bằng: test pipeline `mixed-11` (giá sản phẩm + mời ib phí ship khi không rõ khu vực) cả vi/en.
5. **Chính sách có cấu trúc:** bảng + RLS (đọc theo workspace; ghi/duyệt chỉ Owner), giá trị `draft` chưa duyệt KHÔNG vào fact plan — kiểm bằng: `pnpm test:db` (`policy-facts.int.test.ts`, `pnpm db:check-rls`).
6. **Đề xuất điền từ văn bản/Shopify:** mỗi giá trị đề xuất xuất hiện nguyên văn trong nguồn (code kiểm), trạng thái `draft` chờ Owner duyệt — kiểm bằng: `policy-facts-suggest.test.ts`.
7. **Đo EVAL trước/sau** (cách đo gọn: 1 lượt/nhóm nhỏ, 1 lượt toàn bộ 2 bộ khi xong, 3 lượt ở mốc kết luận): **0 `priceWrong` và 0 bịa chính sách theo thiết kế** (số/khẳng định ngoài chỗ giữ chỗ = 0 trong mọi câu), **hành động đúng sswiftly ≥ 90%** (nền 78,1%), demo-shop không thấp hơn nền 91,9%; báo chi phí thật; nghi đáp án bộ mẫu sai → liệt kê cho chủ dự án, không tự sửa — kiểm bằng: `pnpm --filter @flow/eval run evaluate`.

## File sẽ đọc (≤ ~8, kèm lý do)

- `packages/ai/src/pipeline/run-pipeline.ts` — chỗ chèn fact plan, vòng guard hiện tại.
- `packages/ai/src/draft/{drafter.ts,draft-result.ts}` + prompt soạn — đổi hợp đồng đầu ra (chỗ giữ chỗ).
- `packages/ai/src/guard-money.ts`, `guard-support.ts` — đổi vai trò sang "từ chối cứng ngoài chỗ giữ chỗ".
- `packages/ai/src/decide/order-hours-rules.ts` (`resolveInvitation`) — câu mời theo mẫu.
- `packages/ai/src/try/db-product-knowledge.ts` — giá/tồn/biến thể làm nguồn sự kiện sản phẩm.
- `packages/ai/src/kb-sync/policy-documents.ts`, `packages/db/src/schema/cf/kb-content.ts` — chính sách hiện là văn bản thô.
- `docs/09_System_Architecture.md` §4–§6, `docs/05_Functional_Requirements.md` FR-140/141/161.

## File sẽ sửa / tạo

Tạo: `packages/ai/src/fact-plan/{plan.ts,slots.ts,fill.ts,guard.ts,index.ts}` (+ test); `packages/db/src/schema/cf/policy-facts.ts`, `packages/db/src/queries/policy-facts.ts`, migration; `packages/ai/src/policy-facts-suggest/*`; UI thẻ (sau khi có màn Stitch). Sửa: `run-pipeline.ts`, `draft/*` (prompt + schema), `guard-*.ts`, `decide/*` (nối `unknown` → mời), i18n vi/en, `docs/gap-matrix.md`, `docs/codemap.d/*`.

## Migration

Cần (xác nhận thiết kế khi duyệt): bảng `cf.policy_facts` — `id`, `workspace_id`, `kind` (`shipping|returns|warranty|payment`), `region_key` (nullable, chỉ `shipping`), `data` jsonb (Zod theo `kind`: phí/thời gian/COD; số ngày/điều kiện; thời hạn; phương thức), `status` (`draft|approved`), `origin` (`manual|shopify_suggested|text_suggested`), `source_policy_id`, `approved_by`, `approved_at`, `rev`. Chỉ-thêm; đường lùi = bỏ bảng (cờ TẮT thì không ai đọc). RLS theo `workspace_id`; trigger giữ `rev` và chặn đổi `approved` bởi không phải Owner. **Chạm RLS + trigger → thuộc diện chủ dự án kiểm chéo, KHÔNG tự merge.**

## Test viết trước

Fact plan (vi/en; có dấu/không dấu; Hà Nội ↔ nội thành khai/không khai; thiếu thẻ → `unknown`); guard chỗ giữ chỗ (chữ số, số-bằng-chữ, có/không về khái niệm; biến thể cùng tập chỗ giữ chỗ); điền giá trị theo định dạng; pipeline đếm số lần gọi LLM; `mixed-11` và `viplain-29` làm test hồi quy.

## Lệnh test phạm vi hẹp

`pnpm --filter @flow/ai exec vitest run src/fact-plan`; `pnpm test:db` (policy-facts); `pnpm db:check-rls`; `pnpm --filter @flow/eval run evaluate --dataset … --repeats 1`.

## Cần kiểm chứng độc lập không?

**Có.** Chạm cổng soạn/guard (đường tự gửi), RLS và trigger của bảng mới: phiên chính tự kiểm theo `docs/workflows/verify.md` (nhãn "tự kiểm, chưa có kiểm chứng độc lập"), chủ dự án hoặc Codex kiểm chéo trước merge; không tự merge PR migration. PR chỉ thêm mã thuần sau cờ TẮT (lõi fact plan + guard) cũng cần soát vì nằm trên đường tự gửi.

## Rủi ro / câu hỏi cho chủ dự án

Mục "Điểm chưa rõ" 1–6. Rủi ro chính: tỷ lệ `unknown` cao ở shop chưa điền thẻ làm giảm hành động đúng (kiểm bằng đo; giảm bằng đề xuất điền + Owner duyệt); chất lượng lời văn dưới ràng buộc chỗ giữ chỗ (đo bằng chấm tay 20 câu/bộ).

## Đề xuất thay đổi

- ADR 017 (mới, kèm theo). Sau duyệt: sửa FR-140/141/161 trong `docs/05` cho khớp (claims do code sinh; biến thể cùng tập chỗ giữ chỗ), thêm mục "thẻ chính sách có cấu trúc" vào `docs/08` §7.3.
- Chia PR theo thứ tự an toàn: (1) lõi fact plan + guard + điền, sau cờ TẮT, không migration; (2) bảng `policy_facts` + RLS + trigger (dừng cho chủ dự án kiểm chéo); (3) đề xuất điền từ văn bản/Shopify; (4) UI thẻ (sau màn Stitch); (5) bật cờ cho `[EVAL]`, đo, báo.

## Complexity tracking

Thêm một tầng mới (`fact-plan`) và một bảng mới: có ≥ 2 nơi dùng thật ngay (pipeline + EVAL + giao diện nhập), không thư viện mới. Đi ngược "không trừu tượng hóa sớm": không. Mọi truy vấn bảng mới đi qua `withWorkspace`/`withActor` (ghi theo vai trò Owner: mẫu `is_workspace_owner`; worker chỉ `withJob` để ghi đề xuất `draft`).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần kiểm chéo)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking (không có thư viện mới)
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, `is_workspace_owner`; worker `withJob` chỉ ghi `draft`)

## Trạng thái duyệt

Đã duyệt (chủ dự án 08/11/2026, kèm các trả lời ở mục "Điểm chưa rõ"). PR (2) có migration + RLS + trigger: DỪNG, gửi chủ dự án kiểm chéo, không tự merge.
