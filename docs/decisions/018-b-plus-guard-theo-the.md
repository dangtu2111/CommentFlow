# ADR 018 — B+: tắt `fact_slots`, LLM diễn đạt từ đoạn tìm được, guard kiểm theo THẺ (fact plan làm đáp án kiểm)

Trạng thái: **DRAFT — chờ chủ dự án duyệt.** Chưa code. Số đo cơ sở (cờ tắt) ghi ở `tools/eval/out/fs-b0` (không commit) và được tóm tắt vào mục § Số đo cơ sở sau khi chạy xong.

## Bối cảnh (dễ hiểu)

Chủ dự án muốn AI "hiểu mọi dữ liệu đã nhập rồi trả lời từ đó", nên chọn hướng B của buổi trao đổi 09/11/2026: **tắt cờ `cf.ai.fact_slots`**, để LLM tự diễn đạt từ các đoạn kiến thức tìm được (văn bản Shopify, FAQ, chính sách thô…), và **giảm lỗi bằng guard tốt hơn** thay vì cấm LLM viết sự kiện.

Điều này **đi ngược kết luận của ADR 017**: ADR 017 loại phương án "tiếp tục vá guard theo từng mẫu" vì mỗi vòng đo lại phát sinh biến thể mới, không có bảo đảm theo thiết kế. Lý do chủ dự án vẫn chọn B+:
1. Chế độ chỗ giữ chỗ chỉ nêu được 5 loại giá trị đã duyệt; mọi thông tin mô tả còn lại bị đổi thành câu mời nhắn tin, nên AI không "hiểu hết dữ liệu".
2. Chủ dự án chấp nhận rủi ro tăng so với chỗ giữ chỗ để đổi lấy độ phủ, **miễn là** guard được thiết kế lại theo cấu trúc (có đáp án kiểm từ code) chứ không vá từ khóa tùy ý.

Khác với "vá từng mẫu" trước đây: guard mới có **đáp án kiểm do code dựng sẵn** (fact plan) và **phạm vi nguồn rõ ràng** (đoạn `found` cùng chủ đề), nên mỗi loại lỗi có một quy tắc, không phải một từ khóa.

## Vấn đề guard hiện tại (có bằng chứng trong code)

- Guard tiền (`run-pipeline.ts` quanh `checkGuardMoney`, ~dòng 949) và guard khái niệm (`checkConceptSupport`, ~dòng 869–878) chỉ nhìn **nguồn bộ soạn khai là đã dùng** (`draft.sources`). Số/khái niệm đúng, có trong đoạn khác của `found` nhưng bộ soạn không khai → bị từ chối **oan** (ADR 017 đã đo 5/24 lượt).
- Ngược lại, khi số có trong một đoạn nguồn nhưng **thuộc chủ đề/khu vực khác** (ví dụ phí ship nội thành 20.000đ áp cho khách ở tỉnh), guard tiền vẫn cho qua → lỗi **thật** không bị bắt (mẫu mixed-11 Hà Nội/nội thành).

## Quyết định: ba tầng, bật bằng cờ `cf.ai.guard_facts` (mặc định TẮT)

**T1 — Fact plan làm đáp án kiểm.** `buildFactPlan` (đã có, chạy độc lập với cờ soạn) cho giá trị chuẩn theo chủ đề. Câu trả lời phải khớp:
- số tiền, ngày, COD/đổi trả/bảo hành trong câu khớp giá trị của plan **cùng chủ đề** khi plan đã biết;
- plan `unknown` do **khu vực không khớp** (khách ở tỉnh, thẻ chỉ có nội thành) mà câu vẫn nêu số → **từ chối** → hành động `clarify` hỏi khu vực (FR-147).

**T2 — Không có thẻ: số phải nguyên văn trong đoạn `found` cùng chủ đề.** Sửa guard tiền/khái niệm để kiểm trên **toàn bộ đoạn `found` cùng chủ đề** (không chỉ `draft.sources`): giảm lỗi oan do nguồn khai thiếu; đồng thời chỉ nhận số từ đoạn đúng chủ đề, không từ đoạn bất kỳ.

**T3 — Giữ nguyên.** Tồn kho chỉ từ `products`/`product_variants`; câu mời nhắn tin chỉ do code viết; FR-160 (pháp lý); FR-140 (nháp không dùng được → chuyển người).

**Thử lại.** Khi T1/T2 từ chối, gọi LLM **lần 2 kèm mã lỗi** (ví dụ `region_mismatch`, `number_not_in_topic`, `concept_unsupported`), nằm trong giới hạn FR-162 (≤ 2 lần gọi LLM/lượt). Lần 2 vẫn hỏng → **câu chuyển hướng theo mẫu** như hiện nay (không bao giờ để câu bị loại đi tiếp).

## File sẽ đọc / sửa (khi được duyệt)

