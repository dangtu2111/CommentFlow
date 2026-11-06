import type { ExtractResult } from '../classify/extract-result';
import type { Extractor } from '../classify/extractor';
import { FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import { REASON_HANDOFF_ACTION } from '../confidence/confidence';
import type { DraftResult } from '../draft/draft-result';
import { needsHumanResult } from '../draft/draft-result';
import { DEFAULT_MIN_RELEVANCE, type Drafter } from '../draft/drafter';

/**
 * Bản mock theo từ khóa cho ô Thử AI (Xong-mock, Q-ATB1): không LLM/mạng, kết quả xác định, không ghi `ai_usage`.
 * Chỉ để xem trước luồng; chất lượng thật chỉ có khi bật LLM thật (cờ tắt mặc định).
 */
const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();

const PRODUCT_NAMES = ['áo thun basic', 'váy hoa nhí'] as const;
const COLORS = ['đen', 'trắng', 'xanh'] as const;

const ASK_RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ['giá', /\b(gia|bao nhieu|nhieu tien|price|how much)\b/],
  ['tồn kho', /\b(con hang|het hang|con khong|con ko|in stock)\b/],
  ['phí ship', /\b(ship|giao hang|van chuyen|shipping|delivery)\b/],
  ['đổi trả', /\b(doi|tra hang|hoan|bao hanh|return|refund)\b/],
  ['giảm giá', /\b(giam gia|khuyen mai|voucher|discount|coupon)\b/],
];

function labelOf(text: string): ExtractResult['labels'] {
  if (/\b(loi|te|toi te|lua dao|hoan tien|khieu nai|that vong|complaint)\b/.test(text)) {
    return [{ label: 'complaint', confidence: 0.9 }];
  }
  if (/\b(chot|dat hang|mua|order|lay)\b/.test(text))
    return [{ label: 'purchase', confidence: 0.9 }];
  if (/\b(gia|bao nhieu|nhieu tien|price|how much)\b/.test(text)) {
    return [{ label: 'price', confidence: 0.9 }];
  }
  if (/\b(ship|giao|doi|tra|size|tu van|bao hanh|con hang|giam)\b/.test(text)) {
    return [{ label: 'advice', confidence: 0.9 }];
  }
  return [{ label: 'other', confidence: 0.5 }];
}

export function createDemoExtractor(): Extractor {
  return {
    async extract(input) {
      const text = fold(input.text);
      const size = /\bsize\s*([sml]|xl)\b/i.exec(input.text)?.[1]?.toUpperCase() ?? null;
      const color = COLORS.find((c) => text.includes(fold(c))) ?? null;
      return {
        ...FIXTURE_EXTRACT_DEFAULT,
        labels: labelOf(text),
        product_mentions: PRODUCT_NAMES.filter((name) => text.includes(fold(name))),
        size,
        color,
        asks: ASK_RULES.filter(([, rule]) => rule.test(text)).map(([ask]) => ask),
      };
    },
  };
}

const CLARIFY_TEXT = 'Bạn cho shop hỏi thêm: bạn muốn xem mẫu/size/màu nào ạ?';
const REDIRECT_TEXT = 'Phần còn lại bạn nhắn tin riêng cho shop để được hỗ trợ nhé.';

/** Soạn từ chính nội dung nguồn đạt ngưỡng (không bịa) — đủ để kiểm cả guard và cổng tự gửi bằng mock. */
export function createDemoDrafter(): Drafter {
  return {
    async draft(input) {
      const action = input.decision?.action ?? 'answer';
      if (action === 'handoff') return needsHumanResult(REASON_HANDOFF_ACTION, input.lang);
      const threshold = input.minRelevance ?? DEFAULT_MIN_RELEVANCE;
      const used = input.sources.filter((s) => s.relevance >= threshold).slice(0, 2);

      if (action === 'clarify') {
        return result(
          input.lang,
          CLARIFY_TEXT,
          [],
          [{ text: CLARIFY_TEXT, source_ids: [], kind: 'question_back' }],
        );
      }
      if (used.length === 0) return needsHumanResult('Không có kiến thức liên quan', input.lang);

      const facts = used.map((s) => ({ text: s.text, source_ids: [s.id], kind: 'fact' as const }));
      const body = used.map((s) => s.text).join(' ');
      if (action === 'redirect') {
        const claims = [
          ...facts,
          { text: REDIRECT_TEXT, source_ids: [], kind: 'handoff' as const },
        ];
        return result(
          input.lang,
          `${body} ${REDIRECT_TEXT}`,
          used.map((s) => s.id),
          claims,
        );
      }
      return result(
        input.lang,
        body,
        used.map((s) => s.id),
        facts,
      );
    },
  };
}

function result(
  lang: DraftResult['lang'],
  reply: string,
  sources: string[],
  claims: DraftResult['claims'],
): DraftResult {
  return {
    reply,
    lang,
    sources,
    claims,
    unanswered_topics: [],
    needs_human: false,
    reason: '',
    variants: [],
  };
}
