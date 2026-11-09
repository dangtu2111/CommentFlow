# Bàn giao `feat/fact-qualitative` (ADR 017 — FACT-QUALITATIVE, không migration)

Agent vừa làm: Claude Code (một phiên, một nhánh). Quyết định đã khóa: `docs/decisions/017-da-khoa.md`.

## Đã làm

- **Sự kiện định tính (enum)** trong `data` jsonb của 5 kind hiện có: ship (`feeMode/freeOverMinor/daysMode/destinations`), returns (`refundTo/returnShippingPaidBy/eligibility`); bảng quốc gia/tiểu bang Mỹ (`fact-plan/destinations.ts`); #294 rút enum từ văn bản (`suggest-qualitative.ts`). Nguyên văn chỉ làm bằng chứng.
- **Chủ đề do `extract` trả** (enum Zod `topics` + `destination`); bỏ regex `topics.ts`. Lọc theo ý hỏi: khuyến mãi không phải giá/tồn.
- **Hàng lỗi (`defect`)**: chuyển người; ngoại lệ thẻ bảo hành đã duyệt có `scope` khớp bằng code → trả lời từ thẻ bảo hành, `needsHuman = true`, `autoSendPolicy = never`, lý do `defect_warranty_scope` ở `riskReasons.review`.
- **Prompt/guard** chế độ chỗ giữ chỗ: mã BẮT BUỘC, cấm tình trạng hàng/câu mời/hỏi thêm/hứa đổi hoàn; nhãn tiếng Việt thay mã enum; guard từ chối cứng câu mời và tình trạng hàng LLM tự viết.
- **Ngôn ngữ**: `replyLanguage` (kênh cố định → mặc định workspace) và `previousLang` (lượt khách trước, `cf.comments.lang`) vào pipeline, cùng đường với EVAL; "you" không lọt câu tiếng Việt.
- Số khách nêu (`extract.qty`) qua `customer_measure`; mọi biến thể cùng giá → trả lời giá; câu dự phòng ghép biến thể; tồn kho theo `stockDisclosure` của shop; biến thể duy nhất tự chọn không nhắc tên.
- **EVAL**: `--fact-slots`, `shop.policyFacts/stockDisclosure/replyLanguage`, nhãn gold `factKinds` (chủ dự án cấp), `slotDiagnostics.rejections` (mẫu, bản reply/variant, mã lý do).

## Kết quả đo cuối (`tools/eval/out/fs-q`, `fs-q2`; 1 lượt mỗi bên)

| | before | after |
|---|---|---|
| demo-shop, nhóm VN có dấu (FR-147) | 33/37 | 35/37 |
| demo-shop, toàn bộ 99 mẫu | 91 | 93 |
| sswiftly (32 mẫu) | 26 | 26 |
| từ chối cứng | — | demo 6/192 (3,1%), sswiftly 0/58 |
| sai giá / FR-142 / `{fact:…}` lọt / lưới cuối | 0 | 0 |

Chi phí lượt cuối: $0,0621 (demo) + $0,0242 (sswiftly); khóa ảo đã tiêu 32%.

## Còn lại / gap (không làm trong nhánh này)

- `POLICY-DRAFT-OWNER-EDIT` (bắt buộc trước màn Chính sách có cấu trúc), `ADVICE-SIZE-VARIANT-BLOCK` (vi-30), `FR160-FDA-GUARANTEE` (en-23/24), `PRODUCT-QA-SIZE-COMPAT` (en-14/15).
- vi-12 vẫn `handoff` vì nhãn `complaint` thắng; logic bảo hành theo phạm vi đã có test nhưng mẫu này chưa đạt trong EVAL.
- Lời văn vi-35: "Phí ship toàn quốc là shop giao toàn quốc." (LLM ghép sai lời dẫn quanh chỗ giữ chỗ `ship_destination`).
- Cờ `cf.ai.fact_slots`: chỉ bật `[EVAL]`; Shop Thử 2 chưa bật.

## Chủ dự án kiểm chéo

Prompt (`draft-prompt.ts`, `extract-prompt.ts`), guard (`slots.ts`), schema Zod `policy_facts` (`packages/shared/src/policy-facts.ts`), đọc thêm cột sẵn có trong `loadPipelineContext`.