- Sửa: `packages/ai/src/pipeline/run-pipeline.ts` (guard tiền và khái niệm trên `found` cùng chủ đề; vòng gọi lại có mã lỗi; đọc cờ), `packages/ai/src/guard-money.ts` và `guard-support.ts` (nhận tập nguồn mở rộng theo chủ đề), `packages/ai/src/fact-plan/*` (xuất hàm so khớp câu ↔ plan), `packages/ai/src/pipeline/*` (lỗi chuyển cho bộ soạn), module cờ tính năng, `tools/eval` (đo theo cổng bên dưới).
- Không đụng: migration, RLS, trigger, auth, `policy_facts`, ADR 017 (`017-da-khoa.md`, `017-draft-fact-slots.md`).

## Test sẽ thêm

- Hồi quy **T1**: mixed-11 (khách Hà Nội, thẻ chỉ có "nội thành 20.000đ") — câu nêu 20.000đ cho "ngoại tỉnh" bị từ chối → `clarify` hỏi khu vực.
- Hồi quy **T2**: số đúng nằm ở đoạn `found` cùng chủ đề nhưng bộ soạn khai thiếu → không bị từ chối oan; số nằm ở đoạn **khác chủ đề** → bị từ chối.
- Thử lại: lần 2 nhận mã lỗi; lần 2 vẫn hỏng → mẫu chuyển hướng; không bao giờ quá 2 lần gọi LLM/lượt.
- Cờ tắt → hành vi y hệt hiện tại (test so sánh).

## Cổng EVAL (đo bằng cờ BẬT so với cờ TẮT, cùng bộ demo + sswiftly)

Cùng cổng fs-q15, cộng: **"sai giá do áp dụng sai khu vực = 0"**, đo bằng `diagnostics` (số đã nêu so với giá trị plan cùng chủ đề). Không giảm "trả lời đúng" so với cơ sở fs-b0; số mẫu từ chối **oan** giảm so với fs-b0.

## Hệ quả và rủi ro

- Lợi: AI dùng được mọi văn bản đã nạp; lỗi oan giảm; lỗi áp dụng sai khu vực bị bắt theo cấu trúc.
- Rủi ro (chủ dự án chấp nhận): LLM vẫn tự viết sự kiện nên **không có bảo đảm theo thiết kế như ADR 017**; mọi loại lỗi chưa có quy tắc vẫn có thể lọt. Chi phí gọi LLM lần 2 tăng nhẹ ở lượt bị từ chối.
- Diff chạm cổng tự gửi/guard → thuộc diện nhạy cảm: tự kiểm theo `docs/workflows/verify.md`, **không tự merge**.

## Cách đảo ngược

Cờ `cf.ai.guard_facts` (mặc định TẮT): tắt → guard cũ, không đổi hành vi. Không có migration nên không cần đường lùi dữ liệu.

## Số đo cơ sở (fs-b0, cờ TẮT, 1 lượt mỗi bộ)

Đo 09/11/2026 trên `main` hiện tại, cờ `fact_slots` TẮT, 1 lượt mỗi bộ, 0 lần chạy lỗi (`out/fs-b0`, không commit). Chi phí $0,0626 (demo) + $0,0238 (sswiftly) = $0,0864, ghi vào sổ chuỗi 2 (trần 10 USD, ≤ 1 USD/lượt).

| Chỉ số | demo (99 mẫu) | sswiftly (32 mẫu) |
|---|---|---|
| Chọn đúng hành động (FR-147) | 94,6% (35/37) · 87,5% (28/32) · 96,7% (29/30) theo từng nhóm tiếng Việt | 87,5% (28/32) ❌ |
| Sự kiện bắt buộc | 32/36 (88,9%); tồn kho 11/12 | 10/12 (83,3%) |
| Sai giá / bịa giá | 0 | 0 |
| reply_empty | 0 | 0 |
| FR-142 (xưng hô) | 0 | 0 |
| handoff `claim_unsupported` | 2 (`syn2-vi-21`, `syn2-viplain-08`) | 1 (`syn2-en-11`) |
| Mẫu guard tiền từ chối | 0 | 0 |
| Mẫu guard khái niệm từ chối | 1 (`syn2-viplain-29`, khái niệm `cod`) | 0 |

Tách lỗi oan khỏi lỗi thật (đối chiếu số/khái niệm bị bắt với **toàn bộ** đoạn `found`): **oan 0, thật 1.** `syn2-viplain-29` — "COD" không có ở đoạn nào trong `found`, guard chặn đúng và trả câu chuyển hướng. Ba mẫu handoff `claim_unsupported` đều có câu rỗng và KHÔNG do guard tiền/khái niệm bắt (không có dấu vết guard) — nhiều khả năng đi theo đường FR-140 (nháp không dùng được); cần đọc riêng trước khi quy lỗi cho guard.

Lưu ý cho cổng của ADR này: `syn2-mixed-11` (Hà Nội, "nội thành 20.000đ") **trả lời đúng ở lượt này** (khách hỏi ship Hà Nội nên "nội thành Hà Nội 20.000đ" hợp lệ); lỗi áp dụng sai khu vực chưa tái hiện ở lượt cơ sở, nên test hồi quy T1 phải dựng bằng fixture (khách ở tỉnh, thẻ chỉ có nội thành), không dựa vào EVAL tự nhiên. Một lượt mỗi bộ có phương sai: số oan/thật nhỏ này chưa đủ để kết luận tỷ lệ.
