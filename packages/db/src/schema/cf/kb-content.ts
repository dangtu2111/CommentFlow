import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';

/** Phạm vi ngôn ngữ của mục nhập tay (FR-050): `all` = cả hai. Khớp `CONTENT_LANGS` ở `@flow/shared`. */
export const KB_CONTENT_LANGS = ['vi', 'en', 'all'] as const;
export const KB_POLICY_KINDS = ['shipping', 'return', 'warranty', 'payment', 'other'] as const;
export const BRAND_VOICE_LANGS = ['vi', 'en'] as const;
export const BRAND_SHOP_PRONOUNS = ['em', 'shop', 'minh', 'custom'] as const;
export const BRAND_CUSTOMER_ADDRESSES = ['anh_chi', 'ban', 'quy_khach', 'you'] as const;

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));
const workspaceCol = () =>
  uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' });

/** Thông tin cửa hàng (FR-050), một dòng cho mỗi (workspace, ngôn ngữ). Không có giá/tồn. */
export const shopProfiles = cf.table(
  'shop_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceCol(),
    lang: text('lang').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    address: text('address'),
    openingHours: text('opening_hours'),
    contact: text('contact'),
    website: text('website'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('shop_profiles_workspace_lang_unique').on(t.workspaceId, t.lang),
    check('shop_profiles_lang_check', sql`${t.lang} in (${inList(KB_CONTENT_LANGS)})`),
  ],
);

/** Chính sách (vận chuyển, đổi trả, bảo hành, thanh toán…) — FR-050. */
export const policyItems = cf.table(
  'policy_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceCol(),
    kind: text('kind').notNull(),
    lang: text('lang').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('policy_items_workspace_idx').on(t.workspaceId, t.kind),
    check('policy_items_lang_check', sql`${t.lang} in (${inList(KB_CONTENT_LANGS)})`),
    check('policy_items_kind_check', sql`${t.kind} in (${inList(KB_POLICY_KINDS)})`),
    check('policy_items_content_check', sql`char_length(${t.content}) between 1 and 8000`),
  ],
);

/** Bản gốc FAQ nhập tay (docs/10 §3.4 `faq_items`). */
export const faqItems = cf.table(
  'faq_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceCol(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    lang: text('lang').notNull(),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    /** KB-DISTILL (0084): `published` = vào kiến thức khi đồng bộ; `draft` = máy chắt lọc, chờ Owner duyệt (chưa vào tìm kiếm). Mục nhập tay luôn `published`. */
    status: text('status').notNull().default('published'),
    /** `faq` (câu hỏi/đáp) hoặc `product_attr` (thuộc tính sản phẩm do máy chắt lọc). */
    kind: text('kind').notNull().default('faq'),
    /** Câu trích NGUYÊN VĂN từ đoạn nguồn làm bằng chứng (chỉ mục máy chắt lọc). */
    evidenceQuote: text('evidence_quote'),
    /** Đoạn nguồn (kb_chunks.id) lúc chắt lọc; không có khóa ngoại vì đoạn bản nháp bị ghi lại khi đồng bộ. */
    sourceChunkId: uuid('source_chunk_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('faq_items_workspace_idx').on(t.workspaceId, t.lang),
    check('faq_items_lang_check', sql`${t.lang} in (${inList(KB_CONTENT_LANGS)})`),
    check('faq_items_answer_check', sql`char_length(${t.answer}) between 1 and 8000`),
    check('faq_items_status_check', sql`${t.status} in ('published', 'draft')`),
    check('faq_items_kind_check', sql`${t.kind} in ('faq', 'product_attr')`),
    check(
      'faq_items_evidence_check',
      sql`${t.evidenceQuote} is null or char_length(${t.evidenceQuote}) between 1 and 2000`,
    ),
  ],
);

/** Giọng văn + quy tắc trả lời theo ngôn ngữ (FR-050, FR-142, FR-161, FR-141, FR-152). Một dòng/(workspace, lang). */
export const brandVoice = cf.table(
  'brand_voice',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: workspaceCol(),
    lang: text('lang').notNull(),
    tone: text('tone'),
    greeting: text('greeting'),
    signOff: text('sign_off'),
    doRules: text('do').array().notNull().default(sql`'{}'::text[]`),
    dontRules: text('dont').array().notNull().default(sql`'{}'::text[]`),
    addressByName: boolean('address_by_name').notNull().default(false),
    shopPronoun: text('shop_pronoun').notNull().default('em'),
    shopPronounCustom: text('shop_pronoun_custom'),
    customerAddress: text('customer_address').notNull().default('anh_chi'),
    handoffTemplates: jsonb('handoff_templates').notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('brand_voice_workspace_lang_unique').on(t.workspaceId, t.lang),
    check('brand_voice_lang_check', sql`${t.lang} in (${inList(BRAND_VOICE_LANGS)})`),
    check('brand_voice_pronoun_check', sql`${t.shopPronoun} in (${inList(BRAND_SHOP_PRONOUNS)})`),
    check(
      'brand_voice_address_check',
      sql`(${t.lang} = 'vi' and ${t.customerAddress} in ('anh_chi', 'ban', 'quy_khach')) or (${t.lang} = 'en' and ${t.customerAddress} = 'you')`,
    ),
    check(
      'brand_voice_custom_check',
      sql`(${t.shopPronoun} = 'custom' and char_length(btrim(coalesce(${t.shopPronounCustom}, ''))) > 0) or (${t.shopPronoun} <> 'custom' and ${t.shopPronounCustom} is null)`,
    ),
  ],
);
