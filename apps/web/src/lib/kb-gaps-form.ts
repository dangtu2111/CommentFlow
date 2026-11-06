import {
  type FaqItemInput,
  KB_GAP_STATUSES,
  KB_GAP_TOPICS,
  type KbGapStatus,
  type KbGapTopic,
  parseFaqItem,
} from '@flow/shared';

/**
 * Trang "Câu hỏi AI chưa trả lời được" (FR-134, UF-11): phần thuần — đọc bộ lọc từ URL, kiểm form, gom nhóm.
 * Không phụ thuộc React/DB để test được.
 */
export type KbGapFilterInput = { topic?: KbGapTopic; status: KbGapStatus };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  typeof v === 'string' ? list.find((x) => x === v) : undefined;

/** Bộ lọc từ query: giá trị lạ/mảng bị bỏ; mặc định xem mục đang mở. */
export function parseKbGapFilter(
  params: Record<string, string | string[] | undefined>,
): KbGapFilterInput {
  const topic = oneOf(KB_GAP_TOPICS, params.topic);
  const status = oneOf(KB_GAP_STATUSES, params.status) ?? 'open';
  return topic ? { topic, status } : { status };
}

export type KbGapAction =
  | { intent: 'resolve'; gapId: string; faq: FaqItemInput }
  | { intent: 'ignore' | 'reopen'; gapId: string };

export type KbGapFormResult =
  | { ok: true; action: KbGapAction }
  | { ok: false; code: 'bad_request' | 'invalid_faq' };

type FormLike = { get(key: string): unknown };

/** `bad_request` (id/ý định lạ) → nơi gọi trả 404; `invalid_faq` → báo lỗi tại chỗ. */
export function parseKbGapForm(data: FormLike): KbGapFormResult {
  const gapId = data.get('gapId');
  const intent = data.get('intent');
  if (typeof gapId !== 'string' || !UUID.test(gapId)) return { ok: false, code: 'bad_request' };
  if (intent === 'ignore' || intent === 'reopen') return { ok: true, action: { intent, gapId } };
  if (intent !== 'resolve') return { ok: false, code: 'bad_request' };
  const faq = parseFaqItem({
    question: data.get('question'),
    answer: data.get('answer'),
    lang: data.get('lang'),
  });
  if (!faq.success) return { ok: false, code: 'invalid_faq' };
  return { ok: true, action: { intent, gapId, faq: faq.data } };
}

export type KbGapGroup<G extends { topic: KbGapTopic; count: number }> = {
  topic: KbGapTopic;
  total: number;
  gaps: G[];
};

/** Gom theo chủ đề; nhóm nhiều lượt hỏi nhất trước (hòa → theo thứ tự chủ đề); trong nhóm giữ thứ tự gốc. */
export function groupGapsByTopic<G extends { topic: KbGapTopic; count: number }>(
  gaps: readonly G[],
): Array<KbGapGroup<G>> {
  const byTopic = new Map<KbGapTopic, KbGapGroup<G>>();
  for (const gap of gaps) {
    const group = byTopic.get(gap.topic) ?? { topic: gap.topic, total: 0, gaps: [] };
    group.total += gap.count;
    group.gaps.push(gap);
    byTopic.set(gap.topic, group);
  }
  return [...byTopic.values()].sort(
    (a, b) => b.total - a.total || KB_GAP_TOPICS.indexOf(a.topic) - KB_GAP_TOPICS.indexOf(b.topic),
  );
}

export type KbGapView = {
  id: string;
  topic: KbGapTopic;
  count: number;
  sampleQuestionMasked: string;
  lastSeenAt: string;
  status: KbGapStatus;
};

type KbGapDbRow = {
  id: string;
  topic: string;
  status: string;
  count: number;
  sampleQuestionMasked: string;
  lastSeenAt: Date;
};

/** Dòng DB (cột chuỗi) → dữ liệu hiển thị; dòng có chủ đề/trạng thái lạ (DB đã CHECK nên không xảy ra) bị bỏ. */
export function toKbGapViews(rows: readonly KbGapDbRow[]): KbGapView[] {
  return rows.flatMap((r) => {
    const topic = oneOf(KB_GAP_TOPICS, r.topic);
    const status = oneOf(KB_GAP_STATUSES, r.status);
    if (!topic || !status) return [];
    return [
      {
        id: r.id,
        topic,
        count: r.count,
        sampleQuestionMasked: r.sampleQuestionMasked,
        lastSeenAt: r.lastSeenAt.toISOString(),
        status,
      },
    ];
  });
}
