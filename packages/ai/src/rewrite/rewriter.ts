import { type MaskedText, maskPii } from '@flow/shared';
import type { LlmClient } from '../llm-client';
import { buildRewriteMessages, type RewriteInput } from './rewrite-prompt';
import { buildRuleQuery, needsLlmRewrite } from './rewrite-query';

export const REWRITE_STEP = 'rewrite';
/** Đổi khi sửa prompt (ghi vào `ai_usage.prompt_version`). */
export const REWRITE_PROMPT_VERSION = 'rewrite@1';
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
      const query = readRewriteOutput(result.text);
      if (query === null) return ruleResult(input);
      return { original: input.comment, searchQuery: query, source: 'llm' };
    },
  };
}
