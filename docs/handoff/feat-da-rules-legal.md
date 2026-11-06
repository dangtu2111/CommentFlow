# Bàn giao `feat-da-rules-legal` — DA-RULES-LEGAL (FR-160)

Agent vừa làm: Claude Code (làn c).

## Đã làm

- `packages/ai/src/decide/legal-rules.ts` + test (property-based); export ở `index.ts`; docs (gap-matrix, MASTER, codemap, Q-DRL1, KT-DRL).

## Đã đọc và rút ra

- `decideAction` đã có `risks.legalUnsourced` → `handoff`/`legal_unsourced` (không sửa). `foldText` bỏ dấu nên "vật"→"vat": VAT xét chữ gốc.

## Còn lại

- `DA-RULES-LEGAL-WIRE`: nối vào pipeline (gọi `evaluateLegalRules` với đoạn nguồn đã tìm; `checkDraftLegal` trên nháp trước cổng tự gửi); ghi `kb_gaps` chủ đề `policy`.
- Nhóm câu đánh giá FR-160 (`AI-EVAL-*`).
- Giới hạn đã biết từ verifier-security (Nên sửa, chưa làm): (1) nguồn phủ định ("không bảo hành") vẫn tính là nguồn → nên gắn sẵn `topic` cho đoạn nguồn ở bước nối; (2) thời hạn/% chưa gắn với đúng nhóm trong câu (nguồn "bảo hành 12 tháng" cho phép nháp "hoàn tiền 12 tháng"); (3) "1 năm" ≠ "12 tháng" (chặn thừa, an toàn); (4) `try-pipeline.ts` vẫn đặt cứng `legalUnsourced:false` — thay bằng `evaluateLegalRules` khi nối.
- Đã vá sau verifier: mở rộng từ khóa/tiếng Anh theo gốc từ, NFKC + bỏ ký tự rộng 0 + `-._`, `VAT10%`/`V.A.T`, số bằng chữ/tuần/giờ/"30-day"/"trọn đời"/%, trần độ dài (20.000 ký tự, 100 nguồn), bỏ export `detectLegalTopics` khỏi `index.ts`.
