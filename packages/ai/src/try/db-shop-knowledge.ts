import type { TryShopText } from '@flow/db/runtime';
import { unsafeMarkMasked } from '@flow/shared';
import type { KbGapTopic } from '../decide/decide-action';
import type { TryCandidate, TryKnowledge, TrySearchContext } from './try-pipeline';
import { topicOf } from './try-pipeline';

/**
 * Chính sách/FAQ THẬT của workspace cho ô Thử AI (TRY-AI-REAL lát B, FR-050/055/059). Mỗi mục được CẮT THÀNH ĐOẠN
 * (≈ 600 ký tự, như `kb_chunks`) rồi chấm từng đoạn — không đưa cả chính sách dài vào câu trả lời. Điểm `1 − 0,5^n` do code
 * tính (không phải số model tự chấm). Đoạn được chọn khi: ≥ 2 từ khóa trùng (bỏ từ hỏi chung như "bao nhiêu", "shop"),
 * hoặc chủ đề của câu hỏi (ship/đổi trả…) trùng LOẠI của chính sách (`policyKind`) — nên chính sách tiếng Anh vẫn trả lời
 * được câu hỏi tiếng Việt, còn câu chung chung ("Bao nhiêu vậy shop?") hay mục loại khác (quyền riêng tư…) thì không bị kéo ra.
 * Hàm thuần, không gọi DB/LLM.
 */
const STOPWORDS = new Set([
  'bao',
  'nhieu',
  'vay',
  'shop',
  'khong',
  'co',
  'la',
  'cho',
  'hoi',
  'gi',
  'the',
  'nao',
  'a',
  'ak',
  'nhe',
  'nha',
  'minh',
  'ban',
  'em',
  'anh',
  'chi',
  'voi',
  'va',
  'cua',
  'duoc',
  'khi',
  'thi',
  'ma',
  'de',
  'tai',
  'sao',
  'how',
  'much',
  'is',
  'are',
  'do',
  'you',
  'have',
  'what',
  'can',
  'for',
  'and',
  'ko',
  'k',
  'ah',
]);

/** Loại chính sách → chủ đề (khớp `topicOf`). Loại khác (`other`…) KHÔNG được suy chủ đề từ chữ. */
const KIND_TOPIC: Record<string, KbGapTopic> = {
  shipping: 'shipping',
  return: 'policy',
  warranty: 'policy',
};

/** Từ gợi ý theo chủ đề (cả tiếng Việt/Anh) để chọn ĐÚNG đoạn khi chính sách khác ngôn ngữ với câu hỏi. */
const TOPIC_HINTS: Partial<Record<KbGapTopic, readonly string[]>> = {
  shipping: [
    'ship',
    'shipping',
    'delivery',
    'deliver',
    'cost',
    'fee',
    'rate',
    'free',
    'days',
    'giao',
    'phi',
    'van',
    'chuyen',
  ],
  policy: [
    'return',
    'refund',
    'exchange',
    'days',
    'eligible',
    'condition',
    'doi',
    'tra',
    'hoan',
    'bao',
    'hanh',
  ],
};

const PASSAGE_TARGET = 600;
const MAX_PASSAGES = 3;

const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();

const words = (text: string): string[] =>
  fold(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);

const keywords = (text: string): Set<string> =>
  new Set(words(text).filter((token) => !STOPWORDS.has(token)));

/** Cắt văn bản theo dòng, gộp dòng ngắn cho tới ≈ `target` ký tự; dòng quá dài tự cắt theo câu. Hàm thuần. */
export function splitPassages(text: string, target = PASSAGE_TARGET): string[] {
  const pieces = text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .flatMap((line) =>
      line.length > target * 1.5 ? (line.match(/[^.!?]+[.!?]*\s*/g) ?? [line]) : [line],
    );
  const passages: string[] = [];
  let current = '';
  for (const piece of pieces) {
    const next = current === '' ? piece : `${current} ${piece}`;
    if (current !== '' && next.length > target) {
      passages.push(current.trim());
      current = piece;
    } else {
      current = next;
    }
  }
  if (current.trim() !== '') passages.push(current.trim());
  return passages;
}

export function searchShopTexts(
  items: readonly TryShopText[],
  query: string,
  context: Pick<TrySearchContext, 'lang'>,
): TryCandidate[] {
  const asked = keywords(query);
  const askedTopic = topicOf(query);
  const candidates: TryCandidate[] = [];
  for (const item of items) {
    // `all` = áp dụng mọi ngôn ngữ (chính sách nạp từ Shopify); còn lại phải đúng ngôn ngữ của câu hỏi.
    if (item.lang !== 'all' && item.lang !== context.lang) continue;
    const topic: KbGapTopic = item.policyKind
      ? (KIND_TOPIC[item.policyKind] ?? 'other')
      : topicOf(`${item.title} ${item.text}`);
    const sameTopic = askedTopic !== 'other' && askedTopic === topic;
    const hints = new Set(sameTopic ? (TOPIC_HINTS[topic] ?? []) : []);
    const scored = splitPassages(item.text).map((passage, index) => {
      const own = keywords(`${item.title} ${passage}`);
      const matches = [...asked].filter((token) => own.has(token)).length;
      const hinted = [...hints].filter((token) => own.has(token)).length;
      return { passage, index, matches, hinted };
    });
    const picked = scored
      .filter((entry) => entry.matches >= 2 || (sameTopic && entry.matches + entry.hinted >= 1))
      .sort((a, b) => b.matches + b.hinted - (a.matches + a.hinted) || a.index - b.index)
      .slice(0, 2);
    for (const entry of picked) {
      candidates.push({
        // Mã nguồn đi vào prompt soạn nên PHẢI khớp `SOURCE_ID` của draft-prompt: [A-Za-z0-9_:.-]{1,64} (không có `#`).
        id: `${item.kind}:${item.id}.${entry.index}`,
        kind: 'kb',
        title: item.title,
        text: unsafeMarkMasked(entry.passage),
        score: Math.min(
          0.95,
          1 - 0.5 ** (entry.matches + Math.min(entry.hinted, 2) + (sameTopic ? 1 : 0)),
        ),
        topics: topic === 'other' ? [] : [topic],
      });
    }
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, MAX_PASSAGES);
}

export function createDbShopKnowledgeSearch(
  items: readonly TryShopText[],
): TryKnowledge['searchKb'] {
  return async (query, context) => searchShopTexts(items, query, context);
}
