import { foldText } from '@flow/shared';
import { z } from 'zod';

/**
 * Quy tắc chuyển người cho bình luận có ảnh/video/sticker kèm chữ (DA-HANDOFF-RULES, FR-143, Q-DHR1, `docs/09` §6 mục 6).
 * Hàm thuần, không DB/LLM. CODE quyết định "câu này có phụ thuộc vào ảnh khách gửi không"; cờ `refers_to_image` của
 * model chỉ được THÊM vào (không bao giờ bỏ). Đầu vào hỏng → coi là phụ thuộc ảnh (thiên về chặn, không "mở khi lỗi").
 * Chưa đọc nội dung ảnh (`ATTACH-VISION`, GĐ5, cờ `cf.vision`).
 */

/** Sticker/GIF là trang trí, không phải bằng chứng sản phẩm (cùng quy ước `ruleFilter`). */
const DECORATIVE_TYPES: ReadonlySet<string> = new Set(['sticker', 'gif']);
/** Chữ ngắn hơn hoặc bằng ngưỡng này kèm ảnh/video → coi là hỏi về ảnh ("giá?", "còn không"). */
export const MAX_SHORT_TEXT_WORDS = 4;

const DEICTIC_PATTERNS: readonly RegExp[] = [
  // "mẫu này", "cái đó", "áo kia", "sp này"…
  /\b(mau|cai|con|chiec|ao|quan|dam|vay|giay|tui|san pham|sp|loai|kieu|bo|set|hang|doi|mon|do|cay)\s+(nay|ni|ne|do|kia)\b/,
  // "ảnh/hình/cái em gửi", "vừa gửi"
  /\b(anh|hinh|cai|mau|video|clip)\s+(em|minh|toi|con)?\s*(vua\s+)?gui\b/,
  // "trong ảnh", "như hình", "giống ảnh"…
  /\b(trong|tren|nhu|giong|y chang|y het|theo)\s+(anh|hinh|video|clip)\b/,
  /\b(anh|hinh|video|clip)\s+(nay|do|tren)\b/,
  /\b(this|that|these|those)\s+(one|ones|item|product|model|style|dress|shirt|bag)\b/,
  /\b(in|like)\s+(the\s+|this\s+)?(photo|picture|image|video|pic)\b/,
];

const inputSchema = z.object({
  text: z.string(),
  attachmentTypes: z.array(z.string()),
  modelRefersToImage: z.boolean().optional(),
});

export type ImageDependenceSource = 'model' | 'text' | 'none' | 'unreadable';

export type AttachmentRuleResult = {
  /** Có ảnh/video (hoặc loại lạ). */
  hasVisual: boolean;
  /** Chỉ có sticker/GIF (hoặc kèm ảnh). */
  hasSticker: boolean;
  /** Câu hỏi phụ thuộc vào ảnh khách gửi. */
  imageDependent: boolean;
  /** Ai phát hiện: model (cờ `refers_to_image`), code từ chữ, hoặc không ai. */
  source: ImageDependenceSource;
};

const UNREADABLE: AttachmentRuleResult = {
  hasVisual: true,
  hasSticker: false,
  imageDependent: true,
  source: 'unreadable',
};

function wordCount(folded: string): number {
  return folded.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0).length;
}

/** Chữ chỉ định hoặc quá ngắn để tự đủ nghĩa khi đi kèm ảnh/video. */
function textPointsAtMedia(text: string): boolean {
  const folded = foldText(text);
  return (
    wordCount(folded) <= MAX_SHORT_TEXT_WORDS ||
    DEICTIC_PATTERNS.some((pattern) => pattern.test(folded))
  );
}

export function evaluateAttachmentRules(raw: unknown): AttachmentRuleResult {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return UNREADABLE;
  const { text, attachmentTypes, modelRefersToImage } = parsed.data;

  const hasVisual = attachmentTypes.some((type) => !DECORATIVE_TYPES.has(type));
  const hasSticker = attachmentTypes.some((type) => DECORATIVE_TYPES.has(type));

  if (modelRefersToImage === true)
    return { hasVisual, hasSticker, imageDependent: true, source: 'model' };
  if (hasVisual && textPointsAtMedia(text)) {
    return { hasVisual, hasSticker, imageDependent: true, source: 'text' };
  }
  return { hasVisual, hasSticker, imageDependent: false, source: 'none' };
}
