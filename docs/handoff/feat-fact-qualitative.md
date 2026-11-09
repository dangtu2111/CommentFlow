# Bàn giao `feat/fact-qualitative` (ADR 017 — FACT-QUALITATIVE, không migration)

Agent vừa làm: Claude Code (một phiên, một nhánh, năm vòng sửa trên PR #296). Quyết định đã khóa: `docs/decisions/017-da-khoa.md`; quyết định tự chọn: `docs/plans/quyet-dinh/q-adr017-*.md`.

## Đã làm (theo vòng)

**Vòng 1 — nền định tính.** Sự kiện enum trong `data` jsonb của 5 kind hiện có (ship: `feeMode/freeOverMinor/daysMode/destinations`; returns: `refundTo/returnShippingPaidBy/eligibility`); bảng quốc gia/tiểu bang (`fact-plan/destinations.ts`); #294 rút enum từ văn bản (`suggest-qualitative.ts`). Chủ đề do `extract` trả (enum Zod `topics` + `destination`), bỏ regex `topics.ts`. Hàng lỗi (`defect`) chuyển người, ngoại lệ thẻ bảo hành có `scope` khớp bằng code → trả lời kèm `requiresHumanReview`. Prompt/guard chỗ giữ chỗ (mã BẮT BUỘC, cấm tình trạng hàng/câu mời/hứa đổi hoàn). Ngôn ngữ: `replyLanguage` + `previousLang` vào pipeline (worker và EVAL). EVAL: `--fact-slots`, `shop.policyFacts/stockDisclosure/replyLanguage`, gold `factKinds`.

**Vòng 2 — sửa chẩn đoán.** Khuyến mãi không phải giá/tồn; "ship tỉnh"; "còn mấy cái"; lời văn en-11; `slotDiagnostics.rejections`; tồn kho không đếm khi chưa chọn biến thể.

**Vòng 3 — lỗi nghiêm trọng + CI.** FR-140: bản nháp rỗng/`answer` mà `needs_human` → chuyển người (`claim_unsupported`, lý do `fr140_draft_unusable`), `reply_empty` vào EVAL; luật giá đồng nhất (`q-adr017-uniform-price`); viplain-24 (sản phẩm không có trong danh mục → redirect); vi-35 bỏ cụm dẫn "là…"; coverage shared 100%; `q-adr017-defect-warranty`.

**Vòng 4 — gốc từ chối cứng.** Cặp phí/thời gian ship cùng dòng (sự kiện đi kèm `optional`), bỏ nguồn chính sách trùng chủ đề khỏi prompt (`q-adr017-ship-pair`); `returns` không ngày nhưng có enum → cấp sự kiện định tính (en-08); khớp tên sản phẩm không dấu bằng code khi `extract` không trả tên (viplain-06, `TryKnowledge.productNames`); `fill.ts`: viết hoa đầu câu, thêm dấu chấm, tách hai câu sự kiện liền nhau; cổng từ chối cứng tính theo MẪU dùng dự phòng/chuyển người; vi-12: nhãn phụ `complaint` không ép chuyển người khi khớp phạm vi bảo hành (người duyệt bắt buộc).

**Vòng 5 — lỗ thiết kế viplain-08.** Plan có sự kiện bắt buộc + bộ soạn trả `needs_human` trần (câu rỗng) → không bỏ qua khối chỗ giữ chỗ, dùng câu dự phòng (`chosen = fallback`, tính vào cổng dự phòng); prompt thêm "Không đặt needs_human vì thiếu đoạn nguồn"; EVAL ghi `needsHuman/autoSendPolicy/riskReasons` vào jsonl và liệt kê mẫu `needsHuman = true` trong báo cáo.

## File đã đọc + điều rút ra

- `fact-plan/{plan,fill,compose,slots,types}.ts`: plan do code lập; `optional` = được dùng không bắt buộc (không vào `requiredFactIds`/câu dự phòng); `fill` xử lý lời dẫn, hoa/chấm câu; guard từ chối cứng chữ số, số bằng chữ, khẳng định khái niệm, câu mời, tình trạng hàng.
- `pipeline/run-pipeline.ts`: thứ tự — extract → nhận sản phẩm (kể cả khớp tên bằng code) → plan → `decideAction` (bỏ nhãn phụ complaint khi `waiveSecondaryComplaint`) → soạn → chọn câu/dự phòng → FR-140.
- `tools/eval/src/{slot-metrics,run-sample}.ts`: cổng từ chối cứng, danh sách mẫu dự phòng và `needsHuman`.
- Bài học: LLM dao động giữa các lượt (mẫu lệch khác nhau mỗi lần); mỗi lần sửa phải đo lại và liệt kê từng mẫu.

## Kết quả đo gần nhất

`out/fs-q6` (trước vòng 5): demo nhóm có dấu 36/37, không dấu 29/32, trộn 29/30; sswiftly 27/32; sự kiện bắt buộc demo 34/36 và sswiftly 11/12; từ chối cứng theo mẫu demo 1/99, sswiftly 0/32; sai giá/FR-142/`reply_empty`/`{fact:…}` lọt = 0. `out/fs-q7` = đo sau vòng 5 (xem báo cáo cuối của PR).

## Còn lại / gap giữ nguyên

- `POLICY-DRAFT-OWNER-EDIT` (bắt buộc trước màn Chính sách có cấu trúc), `ADVICE-SIZE-VARIANT-BLOCK` (vi-30/viplain-30/mixed-30), `FR160-FDA-GUARANTEE` (en-23/24; en-24 đang ra `answer`, chờ quyết định), `PRODUCT-QA-SIZE-COMPAT` (en-14/15), en-22, viplain-03 + tách size/màu nhóm không dấu.
- Cờ `cf.ai.fact_slots`: chỉ bật `[EVAL]`; Shop Thử 2 chưa bật cho tới khi sswiftly và demo có cờ ≥ không cờ.

## Chủ dự án kiểm chéo

Prompt (`draft-prompt.ts`, `extract-prompt.ts`), guard (`slots.ts`), điều kiện FR-140 và `waiveSecondaryComplaint` (`run-pipeline.ts`), schema Zod `policy_facts`, đọc thêm cột sẵn có trong `loadPipelineContext`.
