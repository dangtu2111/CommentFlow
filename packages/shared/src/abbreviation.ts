import { z } from 'zod';

/**
 * Từ điển viết tắt (FR-025, FR-050, docs/10 `abbreviations`). Phần thuần, dùng chung cho Server Action, truy vấn DB và
 * bước chuẩn hóa (`@flow/ai` `createAbbreviationDict`). `short` luôn ở dạng đã chuẩn hóa (NFC, chữ thường, không khoảng
 * trắng) để khớp đúng cách `normalizeText` tra từng từ.
 */
export const ABBREVIATION_LANGS = ['vi', 'en'] as const;
export type AbbreviationLang = (typeof ABBREVIATION_LANGS)[number];
export const ABBREVIATION_SHORT_MAX = 32;
export const ABBREVIATION_FULL_MAX = 100;

const shortSchema = z
  .string()
  .transform((v) => v.normalize('NFC').toLowerCase().normalize('NFC').trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(ABBREVIATION_SHORT_MAX)
      .refine((v) => !/\s/u.test(v), 'short không được chứa khoảng trắng'),
  );

const abbreviationSchema = z
  .object({
    short: shortSchema,
    full: z.string().trim().min(1).max(ABBREVIATION_FULL_MAX),
    lang: z.enum(ABBREVIATION_LANGS),
  })
  .refine((v) => v.short !== v.full.normalize('NFC').toLowerCase(), {
    message: 'short không được trùng full',
    path: ['full'],
  });

export type AbbreviationInput = z.infer<typeof abbreviationSchema>;
export type AbbreviationEntry = { short: string; full: string };

export function parseAbbreviation(input: unknown) {
  return abbreviationSchema.safeParse(input);
}

/**
 * Trộn từ điển hệ thống với từ điển workspace: mục của shop đè mục hệ thống cùng `short`. Trả về đối tượng không có
 * nguyên mẫu để khóa như `__proto__`/`constructor` không bao giờ trùng thuộc tính có sẵn.
 */
export function mergeAbbreviations(
  system: readonly AbbreviationEntry[],
  workspace: readonly AbbreviationEntry[],
): Record<string, string> {
  const merged: Record<string, string> = Object.create(null);
  for (const entry of system) merged[entry.short] = entry.full;
  for (const entry of workspace) merged[entry.short] = entry.full;
  return merged;
}
