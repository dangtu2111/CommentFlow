import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { ExtractResult } from '../classify/extract-result';
import { createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import type { DraftResult } from '../draft/draft-result';
import type { Drafter } from '../draft/drafter';
import type { FactTopic, PolicyFacts } from '../fact-plan';
import type { TryCandidate, TryKnowledge } from '../try/try-pipeline';
import { type PipelineInput, runPipeline } from './run-pipeline';

/**
 * ADR 018 bước 1: fact plan KHÔNG phụ thuộc cờ `fact_slots`. Thẻ chính sách luôn được nạp; cờ (`factSlotsMode`) chỉ quyết định LLM có viết bằng chỗ giữ chỗ không.
 * Cờ TẮT vẫn dùng plan cho: (a) câu hỏi đổi trả thường/hàng lỗi trùng phạm vi bảo hành không bị nhãn phụ complaint ép chuyển người, (b) câu dự phòng do code dựng khi nháp rỗng.
 */
const voice = { do: [], dont: [], shopPronoun: 'shop' as const, customerAddress: 'ban' as const };
const policy: PolicyFacts = {
  shipping: [
    {
      kind: 'nationwide',
      label: 'Toàn quốc',
      feeMinor: 30000,
      currency: 'VND',
      daysMin: 2,
      daysMax: 4,
      sourceId: 'policy:ship',
    },
  ],
  returns: { days: 7, sourceId: 'pf:r' },
  warranty: { months: 3, scope: 'đường may', sourceId: 'pf:w' },
};
const factSlots: NonNullable<PipelineInput['factSlots']> = {
  policy,
  stock: { disclose: 'status', lowAt: null },
};
const returnsChunk: TryCandidate = {
  id: 'policy:returns',
  kind: 'policy',
  title: 'Đổi trả',
  text: unsafeMarkMasked('Đổi trả trong 7 ngày nếu còn nguyên tem mác.'),
  score: 0.9,
  topics: ['policy'],
};
const shipChunk: TryCandidate = {
  id: 'policy:ship',
  kind: 'policy',
  title: 'Vận chuyển',
  text: unsafeMarkMasked('Giao toàn quốc, phí 30.000đ, 2-4 ngày.'),
  score: 0.9,
  topics: ['shipping'],
};
const warrantyChunk: TryCandidate = {
  id: 'policy:warranty',
  kind: 'policy',
  title: 'Bảo hành',
  text: unsafeMarkMasked('Bảo hành đường may 3 tháng.'),
  score: 0.9,
  topics: ['policy'],
};
const knowledgeWith = (chunks: TryCandidate[]): TryKnowledge => ({
  matchProducts: async () => ({ ids: [], names: [], missingAxes: [] }),
  lookupProductFacts: async () => [],
  lookupPlanProducts: async () => [],
  searchKb: async () => chunks,
});
const draftOf = (reply: string, needsHuman = false): DraftResult => ({
  reply,
  lang: 'vi',
  sources: [],
  claims: [],
  unanswered_topics: [],
  needs_human: needsHuman,
  reason: '',
  variants: [],
});

const ask = async (
  text: string,
  topics: FactTopic[],
  labels: Array<{ label: string }>,
  draft: DraftResult,
  mode: boolean,
  chunks: TryCandidate[] = [],
) => {
  const drafter: Drafter = {
    async draft(input) {
      return input.decision?.action === 'handoff'
        ? { ...draftOf('', true), reason: 'handoff' }
        : draft;
    },
  };
  const result = await runPipeline(
    {
      workspaceId: 'ws1',
      text,
      kbVersion: 'v1',
      voice,
      autoSendEnabled: true,
      factSlots,
      ...(mode ? { factSlotsMode: true } : {}),
    },
    {
      extractor: createFixtureExtractor([
        {
          match: /./,
          result: {
            ...FIXTURE_EXTRACT_DEFAULT,
            labels: labels as ExtractResult['labels'],
            asks: [text],
            topics,
          },
        },
      ]),
      drafter,
      knowledge: knowledgeWith(chunks),
    },
  );
  if (result.status !== 'done') throw new Error(`expected done, got ${result.status}`);
  return result;
};

describe('fact plan không phụ thuộc cờ: cờ TẮT', () => {
  it('viplain-08: hỏi thời gian giao, nháp rỗng → câu dự phòng do code dựng từ thẻ (không chuyển người)', async () => {
    const r = await ask(
      'dat hnay bao lau nhan dc hang a',
      ['ship_time'],
      [{ label: 'advice' }],
      draftOf(''),
      false,
      [shipChunk],
    );
    expect(r.decision.action).toBe('answer');
    expect(r.reply).toContain('4 ngày');
    expect(r.factPlan).toBeUndefined();
    expect(r.slotDiagnostics?.chosen).toBe('fallback');
  });

  it('viplain-09: đổi trả thường + nhãn phụ complaint → answer (không ép chuyển người)', async () => {
    const r = await ask(
      'mac k vua dc doi k shop',
      ['returns'],
      [{ label: 'advice' }, { label: 'complaint' }],
      draftOf('Dạ shop cho đổi trong 7 ngày nếu còn nguyên tem mác ạ.'),
      false,
      [returnsChunk],
    );
    expect(r.decision.action).toBe('answer');
    expect(r.reply).toContain('7 ngày');
  });

  it('vi-12: hàng lỗi trùng phạm vi bảo hành → answer, bắt buộc người duyệt, không tự gửi; nháp rỗng → dự phòng từ thẻ bảo hành', async () => {
    const r = await ask(
      'Đường may bị bung thì có được bảo hành không shop',
      ['defect'],
      [{ label: 'advice' }, { label: 'complaint' }],
      draftOf(''),
      false,
      [warrantyChunk],
    );
    expect(r.decision).toMatchObject({
      action: 'answer',
      needsHuman: true,
      autoSendPolicy: 'never',
    });
    expect(r.reply).toContain('3 tháng');
    expect(r.riskReasons.review).toEqual(['defect_warranty_scope']);
  });

  it('vi-21: hàng lỗi + đổi trả nhưng phạm vi không khớp thẻ bảo hành → vẫn chuyển người (không mượn điều kiện đổi trả)', async () => {
    const r = await ask(
      'Áo bị lỗi khóa kéo, đổi trả thế nào shop',
      ['defect', 'returns'],
      [{ label: 'advice' }],
      draftOf('Dạ shop đổi trả trong 7 ngày ạ.'),
      false,
      [returnsChunk],
    );
    expect(r.decision.action).toBe('handoff');
  });

  it('nhãn CHÍNH complaint vẫn chuyển người; nháp tốt, không rỗng → giữ nguyên (không bị thay bằng câu dự phòng)', async () => {
    const primary = await ask(
      'Đường may bị bung thì có được bảo hành không shop',
      ['defect'],
      [{ label: 'complaint' }, { label: 'advice' }],
      draftOf('x'),
      false,
    );
    expect(primary.decision.action).toBe('handoff');
    const good = await ask(
      'mac k vua dc doi k shop',
      ['returns'],
      [{ label: 'advice' }],
      draftOf('Dạ shop cho đổi trong 7 ngày ạ.'),
      false,
      [returnsChunk],
    );
    expect(good.reply).toBe('Dạ shop cho đổi trong 7 ngày ạ.');
    expect(good.slotDiagnostics).toBeUndefined();
  });
});

describe('fact plan không phụ thuộc cờ: cờ BẬT hành vi y hệt chế độ chỗ giữ chỗ', () => {
  it('vi-12 và viplain-09 ở chế độ chỗ giữ chỗ: cùng quyết định như cờ tắt, nhưng câu do code điền và có factPlan', async () => {
    const warranty = await ask(
      'Đường may bị bung thì có được bảo hành không shop',
      ['defect'],
      [{ label: 'advice' }, { label: 'complaint' }],
      draftOf('Về bảo hành: {fact:warranty}.'),
      true,
    );
    expect(warranty.decision).toMatchObject({ action: 'answer', autoSendPolicy: 'never' });
    expect(warranty.reply).toBe('Về bảo hành: bảo hành đường may 3 tháng.');
    expect(warranty.factPlan).toBeDefined();
    const ship = await ask(
      'dat hnay bao lau nhan dc hang a',
      ['ship_time'],
      [{ label: 'advice' }],
      draftOf('Giao trong {fact:ship_time} bạn nhé.'),
      true,
    );
    expect(ship.decision.action).toBe('answer');
    expect(ship.reply).toContain('4 ngày');
  });
});
