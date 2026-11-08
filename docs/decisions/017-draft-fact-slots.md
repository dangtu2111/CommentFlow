# ADR 017 — DRAFT-FACT-SLOTS: code lập "fact plan", LLM chỉ viết câu với chỗ giữ chỗ

Trạng thái: **ĐỀ XUẤT — chờ chủ dự án duyệt trước khi code** (08/11/2026). Kế hoạch triển khai: `docs/plans/feat-draft-fact-slots.md`.

## Bối cảnh (2–3 câu dễ hiểu)

Hiện nay AI tự viết cả phần "sự kiện" trong câu trả lời (số tiền, ngày, có/không hỗ trợ COD…), rồi các lớp kiểm tra bằng code phải **đoán lại** xem câu đó có đúng nguồn không. Mỗi lần đo lại lòi ra một kiểu lọt/chặn nhầm mới, và ta vá từng mẫu (guard tiền, guard nghĩa, guard phủ định…). Gốc rễ: sự kiện do LLM viết, còn kiến thức chính sách là văn bản thô nên code không có "giá trị chuẩn" để đối chiếu.

## Bằng chứng (đo 08/11/2026, không vá thêm)

1. **Guard nghĩa #287** (`docs/testing/eval-guard-semantic-2026-11-08.md`): chặn đúng COD bịa nhưng gọi nhầm khái niệm ("guarantee" hoàn tiền → "warranty"); nhiều lần phải vá thêm từ khóa/phủ định.
2. **`mixed-11` "sai giá"** ("Tote bag giá bao nhiêu, ship Hà Nội mất mấy ngày?"), phát lại 24 lần bằng EVAL có chẩn đoán (`diagnostics.usedSources/claims`):
   - **5/24 lượt bị bộ đo tính sai giá — số ĐÚNG và CÓ trong nguồn** ("Phí ship nội thành 20.000đ" nằm ở đoạn chính sách ship). Nguyên nhân: claim ghi đúng `source_ids` của đoạn ship nhưng danh sách `sources` bộ soạn trả về chỉ có đoạn sản phẩm, nên guard tiền (kiểm theo `sources`) không thấy 20.000đ → phân loại **(a)** lệch trích nguồn (không phải lọt số bịa; không có ca loại **(b)**).
   - **24/24 lượt đều "đoán"**: khách nói "Hà Nội", nguồn nói "nội thành", kiến thức không nói shop ở đâu; AI tự coi Hà Nội = nội thành và chọn 20.000đ → phân loại **(c)**. Bộ đo không bắt được vì số có trong nguồn.
   - Kết luận: cả hai kiểu lỗi cùng một gốc — sự kiện do LLM chọn/ghép; một lỗi bộ đo đếm thừa, một lỗi bộ đo bỏ sót.
3. **Câu trả lời rỗng + `needs_human`** khi quyết định là `answer` (`viplain-08` mọi lần đo): hai nguồn sự thật (decision vs draft) lệch nhau (gap `DRAFT-NEEDS-HUMAN-ACTION`).

## Quyết định đề xuất

1. **Fact plan do code lập TRƯỚC bước soạn.** Từ câu hỏi đã tách (`asks`/chủ đề), sản phẩm đã khớp, biến thể, vị trí/khu vực khách nêu, code liệt kê các "sự kiện cần nói" và gán giá trị: lấy từ SQL (`products`/`product_variants`: giá, tồn, biến thể) hoặc từ **chính sách có cấu trúc** (ship: khu vực/phí/thời gian/COD; đổi trả: số ngày/điều kiện; bảo hành; thanh toán), hoặc trạng thái **`unknown`** (không xác định). Quy tắc khu vực: giá trị chỉ "xác định" khi khu vực khách nêu khớp một dòng khu vực có cấu trúc (Hà Nội ≠ "nội thành" trừ khi shop khai Hà Nội thuộc nội thành); không khớp → `unknown`.
2. **LLM chỉ viết câu với chỗ giữ chỗ `{fact:<id>}`.** Prompt đưa danh sách id sự kiện (không đưa giá trị thô). Guard **từ chối cứng** (không gọi LLM sửa) nếu ngoài chỗ giữ chỗ có: chữ số, số viết bằng chữ cạnh đơn vị tiền/thời gian (vd "hai ngày", "ba mươi nghìn"), đơn vị tiền/% trần, khẳng định có/không về khái niệm trong từ điển (COD, đổi trả, hoàn tiền, bảo hành, trả góp, hóa đơn, ship quốc tế). Code **điền** giá trị theo định dạng tiền tệ/ngôn ngữ (vi: `99.000đ`, en: `$58.90`) và cụm có/không theo ngôn ngữ.
3. **`unknown` → code chèn câu mời** theo `brand_voice.handoff_templates` (FR-141; xưng hô cấu hình, trong/ngoài giờ qua `resolveInvitation`) và ghi `unanswered_topics`. LLM không được tự viết câu "chưa có thông tin" cho sự kiện này; AI vẫn trả lời phần xác định (vd giá sản phẩm).
4. **Chính sách có cấu trúc** là nguồn chuẩn của các sự kiện chính sách; **văn bản thô vẫn giữ** làm nguồn diễn giải (câu không có số/khẳng định). Thẻ nhập tay (Owner) trong trang Cơ sở kiến thức (mục "Chính sách", `design/stitch/knowledge-base.png` §7.3 chưa có màn hình thẻ có cấu trúc → ghi `docs/plans/ui-thieu-thiet-ke.md`, tạo bằng Stitch); nhập từ Shopify: AI **đề xuất** điền thẻ, mỗi giá trị đề xuất phải xuất hiện nguyên văn trong văn bản nguồn (code kiểm), **Owner duyệt** mới có hiệu lực.
5. **Claims và `sources` do code suy ra từ chỗ giữ chỗ** (mỗi `{fact:id}` đã biết nguồn của nó), không để model tự khai `source_ids`/`sources` cho sự kiện → loại bỏ cả lớp lỗi (a).

