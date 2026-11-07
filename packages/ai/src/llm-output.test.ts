import { AppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import {
  EXTRACT_UNREADABLE_MESSAGE,
  extractResultSchema,
  parseExtractOutput,
} from './classify/extract-result';
import {
  DRAFT_UNREADABLE_MESSAGE,
  draftResultSchema,
  parseDraftOutput,
} from './draft/draft-result';
import { DRAFT_RESPONSE_FORMAT, EXTRACT_RESPONSE_FORMAT, isUnreadableAiOutput } from './llm-output';

const props = (format: { schema: Record<string, unknown> }) =>
  Object.keys(format.schema.properties as Record<string, unknown>).sort();

describe('09 §4 structured output: schema strict khớp bộ đọc Zod', () => {
  it('extract: mọi trường của Zod đều có trong schema, đều bắt buộc, không cho thừa', () => {
    expect(props(EXTRACT_RESPONSE_FORMAT)).toEqual(Object.keys(extractResultSchema.shape).sort());
    expect([...(EXTRACT_RESPONSE_FORMAT.schema.required as string[])].sort()).toEqual(
      props(EXTRACT_RESPONSE_FORMAT),
    );
    expect(EXTRACT_RESPONSE_FORMAT.schema.additionalProperties).toBe(false);
  });

  it('draft: trường của schema = trường bộ đọc trả về; đều bắt buộc', () => {
    const sample = draftResultSchema.parse({
      reply: 'Dạ ok',
      lang: 'vi',
      sources: [],
      claims: [],
      unanswered_topics: [],
      needs_human: false,
      reason: '',
      variants: [],
    });
    expect(props(DRAFT_RESPONSE_FORMAT)).toEqual(Object.keys(sample).sort());
    expect([...(DRAFT_RESPONSE_FORMAT.schema.required as string[])].sort()).toEqual(
      props(DRAFT_RESPONSE_FORMAT),
    );
    expect(DRAFT_RESPONSE_FORMAT.schema.additionalProperties).toBe(false);
  });

  it('một đầu ra đúng schema đọc được bằng Zod (extract và draft)', () => {
    const extract = {
      labels: [{ label: 'advice' }],
      product_mentions: [],
      refers_to_image: false,
      size: null,
      color: null,
      height_cm: null,
      weight_kg: null,
      qty: null,
      cited_price_vnd: null,
      order_intent: null,
      asks: ['ship'],
    };
    expect(parseExtractOutput(JSON.stringify(extract)).labels[0]?.label).toBe('advice');
    const draft = {
      reply: 'Dạ shop giao 2-4 ngày ạ',
      lang: 'vi',
      sources: ['kb1'],
      claims: [{ text: 'giao 2-4 ngày', source_ids: ['kb1'], kind: 'fact' }],
      unanswered_topics: [],
      needs_human: false,
      reason: '',
      variants: [],
    };
    expect(parseDraftOutput(JSON.stringify(draft)).reply).toContain('giao');
  });
});

describe('FR-032 isUnreadableAiOutput: phân biệt đầu ra hỏng với lỗi mạng/khóa', () => {
  it('đúng với lỗi "không đọc được" của extract và draft', () => {
    expect(isUnreadableAiOutput(new AppError('LLM_UNAVAILABLE', EXTRACT_UNREADABLE_MESSAGE))).toBe(
      true,
    );
    expect(isUnreadableAiOutput(new AppError('LLM_UNAVAILABLE', DRAFT_UNREADABLE_MESSAGE))).toBe(
      true,
    );
  });

  it('sai với lỗi mạng, lỗi khóa, lỗi thường, giá trị lạ', () => {
    expect(
      isUnreadableAiOutput(new AppError('LLM_UNAVAILABLE', 'Không kết nối được dịch vụ AI.')),
    ).toBe(false);
    expect(isUnreadableAiOutput(new AppError('CONFIG_INVALID', EXTRACT_UNREADABLE_MESSAGE))).toBe(
      false,
    );
    expect(isUnreadableAiOutput(new Error(EXTRACT_UNREADABLE_MESSAGE))).toBe(false);
    expect(isUnreadableAiOutput('x')).toBe(false);
  });
});
