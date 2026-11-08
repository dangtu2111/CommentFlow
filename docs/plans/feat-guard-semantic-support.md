# Kế hoạch `feat/guard-semantic-support` — Guard kiểm NGHĨA: không bịa chính sách có/không

Mã gap matrix: `GUARD-SEMANTIC-SUPPORT` · Tiếp theo `docs/plans/feat-ml-rerank.md` (#286, đã merge).

**Tóm tắt:** Sau rerank, câu COD không dấu vẫn được trả lời "Shop có hỗ trợ ship COD" dựa vào đoạn chỉ có phí ship — bịa chính sách, nghiêm trọng như sai giá. Việc này thêm guard bằng code: câu khẳng định COD / ship quốc tế (hoặc nước cụ thể) / trả góp / hóa đơn / đổi trả / hoàn tiền / bảo hành phải được các nguồn đã dùng NÊU khái niệm đó; không thì bỏ bản nháp, soạn lại theo "ý chưa có nguồn" (chuyển hướng), vẫn bịa thì chuyển người. Rủi ro thấp: chỉ thêm một lớp chặn; có thể chặn nhầm câu đúng nhưng nguồn dùng từ khác (hướng an toàn, ghi `claim_unsupported`).

## Điểm chưa rõ

Không có (chủ dự án chốt 08/11/2026: khái niệm kiểm, từ khóa vi+en theo chủ đề, loại ý → redirect/handoff, test 4 biến thể COD + ship quốc tế + trả góp; ghi gap (a)(b)).

## Tiêu chí nghiệm thu

1. `checkConceptSupport`: khẳng định khái niệm mà nguồn không nêu → vi phạm; nguồn có nêu (kể cả nhiều nguồn, hoặc đúng nước) → hợp lệ; câu "chưa có thông tin"/ib shop/câu hỏi lại → không bị coi là khẳng định — kiểm bằng: `guard-support.test.ts`.
2. Pipeline: 4 biến thể COD + "ship quốc tế không" + "có trả góp không" với nguồn chỉ có phí ship → không câu nào khẳng định (soạn lại thành chuyển hướng; vẫn bịa → handoff `claim_unsupported`); câu hỏi phí ship vẫn trả lời bình thường — kiểm bằng: `claim-support.test.ts`.
3. EVAL 3 lượt: `viplain-29` không còn trả lời bằng đoạn ship; an toàn/sai giá không xấu đi — kiểm bằng: `pnpm --filter @flow/eval run evaluate`.

## File sẽ sửa

`packages/ai/src/{guard-support.ts,pipeline/run-pipeline.ts,decide/decide-action.ts}`, `apps/web/.../comment-detail.tsx` + i18n vi/en (lý do hiển thị), docs.

## Migration

Không có.

## Cần kiểm chứng độc lập không?

Không (không đổi auth/RLS/thanh toán/cổng tự gửi; thêm lớp chặn trước cổng).

## Rủi ro / câu hỏi cho chủ dự án

Không có.

## Complexity tracking

Không có.

## Trạng thái duyệt

Đã duyệt (yêu cầu của chủ dự án 08/11/2026).
