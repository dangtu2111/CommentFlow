import { type MaskedText, maskPii } from '@flow/shared';
import type { LlmClient } from '../llm-client';
import { buildRewriteMessages, type RewriteInput } from './rewrite-prompt';
import { buildRuleQuery, needsLlmRewrite } from './rewrite-query';

export const REWRITE_STEP = 'rewrite';
/** Đổi khi sửa prompt (ghi vào `ai_usage.prompt_version`). */
export const REWRITE_PROMPT_VERSION = 'rewrite@2'; // @2: không thêm ngữ cảnh "bài này" khi lượt không có bài viết
export const MAX_LLM_QUERY_CHARS = 200;

export type { RewriteInput };

export type RewriteResult = {
  /** Câu gốc của khách — vẫn dùng để soạn trả lời (FR-137). */
  original: MaskedText;
  /** Câu dùng để tìm kiếm; lưu (đã che PII) trong `retrieval_logs`. */
  searchQuery: MaskedText;
  source: 'rule' | 'llm';
};

/** Một bước viết lại câu hỏi theo ngữ cảnh (FR-137). Có bản LLM và bản fixture. */
export interface Rewriter {
  rewrite(input: RewriteInput): Promise<RewriteResult>;
}

/** Lấy dòng đầu của đầu ra LLM, bỏ dấu nháy bao ngoài, che PII lại, cắt độ dài. Rỗng → null. */
function readRewriteOutput(text: string): MaskedText | null {
  const firstLine = text.split('\n').find((line) => line.trim() !== '') ?? '';
  const unquoted = firstLine.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
  const query = maskPii(unquoted).slice(0, MAX_LLM_QUERY_CHARS).trim();
  return query === '' ? null : (query as MaskedText);
}

// Cụm "trong bài này / in this post / shown in this post…" mà LLM hay tự thêm. Chỉ bỏ khi lượt KHÔNG có bài viết (không caption, không sản phẩm gắn bài):
// cụm này đưa từ thừa vào câu tìm kiếm, làm lệch kết quả (EVAL en-06: "Do you ship the product shown in this post to Canada?" → từ chối oan).
const POST_PHRASE_EN =
  /\s+(?:(?:shown|featured|displayed|pictured|mentioned|listed|advertised|seen)\s+)?(?:in|on|from)\s+(?:this|that|the)\s+(?:post|listing|photo|picture|video|ad|advert)(?![\p{L}\p{N}])/giu;
const POST_PHRASE_VI =
  /\s+(?:(?:trong|ở|của|trên)\s+)?(?:bài\s+(?:đăng|viết|post)|bài)\s+(?:này|đăng này|viết này)(?![\p{L}\p{N}])/giu;

/** Bỏ cụm "bài này" khỏi câu tìm kiếm khi lượt không có bài viết. Câu có bài viết giữ nguyên. */
export function stripPostReference(query: string, input: RewriteInput): string {
  if (input.postCaption || input.productName) return query;
  const stripped = query
    .replace(POST_PHRASE_EN, '')
    .replace(POST_PHRASE_VI, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return stripped === '' ? query : stripped;
}

export function ruleResult(input: RewriteInput): RewriteResult {
  return {
    original: input.comment,
    searchQuery: buildRuleQuery(input),
    source: 'rule',
  };
}

/**
 * Bản LLM: không đủ điều kiện (`needsLlmRewrite`) → KHÔNG gọi LLM. Đủ điều kiện → ĐÚNG MỘT `llm.call`;
 * đầu ra rỗng → quay về câu quy tắc (bước này chỉ phục vụ tìm kiếm); lỗi của `llm.call` được ném nguyên.
 */
export function createLlmRewriter(options: { llm: LlmClient; model: string }): Rewriter {
  return {
    async rewrite(input) {
      if (!needsLlmRewrite(input)) return ruleResult(input);
      const result = await options.llm.call({
        workspaceId: input.workspaceId,
        step: REWRITE_STEP,
        model: options.model,
        promptVersion: REWRITE_PROMPT_VERSION,
        messages: buildRewriteMessages(input),
        temperature: 0,
        maxTokens: 120,
      });
      const raw = readRewriteOutput(result.text);
      if (raw === null) return ruleResult(input);
      const query = stripPostReference(raw, input) as MaskedText;
      return { original: input.comment, searchQuery: query, source: 'llm' };
    },
  };
}
