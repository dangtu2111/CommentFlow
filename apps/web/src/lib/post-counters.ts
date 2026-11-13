/**
 * Bộ đếm ký tự bài đăng theo nền tảng (design/stitch/composer.html — "FB: 840 / 63.206 · IG: 840 / 2.200 · TikTok: 840 / 2.200"). THUẦN, không phụ thuộc React.
 * Đếm theo KÝ TỰ NGƯỜI DÙNG THẤY (grapheme): tiếng Việt có dấu tổ hợp và emoji ghép (👨‍👩‍👧, 👍🏽) tính 1.
 * Giới hạn là số của thiết kế; nền tảng có thể đổi quy định, nên chỉ dùng để CẢNH BÁO ở giao diện, không chặn ở server.
 */
export const COMPOSER_PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const;
export type ComposerPlatform = (typeof COMPOSER_PLATFORMS)[number];

export const PLATFORM_CHAR_LIMITS: Record<ComposerPlatform, number> = {
  facebook: 63206,
  instagram: 2200,
  tiktok: 2200,
};

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

export function countPostChars(text: string): number {
  if (text === '') return 0;
  const normalized = text.normalize('NFC');
  if (segmenter) {
    let count = 0;
    for (const _ of segmenter.segment(normalized)) count += 1;
    return count;
  }
  return Array.from(normalized).length;
}

export type PostCounter = {
  count: number;
  limit: number;
  remaining: number;
  over: boolean;
  ratio: number;
};

export function counterOf(text: string, platform: ComposerPlatform): PostCounter {
  const limit = PLATFORM_CHAR_LIMITS[platform];
  const count = countPostChars(text);
  return { count, limit, remaining: limit - count, over: count > limit, ratio: count / limit };
}
