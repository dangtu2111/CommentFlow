import { classifyTopic, type PolicyKind, splitPolicySentences } from '@flow/ai';
import type { KbTopic } from '@flow/shared';
import type { PolicyCard } from './kb-policy-view';

/**
 * Thông tin trong DỮ LIỆU THÔ (chính sách văn bản đã nạp) mà bộ phân tách CHƯA đưa thành giá trị có cấu trúc — để Owner thấy hết dữ liệu thô, không chỉ phần đã rút được. Hàm thuần.
 * Một câu là "đã phân tách" khi nằm trong câu bằng chứng của một dòng `policy_facts` (nháp hoặc đã duyệt); còn lại xếp vào thẻ theo chủ đề (từ khóa), không rõ chủ đề → mục "Thông tin khác".
 */
export type RawPolicyForLeftover = { kind: PolicyKind; title: string; content: string };
export type LeftoverCard = PolicyCard | 'other';
export type LeftoverSentence = { title: string; sentence: string };
export type PolicyLeftover = {
  byCard: Record<LeftoverCard, LeftoverSentence[]>;
  total: number;
};

const CARD_OF_TOPIC: Partial<Record<KbTopic, PolicyCard>> = {
  shipping_time: 'ship',
  shipping_fee: 'ship',
  return: 'returns',
  refund: 'returns',
  warranty: 'warranty',
  payment: 'payment',
};

/** Trần số câu giữ lại (chống trang quá dài với văn bản khổng lồ). */
export const MAX_LEFTOVER_SENTENCES = 200;

const norm = (text: string): string => text.replace(/\s+/g, ' ').trim().toLowerCase();

export function buildPolicyLeftover(
  items: readonly RawPolicyForLeftover[],
  evidences: readonly (string | null)[],
): PolicyLeftover {
  const covered = evidences.filter((e): e is string => typeof e === 'string' && e !== '').map(norm);
  const byCard: PolicyLeftover['byCard'] = {
    ship: [],
    returns: [],
    warranty: [],
    payment: [],
    other: [],
  };
  const seen = new Set<string>();
  let total = 0;
  for (const item of items) {
    for (const sentence of splitPolicySentences(item.content)) {
      const key = norm(sentence);
      if (seen.has(key) || covered.some((evidence) => evidence.includes(key))) continue;
      seen.add(key);
      if (total >= MAX_LEFTOVER_SENTENCES) return { byCard, total };
      const card = CARD_OF_TOPIC[classifyTopic(sentence, 'other')] ?? 'other';
      byCard[card].push({ title: item.title, sentence });
      total += 1;
    }
  }
  return { byCard, total };
}
