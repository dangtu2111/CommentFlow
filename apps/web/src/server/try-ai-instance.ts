import { createTryQuota } from '@flow/ai';
import { createTryAiAction } from './try-ai';
import { createRealKnowledgeRunner, createRealTryLlm } from './try-ai-runtime';

/**
 * MỘT bản "Thử AI" dùng chung cho ô Thử AI và nút "Thử lại câu này" ở trang dữ liệu còn thiếu: cùng bộ đếm lượt thử/ngày, cùng LLM thật (ghi `ai_usage` như nhau),
 * cùng kiến thức thật của workspace; thiếu dịch vụ → báo rõ, không bản mẫu (Q-ATB1).
 */
export const tryAi = createTryAiAction({
  quota: createTryQuota(),
  llm: createRealTryLlm(process.env),
  knowledgeRunner: createRealKnowledgeRunner(process.env),
});
