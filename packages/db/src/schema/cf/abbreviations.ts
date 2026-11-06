import { sql } from 'drizzle-orm';
import { check, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from '../core/common';
import { workspaces } from '../core/tenancy';
import { cf } from './ai-usage';

/** Khớp `ABBREVIATION_LANGS` ở `@flow/shared`. */
export const ABBREVIATION_LANG_VALUES = ['vi', 'en'] as const;
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/**
 * Từ điển viết tắt HỆ THỐNG (FR-025, Q-AD1): dùng chung mọi workspace, không có `workspace_id`, không RLS, `cf_app` chỉ
 * SELECT (như `core.feature_flags`); nội dung do migration seed. `short` đã chuẩn hóa (thường, không khoảng trắng).
 */
export const systemAbbreviations = cf.table(
  'system_abbreviations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    short: text('short').notNull(),
    full: text('full').notNull(),
    lang: text('lang').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('system_abbreviations_lang_short_unique').on(t.lang, t.short),
    check(
      'system_abbreviations_lang_check',
      sql`${t.lang} in (${inList(ABBREVIATION_LANG_VALUES)})`,
    ),
    check(
      'system_abbreviations_short_check',
      sql`${t.short} = lower(${t.short}) and ${t.short} !~ '\\s' and char_length(${t.short}) between 1 and 32`,
    ),
    check('system_abbreviations_full_check', sql`char_length(${t.full}) between 1 and 100`),
  ],
);

/** Từ điển viết tắt của workspace (FR-050): Owner tự thêm/sửa/xóa; mục của shop đè mục hệ thống cùng `short`. */
export const abbreviations = cf.table(
  'abbreviations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    short: text('short').notNull(),
    full: text('full').notNull(),
    lang: text('lang').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('abbreviations_workspace_lang_short_unique').on(t.workspaceId, t.lang, t.short),
    check('abbreviations_lang_check', sql`${t.lang} in (${inList(ABBREVIATION_LANG_VALUES)})`),
    check(
      'abbreviations_short_check',
      sql`${t.short} = lower(${t.short}) and ${t.short} !~ '\\s' and char_length(${t.short}) between 1 and 32`,
    ),
    check('abbreviations_full_check', sql`char_length(${t.full}) between 1 and 100`),
  ],
);
