import { AppError, COMMENT_LABELS } from '@flow/shared';
import { EXTRACT_UNREADABLE_MESSAGE } from './classify/extract-result';
import { CLAIM_KINDS, DRAFT_LANGS, DRAFT_UNREADABLE_MESSAGE } from './draft/draft-result';
import { FACT_TOPICS } from './fact-plan/types';

/**
 * Đầu ra có cấu trúc của LLM (docs/09 §4): dùng structured output GỐC qua LiteLLM (`response_format: json_schema`) để
 * giảm JSON hỏng; LiteLLM (`drop_params: true`) tự bỏ tham số mà model không hỗ trợ — khi đó bộ đọc Zod vẫn kiểm lại
 * từng trường. Schema viết tay ở dạng `strict` (mọi trường bắt buộc, `additionalProperties: false`).
 */
export type ResponseFormat = { name: string; schema: Record<string, unknown> };

const stringList = { type: 'array', items: { type: 'string' } } as const;

export const EXTRACT_RESPONSE_FORMAT: ResponseFormat = {
  name: 'cf_extract',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'labels',
      'product_mentions',
      'refers_to_image',
      'size',
      'color',
      'height_cm',
      'weight_kg',
      'qty',
      'cited_price_vnd',
      'order_intent',
      'asks',
      'topics',
      'destination',
    ],
    properties: {
      labels: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label'],
          properties: { label: { type: 'string', enum: [...COMMENT_LABELS] } },
        },
      },
      product_mentions: stringList,
      refers_to_image: { type: 'boolean' },
      size: { type: ['string', 'null'] },
      color: { type: ['string', 'null'] },
      height_cm: { type: ['number', 'null'] },
      weight_kg: { type: ['number', 'null'] },
      qty: { type: ['integer', 'null'] },
      cited_price_vnd: { type: ['integer', 'null'] },
      order_intent: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            additionalProperties: false,
            required: ['items', 'phone', 'address'],
            properties: {
              items: stringList,
              phone: { type: 'null' },
              address: { type: ['string', 'null'] },
            },
          },
        ],
      },
      asks: stringList,
      topics: { type: 'array', items: { type: 'string', enum: [...FACT_TOPICS] } },
      destination: { type: ['string', 'null'] },
    },
  },
};

export const DRAFT_RESPONSE_FORMAT: ResponseFormat = {
  name: 'cf_draft',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'reply',
      'lang',
      'sources',
      'claims',
      'unanswered_topics',
      'needs_human',
      'reason',
      'variants',
    ],
    properties: {
      reply: { type: 'string' },
      lang: { type: 'string', enum: [...DRAFT_LANGS] },
      sources: stringList,
      claims: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'source_ids', 'kind'],
          properties: {
            text: { type: 'string' },
            source_ids: stringList,
            kind: { type: 'string', enum: [...CLAIM_KINDS] },
          },
        },
      },
      unanswered_topics: stringList,
      needs_human: { type: 'boolean' },
      reason: { type: 'string' },
      variants: stringList,
    },
  },
};

/** Lỗi do ĐẦU RA của AI không đọc được/sai schema (khác lỗi mạng/khóa): bước sau chuyển người (FR-032). */
export function isUnreadableAiOutput(error: unknown): boolean {
  return (
    error instanceof AppError &&
    error.code === 'LLM_UNAVAILABLE' &&
    (error.message === EXTRACT_UNREADABLE_MESSAGE || error.message === DRAFT_UNREADABLE_MESSAGE)
  );
}
