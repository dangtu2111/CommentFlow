import { type MaskedText, maskPii } from '@flow/shared';
import { checkGuardMoney } from '../guard-money';
import type { LlmClient } from '../llm-client';
import { buildCaptionMessages, buildHashtagMessages } from './caption-prompt';

export const CAPTION_STEP = 'caption';
export const HASHTAG_STEP = 'hashtags';
/** Đổi khi sửa prompt (ghi vào `ai_usage.prompt_version`). */
export const CAPTION_PROMPT_VERSION = 'caption@1';
export const HASHTAG_PROMPT_VERSION = 'hashtags@1';
export const MAX_IDEA_CHARS = 4000;
export const MAX_GENERATED_CAPTION_CHARS = 2000;
export const MAX_HASHTAGS = 8;

export type CaptionInput = { workspaceId: string; draft: string };
export type CaptionResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'empty_input' | 'empty' | 'unsupported_claims' };
export type HashtagResult =
  | { ok: true; hashtags: string[] }
  | { ok: false; reason: 'empty_input' | 'empty' };

/**
 * Soạn caption / gợi ý hashtag cho bài đăng (POST-PUBLISHING). AI chỉ GỢI Ý văn bản; người dùng đọc, sửa và tự bấm đăng (nguyên tắc #3). Ý tưởng được che PII trước khi gửi LLM (#6);
 * mọi lần gọi ghi `ai_usage` qua `LlmClient` (#7). Con số/phần trăm/ngày/SĐT/email/liên kết trong caption PHẢI có trong ý tưởng người dùng (cùng `checkGuardMoney` của pipeline, #4):
 * AI tự thêm → từ chối, không trả nội dung. Đúng MỘT `llm.call` mỗi lần; lỗi của `llm.call` được ném nguyên.
 */
export interface Captioner {
  suggestCaption(input: CaptionInput): Promise<CaptionResult>;
  suggestHashtags(input: CaptionInput): Promise<HashtagResult>;
}

/** Bỏ khối code, dấu nháy bao ngoài, khoảng trắng thừa; cắt độ dài. */
function cleanCaption(raw: string): string {
  const unfenced = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '');
  const unquoted = unfenced.trim().replace(/^["“”‘’]+|["“”‘’]+$/g, '');
  return unquoted.trim().slice(0, MAX_GENERATED_CAPTION_CHARS);
}

const HASHTAG = /#[\p{L}\p{N}_]{2,30}/gu;

function readHashtags(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of raw.match(HASHTAG) ?? []) {
    const key = match.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(match);
    if (result.length >= MAX_HASHTAGS) break;
  }
  return result;
}

export function createLlmCaptioner(options: { llm: LlmClient; model: string }): Captioner {
  const prepare = (draft: string): MaskedText | null => {
    const trimmed = draft.trim().slice(0, MAX_IDEA_CHARS);
    return trimmed === '' ? null : maskPii(trimmed);
  };
  return {
    async suggestCaption(input) {
      const idea = prepare(input.draft);
      if (idea === null) return { ok: false, reason: 'empty_input' };
      const result = await options.llm.call({
        workspaceId: input.workspaceId,
        step: CAPTION_STEP,
        model: options.model,
        promptVersion: CAPTION_PROMPT_VERSION,
        messages: buildCaptionMessages(idea),
        temperature: 0.7,
        maxTokens: 500,
      });
      const text = cleanCaption(result.text);
      if (text === '') return { ok: false, reason: 'empty' };
      // Mọi số/giá/ngày/SĐT/email/liên kết trong caption phải xuất hiện trong ý tưởng của người dùng.
      if (!checkGuardMoney({ reply: text, sources: [idea] }).ok) {
        return { ok: false, reason: 'unsupported_claims' };
      }
      return { ok: true, text };
    },

    async suggestHashtags(input) {
      const content = prepare(input.draft);
      if (content === null) return { ok: false, reason: 'empty_input' };
      const result = await options.llm.call({
        workspaceId: input.workspaceId,
        step: HASHTAG_STEP,
        model: options.model,
        promptVersion: HASHTAG_PROMPT_VERSION,
        messages: buildHashtagMessages(content),
        temperature: 0.5,
        maxTokens: 120,
      });
      const hashtags = readHashtags(result.text);
      return hashtags.length === 0 ? { ok: false, reason: 'empty' } : { ok: true, hashtags };
    },
  };
}
