import { z } from 'zod';
import { normalizeSearchText } from './search';

/**
 * Bí danh sản phẩm (FR-128, docs/10 `product_aliases`). Phần thuần dùng chung cho Server Action, truy vấn DB và bước
 * tìm sản phẩm. `aliasNorm` tính bằng đúng `normalizeSearchText` của truy vấn tìm kiếm nên hai phía luôn khớp.
 */
export const PRODUCT_ALIAS_SOURCES = ['staff', 'import', 'ai_suggested'] as const;
export type ProductAliasSource = (typeof PRODUCT_ALIAS_SOURCES)[number];
export const PRODUCT_ALIAS_MAX = 100;

/** Độ giống trigram tối thiểu để bí danh được coi là khớp (docs/10 §5.1 bước 2). */
export const ALIAS_MATCH_THRESHOLD = 0.6;

const aliasSchema = z
  .string()
  .transform((v) => v.normalize('NFC').replace(/\s+/gu, ' ').trim())
  .pipe(z.string().min(1).max(PRODUCT_ALIAS_MAX));

const productAliasSchema = z
  .object({
    alias: aliasSchema,
    source: z.enum(PRODUCT_ALIAS_SOURCES).default('staff'),
  })
  .transform((v, ctx) => {
    const aliasNorm = normalizeSearchText(v.alias);
    if (aliasNorm === '') {
      ctx.addIssue({ code: 'custom', path: ['alias'], message: 'alias phải có chữ hoặc số' });
      return z.NEVER;
    }
    return { alias: v.alias, aliasNorm, source: v.source };
  });

export type ProductAliasInput = z.output<typeof productAliasSchema>;

export function parseProductAlias(input: unknown) {
  return productAliasSchema.safeParse(input);
}