## Phần nào thay, phần nào giữ

| Hạng mục | Số phận |
|---|---|
| **GUARD-SEMANTIC-SUPPORT** (#287: `checkConceptSupport`, phủ định, `unsupportedConceptReply`) | **Giữ làm lớp phòng thủ** cho câu tự do; vai trò đổi từ "đoán nguồn" thành "bắt khái niệm nhắc ngoài chỗ giữ chỗ" (từ chối cứng). Phần câu mẫu chuyển hướng bị thay bằng chèn theo `handoff_templates` |
| **guard-money / guard §4** | Giữ; đơn giản hơn: mọi số ngoài chỗ giữ chỗ = vi phạm cứng; số trong chỗ giữ chỗ luôn khớp nguồn theo cấu tạo |
| **GUARD-REDIRECT-TEMPLATE**, **GUARD-GUARANTEE-WORD** | Được gộp/giải quyết bởi mục 3 và từ điển khái niệm có cấu trúc |
| **(4) nguồn theo từng ý hỏi** | Thay bằng fact plan theo từng ý hỏi (gộp) |
| **FR-160 nhóm y tế/FDA** | Giữ: loại sự kiện `legal_claim` luôn `unknown` → chuyển người/mời ib |
| **STOCK-DISCLOSURE-OPTION** | Khớp tự nhiên: sự kiện `stock` có chế độ hiển thị do code chọn (còn/hết · số lượng · "sắp hết khi ≤ N") theo tùy chọn Owner |
| **(6) mã chủ đề enum** | Giữ và cần: quyết định sự kiện nào vào fact plan |
| **(7) reply_language** | Giữ và cần: ngôn ngữ điền giá trị + câu mời |
| **(1b) khớp sản phẩm** | Giữ; kết quả khớp là đầu vào fact plan |
| **FR-140** (trích nguồn từng ý) | Đổi cách thực hiện: `claims`/`source_ids` do code sinh từ chỗ giữ chỗ; câu diễn giải không có sự kiện = `greeting`/`question_back` |
| **FR-141** (trả lời một phần + mời) | Thực thi bằng code (mục 3), không còn phụ thuộc LLM |
| **FR-161** (3–5 biến thể) | Giữ; mọi biến thể phải dùng **cùng tập chỗ giữ chỗ** (guard kiểm), code điền → biến thể chỉ khác lời văn, không khác sự kiện; chọn biến thể sạch trở nên không cần cho sự kiện |
| **FR-162** (≤ 2 lần gọi LLM/lượt) | Giữ; fact plan là code thuần (0 lần gọi) |
| Migration | **Cần** (bảng chính sách có cấu trúc + RLS) — xem plan; thuộc diện chủ dự án kiểm chéo, không tự merge |

## Hệ quả và rủi ro

- Lợi: không còn sự kiện do LLM viết → "0 sai giá / 0 bịa chính sách" đạt **theo thiết kế**, không phụ thuộc đoán từ khóa; hành vi dễ đo, dễ giải thích cho Owner ("AI chỉ viết lời, số liệu do hệ thống điền").
- Giá phải trả: (1) shop chưa điền thẻ chính sách → nhiều sự kiện `unknown` → AI mời ib nhiều hơn (an toàn nhưng giảm tỷ lệ trả lời) — giảm bằng đề xuất tự điền từ văn bản/Shopify + Owner duyệt; (2) câu văn LLM bị ràng buộc hơn (chất lượng lời văn cần đo); (3) guard "số viết bằng chữ" có thể chặn nhầm vài cách nói (đo và hiệu chỉnh danh sách đơn vị); (4) thêm UI nhập thẻ có cấu trúc (cần màn Stitch).
- Phương án thay thế đã cân nhắc: tiếp tục vá guard theo từng mẫu — bị loại vì mỗi vòng đo lại phát sinh biến thể mới, không có bảo đảm theo thiết kế.

## Cách đảo ngược

Cờ tính năng (mặc định TẮT cho đến khi đo đạt): tắt → pipeline cũ (guard hiện tại). Bảng cấu trúc chỉ-thêm, có thể bỏ không dùng.
