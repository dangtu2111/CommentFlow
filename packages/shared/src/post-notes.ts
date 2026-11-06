import { z } from 'zod';

/**
 * Ghi chú theo bài có hạn + ghi đè chế độ tự động theo bài (FR-062, US-033, docs/10 `post_notes`).
 * Phần thuần: kiểm đầu vào của Owner, trạng thái theo thời gian, và quy tắc "ghi đè chỉ siết, không nới" (Q-PN1).
 */
export const POST_NOTE_MAX = 1000;

export type PostNoteStatus = 'scheduled' | 'active' | 'expired';
export type AutoMode = 'off' | 'shadow' | 'auto';
/** Ghi đè theo bài: chỉ được hạ chế độ (tắt / chỉ chạy bóng), không bao giờ bật `auto`. */
export type PostAutoOverride = 'off' | 'shadow';

const optionalDate = z
  .union([z.date(), z.iso.datetime({ offset: true }).transform((s) => new Date(s))])
  .refine((d) => !Number.isNaN(d.getTime()), 'ngày không hợp lệ')
  .nullish()
  .transform((v) => v ?? null);

const postNoteSchema = z
  .object({
    content: z
      .string()
      .transform((v) => v.normalize('NFC').replace(/\s+/gu, ' ').trim())
      .pipe(z.string().min(1).max(POST_NOTE_MAX)),
    validFrom: optionalDate,
    validTo: optionalDate,
  })
  .refine((v) => v.validFrom === null || v.validTo === null || v.validTo > v.validFrom, {
    path: ['validTo'],
    message: 'hạn phải sau ngày bắt đầu',
  });

export type PostNoteInput = z.output<typeof postNoteSchema>;

export function parsePostNoteInput(input: unknown) {
  return postNoteSchema.safeParse(input);
}

/** Bắt đầu tính (>=), kết thúc loại (<): ghi chú hết hạn đúng lúc `validTo` thì không còn được dùng. */
export function postNoteStatus(
  note: { validFrom: Date; validTo: Date | null },
  now: Date,
): PostNoteStatus {
  if (now < note.validFrom) return 'scheduled';
  if (note.validTo !== null && now >= note.validTo) return 'expired';
  return 'active';
}

const overrideSchema = z.union([z.literal('off'), z.literal('shadow'), z.null()]);

export function parsePostAutoOverride(input: unknown) {
  return overrideSchema.safeParse(input);
}

const RANK: Record<AutoMode, number> = { off: 0, shadow: 1, auto: 2 };

/** Chế độ hiệu lực của bài = min(chế độ nền của kênh/workspace, ghi đè). Không ghi đè → giữ nền. */
export function effectiveAutoMode(base: AutoMode, override: PostAutoOverride | null): AutoMode {
  if (override === null) return base;
  return RANK[override] < RANK[base] ? override : base;
}
