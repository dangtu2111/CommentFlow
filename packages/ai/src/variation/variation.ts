import { createHash } from 'node:crypto';
import { checkGuardMoney, extractClaims } from '../guard-money';

/**
 * Đa dạng cách diễn đạt, giữ nguyên nội dung (FR-161, US-105). Hàm thuần: không gọi LLM, không Redis.
 * AI chỉ viết các cách nói khác; code quyết định biến thể nào được giữ và biến thể nào được gửi.
 */

/** Tối đa biến thể giữ lại, gồm cả câu gốc (FR-161: 3–5). */
export const MAX_VARIANTS = 5;
export const REASON_VARIANTS_EXHAUSTED = 'Hết biến thể chưa dùng trong 1 giờ';

/**
 * Dấu vết của một câu để so "trùng chữ": NFKC, bỏ hoa/thường, bỏ mọi ký tự không phải chữ/số
 * (dấu câu, khoảng trắng, emoji). Giữ chữ số nên khác giá → khác dấu vết. Chuỗi hex sha256 — không lưu
 * câu gốc vào Redis (câu có thể chứa tên khách).
 */
export function replyFingerprint(text: string): string {
  const normalized = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return createHash('sha256').update(normalized).digest('hex');
}

function claimSet(text: string): Set<string> {
  return new Set(extractClaims(text).map((claim) => `${claim.kind}|${claim.key}`));
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

export type GuardVariantsInput = {
  /** Câu gốc (đã qua kiểm nguồn của `claims`). */
  reply: string;
  /** Các cách diễn đạt khác do LLM trả trong cùng lần gọi. */
  variants: readonly string[];
  /** Văn bản nguồn đã đưa vào prompt — mọi số/link trong biến thể phải có ở đây. */
  sources: readonly string[];
};

export type GuardVariantsResult = {
  /** `[câu gốc, …biến thể hợp lệ]`, tối đa `MAX_VARIANTS`; rỗng nếu không có câu gốc. */
  variants: string[];
  /** Số biến thể bị loại (rỗng, trùng chữ, sai số/link/nguồn). */
  rejected: number;
};

/**
 * Giữ biến thể khi: không rỗng, không trùng chữ với câu đã giữ, `checkGuardMoney` đạt với nguồn, và TẬP
 * khẳng định (tiền, %, ngày, SĐT, email, link, số) y hệt câu gốc — không thêm, không bớt, không đổi.
 */
export function guardVariants(input: GuardVariantsInput): GuardVariantsResult {
  const reply = input.reply.trim();
  if (reply === '') return { variants: [], rejected: input.variants.length };

  const baseClaims = claimSet(reply);
  const seen = new Set([replyFingerprint(reply)]);
  const kept = [reply];
  let rejected = 0;

  for (const raw of input.variants) {
    if (kept.length >= MAX_VARIANTS) break;
    const variant = raw.trim();
    const fingerprint = replyFingerprint(variant);
    const valid =
      variant !== '' &&
      !seen.has(fingerprint) &&
      sameSet(claimSet(variant), baseClaims) &&
      checkGuardMoney({ reply: variant, sources: input.sources }).ok;
    if (!valid) {
      rejected += 1;
      continue;
    }
    seen.add(fingerprint);
    kept.push(variant);
  }
  return { variants: kept, rejected };
}

export type PickedVariant = { index: number; text: string; fingerprint: string };

/**
 * Chọn một biến thể chưa dùng dưới bài trong 1 giờ (`usedFingerprints` = tập dấu vết đã gửi, Redis
 * `cf:{ws}:post:{id}:recent`). Hết biến thể → `null`: bên gọi chuyển Chờ duyệt hoặc soạn lại
 * (`REASON_VARIANTS_EXHAUSTED`). `random` tiêm vào để test xác định.
 */
export function pickVariant(
  variants: readonly string[],
  usedFingerprints: ReadonlySet<string>,
  random: () => number = Math.random,
): PickedVariant | null {
  const unused = variants
    .map((text, index) => ({ index, text, fingerprint: replyFingerprint(text) }))
    .filter((candidate) => !usedFingerprints.has(candidate.fingerprint));
  if (unused.length === 0) return null;
  const draw = random();
  const slot = Number.isFinite(draw) ? Math.min(Math.floor(draw * unused.length), unused.length - 1) : 0;
  return unused[slot] ?? null;
}
