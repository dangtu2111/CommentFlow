import { type ConceptId, checkConceptSupport, checkGuardMoney } from '@flow/ai';
import type { SampleOutcome } from './run-sample';

/**
 * Tách LỖI OAN khỏi LỖI THẬT của guard tiền/khái niệm (cờ `fact_slots` tắt): guard hiện chỉ nhìn các nguồn bộ soạn ĐÃ DÙNG (`draft.sources`). Với mỗi mẫu bị guard bắt, kiểm số/khái niệm bị bắt có nằm trong
 * ĐOẠN NÀO của `found` (toàn bộ đoạn tìm được) không: có → "oan" (nguồn khai thiếu trong `sources`, nội dung thật có trong kiến thức); không → "thật" (nội dung không có ở đâu cả = bịa). Hàm thuần.
 */
export type GuardItem = { label: string; inFound: boolean; foundIn: string[] };
export type GuardRejection = {
  id: string;
  kind: 'money' | 'concept';
  items: GuardItem[];
  verdict: 'oan' | 'that' | 'hon_hop';
};
export type GuardAnalysis = {
  rejections: GuardRejection[];
  samples: number;
  /** Số mẫu bị guard bắt (tiền hoặc khái niệm, mỗi mẫu một lần). */
  rejectedSamples: number;
  oan: number;
  that: number;
  honHop: number;
  money: number;
  concept: number;
  /** Số mẫu `handoff` với lý do `claim_unsupported`. */
  handoffClaimUnsupported: number;
};

const verdictOf = (items: readonly GuardItem[]): GuardRejection['verdict'] => {
  const hits = items.filter((item) => item.inFound).length;
  return hits === items.length ? 'oan' : hits === 0 ? 'that' : 'hon_hop';
};

type Found = ReadonlyArray<{ id: string; text: string }>;

function moneyItems(
  reply: string,
  violations: ReadonlyArray<{ display: string }>,
  found: Found,
): GuardItem[] {
  return violations.map((violation): GuardItem => {
    const foundIn = found
      .filter(
        (passage) =>
          !checkGuardMoney({ reply, sources: [passage.text] }).violations.some(
            (v) => v.display === violation.display,
          ),
      )
      .map((passage) => passage.id);
    return { label: violation.display, inFound: foundIn.length > 0, foundIn };
  });
}

function conceptItems(draftReply: string, concepts: readonly string[], found: Found): GuardItem[] {
  return concepts.map((concept): GuardItem => {
    const foundIn = found
      .filter((passage) =>
        checkConceptSupport({ reply: draftReply, sources: [passage.text] }).violations.every(
          (v) => v.concept !== (concept as ConceptId),
        ),
      )
      .map((passage) => passage.id);
    return { label: concept, inFound: foundIn.length > 0, foundIn };
  });
}

export function analyzeGuardRejections(outcomes: Iterable<SampleOutcome>): GuardAnalysis {
  const rejections: GuardRejection[] = [];
  let samples = 0;
  let handoffClaimUnsupported = 0;
  const rejectedIds = new Set<string>();
  for (const outcome of outcomes) {
    if (!outcome.ok) continue;
    samples += 1;
    if (outcome.action === 'handoff' && outcome.reason === 'claim_unsupported') {
      handoffClaimUnsupported += 1;
    }
    const found = outcome.diagnostics?.found ?? [];
    const violations = (outcome.diagnostics?.moneyViolations ?? []) as Array<{
      display?: unknown;
    } | null>;
    const shown = violations.flatMap((v) =>
      typeof v?.display === 'string' ? [{ display: v.display }] : [],
    );
    if (shown.length > 0) {
      const items = moneyItems(outcome.reply, shown, found);
      rejections.push({ id: outcome.id, kind: 'money', items, verdict: verdictOf(items) });
      rejectedIds.add(outcome.id);
    }
    const concept = outcome.diagnostics?.guardTrace?.concept;
    if (concept) {
      const items = conceptItems(concept.draftReply, concept.concepts, found);
      rejections.push({ id: outcome.id, kind: 'concept', items, verdict: verdictOf(items) });
      rejectedIds.add(outcome.id);
    }
  }
  const count = (verdict: GuardRejection['verdict']) =>
    rejections.filter((r) => r.verdict === verdict).length;
  return {
    rejections,
    samples,
    rejectedSamples: rejectedIds.size,
    oan: count('oan'),
    that: count('that'),
    honHop: count('hon_hop'),
    money: rejections.filter((r) => r.kind === 'money').length,
    concept: rejections.filter((r) => r.kind === 'concept').length,
    handoffClaimUnsupported,
  };
}

const VERDICT_LABEL: Record<GuardRejection['verdict'], string> = {
  oan: 'OAN',
  that: 'THẬT',
  hon_hop: 'HỖN HỢP',
};

export function renderGuardAnalysis(analysis: GuardAnalysis): string {
  const lines = analysis.rejections.map(
    (r) =>
      `- ${r.id} [${r.kind}] ${VERDICT_LABEL[r.verdict]}: ${r.items
        .map((i) => `${i.label}${i.inFound ? ` ∈ ${i.foundIn.join(', ')}` : ' ∉ found'}`)
        .join('; ')}`,
  );
  return [
    '',
    '',
    '## Guard tiền/khái niệm từ chối: lỗi oan vs lỗi thật (cờ fact_slots tắt)',
    `- Mẫu bị guard bắt: ${analysis.rejectedSamples}/${analysis.samples} (tiền ${analysis.money}, khái niệm ${analysis.concept})`,
    `- Tách theo đoạn \`found\`: OAN ${analysis.oan} (nội dung CÓ ở đoạn tìm được nhưng không nằm trong nguồn bộ soạn đã dùng) · THẬT ${analysis.that} (không có ở đâu) · HỖN HỢP ${analysis.honHop}`,
    `- handoff/claim_unsupported: ${analysis.handoffClaimUnsupported}`,
    ...(lines.length > 0 ? ['', ...lines] : []),
    '',
  ].join(String.fromCharCode(10));
}
