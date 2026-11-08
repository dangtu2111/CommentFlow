# Kế hoạch `feat/draft-fact-slots` — Code lập "fact plan", LLM chỉ viết câu với chỗ giữ chỗ

## Việc

Mã gap matrix: `DRAFT-FACT-SLOTS` · Spec: FR-140, FR-141, FR-160, FR-161, FR-162, docs/09 §4–§6 · ADR: `docs/decisions/017-draft-fact-slots.md` (đọc trước).

**Tóm tắt (2–3 câu dễ hiểu):** Hiện AI tự viết cả số liệu và khẳng định có/không (giá, phí ship, COD…) rồi code phải đoán lại có đúng nguồn không; mỗi lần đo lại lòi một kiểu lọt/chặn nhầm mới. Việc này đổi cách làm: **code lập sẵn danh sách "sự kiện cần nói" với giá trị lấy từ dữ liệu có cấu trúc (hoặc "không xác định")**, AI chỉ viết lời văn với chỗ giữ chỗ `{fact:id}`, **cấm chữ số và khẳng định có/không ngoài chỗ giữ chỗ**, code điền giá trị đúng định dạng; sự kiện không xác định thì code chèn câu mời theo mẫu của shop. Rủi ro: shop chưa điền chính sách có cấu trúc thì AI mời ib nhiều hơn (an toàn nhưng trả lời ít hơn); cần thêm bảng dữ liệu (migration) và một màn nhập thẻ.

## Điểm chưa rõ

1. `[CẦN LÀM RÕ: thẻ Ship khai khu vực thế nào?]` Khuyến nghị: mỗi dòng khu vực có `tên hiển thị` + danh sách `từ khớp` (vd "nội thành" = [hà nội, tp hcm, hcm, sài gòn…]) + phí + thời gian; luôn có dòng "toàn quốc" (nếu shop khai). Khách nêu địa điểm không khớp dòng nào → `unknown` (không đoán).
2. `[CẦN LÀM RÕ: shop chưa có thẻ có cấu trúc thì xử lý ra sao trong giai đoạn chuyển tiếp?]` Khuyến nghị: sự kiện chính sách = `unknown` → mời ib theo mẫu; thêm nút "AI đề xuất điền thẻ từ văn bản chính sách/Shopify", mỗi giá trị đề xuất phải xuất hiện nguyên văn trong văn bản nguồn (code kiểm), Owner duyệt mới có hiệu lực. Không bao giờ tự áp giá trị đề xuất chưa duyệt.
3. `[CẦN LÀM RÕ: độ chặt của guard "số viết bằng chữ"?]` Khuyến nghị: chặn chữ số mọi nơi ngoài chỗ giữ chỗ + số-bằng-chữ chỉ khi đứng cạnh đơn vị tiền/thời gian/phần trăm (danh sách đóng vi/en, hiệu chỉnh bằng EVAL); không chặn "một chút", "hai bạn".
4. `[CẦN LÀM RÕ: cờ bật theo workspace hay toàn hệ thống?]` Khuyến nghị: cờ theo workspace (mặc định TẮT) để bật dần shop mẫu; EVAL bật cho `[EVAL]`.
5. `[CẦN LÀM RÕ: màn hình thẻ chính sách có cấu trúc]` Thiết kế 7.3 (`design/stitch/knowledge-base.png`) chỉ có mục "Chính sách" dạng danh sách văn bản, chưa có thẻ có cấu trúc → khuyến nghị ghi `docs/plans/ui-thieu-thiet-ke.md` ("Thẻ chính sách có cấu trúc: Ship/Đổi trả/Bảo hành/Thanh toán + banner đề xuất AI chờ duyệt") để người điều phối tạo bằng Stitch; phần code lõi KHÔNG chờ màn này (nhập tạm qua API/seed cho shop mẫu).
6. `[CẦN LÀM RÕ: kiểu hiển thị tồn kho]` Khuyến nghị: sự kiện `stock` có chế độ do code chọn theo tùy chọn Owner (còn/hết mặc định; "nêu số lượng"; "báo sắp hết khi ≤ N", N mặc định 5) — gộp STOCK-DISCLOSURE-OPTION vào đây.

## Tiêu chí nghiệm thu

1. **Fact plan (thuần, 0 lần gọi LLM):** với câu hỏi giá/tồn/ship/COD/đổi trả, đầu ra liệt kê từng sự kiện với giá trị hoặc `unknown`; "Hà Nội" chỉ ra giá trị khi có dòng khu vực khớp, nếu không → `unknown` — kiểm bằng: `packages/ai/src/fact-plan/*.test.ts` (vi/en, có dấu/không dấu).
2. **Chỗ giữ chỗ:** câu có chữ số, số-bằng-chữ cạnh đơn vị, hoặc khẳng định có/không ngoài `{fact:…}` → bị TỪ CHỐI CỨNG (không gọi LLM sửa; chuyển biến thể khác cùng tập chỗ giữ chỗ, hết thì câu mời theo mẫu); mọi biến thể phải dùng cùng tập chỗ giữ chỗ — kiểm bằng: `fact-plan/guard.test.ts` + test pipeline đếm số lần gọi LLM (≤ 2/lượt, FR-162).
3. **Điền giá trị:** tiền/tồn/thời gian đúng định dạng theo ngôn ngữ (vi `99.000đ`, en `$58.90`), `claims`/`sources` do code sinh từ chỗ giữ chỗ — kiểm bằng: `fact-plan/fill.test.ts`.
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

- [ ] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần kiểm chéo)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking (không có thư viện mới)
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy GHI theo vai trò (`withActor`, `is_workspace_owner`; worker `withJob` chỉ ghi `draft`)

## Trạng thái duyệt

**Chờ duyệt.** Chưa sửa code. Cần chủ dự án trả lời 6 điểm chưa rõ (hoặc chấp nhận các khuyến nghị) và duyệt ADR 017.
