import { COMMENT_LABELS, type MaskedText, unsafeMarkMasked } from '@flow/shared';
import { FACT_TOPICS } from '../fact-plan/types';
import type { LlmMessage } from '../llm-client';
import { HISTORY_GUIDANCE, type PromptHistory, renderHistoryBlock } from '../prompt-history';

const MAX_TEXT_CHARS = 2000;

export type ExtractInput = {
  workspaceId: string;
  /** Bình luận ĐÃ che PII (nguyên tắc #6). */
  text: MaskedText;
  /** Khách đính kèm ảnh/video/sticker (FR-143) — giúp đánh dấu `refers_to_image`. */
  hasMedia?: boolean;
  /** Lịch sử hội thoại ĐÃ che PII (Q-POR12): để hiểu câu ngắn như "M đen" sau khi shop hỏi size/màu. */
  history?: PromptHistory;
};

// Chuỗi CỐ ĐỊNH (không chứa nội dung khách) nên được đánh dấu đã che.
const SYSTEM_PROMPT = unsafeMarkMasked(
  [
    'Bạn phân loại và tách thông tin từ MỘT bình luận của khách trên bài bán hàng. Chỉ trả về MỘT object JSON, không giải thích.',
    `labels: mảng {label}, label thuộc: ${COMMENT_LABELS.join(', ')} (price=hỏi giá, advice=xin tư vấn gồm hỏi ship/vận chuyển/đổi trả/size/tồn kho, purchase=muốn mua/đặt, complaint=khiếu nại, spam, other). Nhãn chính đặt ĐẦU mảng. Một câu nhiều ý thì trả nhiều nhãn. KHÔNG ghi điểm tin cậy.`,
    'product_mentions: mảng tên sản phẩm khách nhắc. refers_to_image: true nếu câu phụ thuộc ảnh/video đính kèm.',
    'size, color: chuỗi hoặc null. height_cm, weight_kg: số hoặc null. qty: số nguyên hoặc null. cited_price_vnd: giá khách nhắc (số nguyên VND) hoặc null.',
    'order_intent: null nếu không đặt hàng, ngược lại {items: mảng chuỗi, phone: null, address: chuỗi hoặc null}. Văn bản đã che số điện thoại/email: không đoán.',
    'asks: mảng các ý khách hỏi (ví dụ giá, size, màu, tồn kho, ship).',
    `topics: mảng chủ đề sự kiện câu hỏi THẬT SỰ hỏi, chỉ chọn trong: ${FACT_TOPICS.join(', ')}. Quy tắc: price=hỏi giá; stock=còn/hết hàng, còn mấy cái; ship_fee=phí ship; ship_time=bao lâu nhận hàng; ship_destination=hỏi có giao tới nơi X không ("do you ship to Canada") — KHÔNG kèm ship_fee/ship_time nếu không hỏi phí/thời gian; cod=thanh toán khi nhận hàng; returns=đổi trả trong mấy ngày/có đổi trả không; refund_to=tiền hoàn về đâu ("refund to my card"); return_shipping=ai trả phí ship khi trả hàng; return_eligibility=mặt hàng nào đổi trả được; defect=hàng lỗi/hỏng/sai hàng/damaged/defective/wrong item (KHÔNG phải đổi trả vì không vừa); warranty=bảo hành ("guarantee a refund" là returns/refund_to, KHÔNG phải warranty); payment=hình thức thanh toán. Không hỏi gì thuộc các chủ đề này thì mảng rỗng.`,
    'destination: tên nơi khách muốn giao tới nếu có (vd "Canada", "Hawaii", "Hà Nội"), không thì null.',
    'Chỉ tách thông tin có trong bình luận; không có thì null/mảng rỗng. Không bịa số.',
  ].join('\n'),
);

/** Dựng tin nhắn gửi LLM: system cố định + bình luận đã che (cắt ở 2000 ký tự). */
export function buildExtractMessages(input: ExtractInput): LlmMessage[] {
  const body = input.text.slice(0, MAX_TEXT_CHARS);
  const media = input.hasMedia ? '\n[Khách có đính kèm ảnh/video]' : '';
  const history = renderHistoryBlock(input.history);
  const prefix = history === null ? '' : `${HISTORY_GUIDANCE}\n${history}\n`;
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: unsafeMarkMasked(`${prefix}Bình luận:\n${body}${media}`) as MaskedText,
    },
  ];
}
