import { type MaskedText, unsafeMarkMasked } from '@flow/shared';
import type { LlmMessage } from '../llm-client';
import type { CustomerContext } from './customer-context';
import type { RuleQueryInput } from './rewrite-query';

export type RewriteInput = RuleQueryInput & {
  workspaceId: string;
  /** Đã nhận được sản phẩm (từ bài gắn sản phẩm hoặc `extract`) — có thì không cần LLM. */
  productKnown: boolean;
  context?: CustomerContext;
};

const MAX_PART_CHARS = 400;

// Chuỗi CỐ ĐỊNH (không chứa nội dung khách) nên được đánh dấu đã che.
const SYSTEM_PROMPT = unsafeMarkMasked(
  [
    'Bạn viết lại MỘT câu hỏi ngắn/mơ hồ của khách thành MỘT câu tìm kiếm đầy đủ, tự đứng được, bằng tiếng của khách.',
    'Dùng bình luận cha, caption bài và các lượt trước để thay đại từ ("nó", "cái này", "còn không") bằng đối tượng cụ thể.',
    'KHÔNG thêm "bài này", "bài đăng", "in this post" hay ngữ cảnh bài viết nếu dưới đây không có dòng "Caption bài" hoặc "Sản phẩm gắn bài" — khách chưa nhắc tới bài viết nào.',
    'Chỉ trả về đúng câu tìm kiếm, một dòng, không giải thích. Không bịa giá, size, màu hay sản phẩm không có trong ngữ cảnh.',
  ].join('\n'),
);

const cut = (text: string) => text.slice(0, MAX_PART_CHARS);

/** Dựng tin nhắn gửi LLM: system cố định + ngữ cảnh đã che (mỗi phần cắt 400 ký tự). */
export function buildRewriteMessages(input: RewriteInput): LlmMessage[] {
  const lines = [`Bình luận: ${cut(input.comment)}`];
  if (input.parentComment) lines.push(`Bình luận cha: ${cut(input.parentComment)}`);
  if (input.postCaption) lines.push(`Caption bài: ${cut(input.postCaption)}`);
  if (input.productName) lines.push(`Sản phẩm gắn bài: ${cut(input.productName)}`);
  for (const turn of input.context?.turns ?? []) {
    lines.push(`${turn.from === 'shop' ? 'Shop' : 'Khách'} (trước đó): ${cut(turn.text)}`);
  }
  for (const q of input.context?.otherQuestions ?? []) {
    lines.push(`Khách hỏi ở bài khác: ${cut(q.text)}`);
  }
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: unsafeMarkMasked(lines.join('\n')) as MaskedText },
  ];
}
