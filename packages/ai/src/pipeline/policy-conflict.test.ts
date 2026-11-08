import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { ExtractResult } from '../classify/extract-result';
import { createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import type { DraftResult } from '../draft/draft-result';
import { createFixtureDrafter } from '../draft/fixture-drafter';
import { createDemoKnowledge } from '../try/demo-knowledge';
import type { TryCandidate, TryKnowledge } from '../try/try-pipeline';
import { type PipelineDeps, type PipelineInput, runPipeline } from './run-pipeline';

/**
 * Chính sách mâu thuẫn (KB-SYNC-DRAFT, quyết định 1): pipeline chỉ `handoff` khi đoạn dùng để trả lời thuộc nhóm mâu thuẫn của
 * ĐÚNG chủ đề khách hỏi; ý khác vẫn trả lời bình thường. Cờ đọc từ `kb_chunks.metadata` (qua `conflictTopic` của ứng viên).
 */
const voice = { do: [], dont: [], shopPronoun: 'shop' as const, customerAddress: 'ban' as const };
const input = (text: string): PipelineInput => ({
  workspaceId: 'ws1',
  text,
  kbVersion: 'v1',
  voice,
  autoSendEnabled: true,
});
const extractFor = (ask: string): ExtractResult => ({
  ...FIXTURE_EXTRACT_DEFAULT,
  labels: [{ label: 'advice' }],
  asks: [ask],
});
const reply: DraftResult = {
  reply: 'Dạ shop giao trong 2 ngày ạ',
  lang: 'vi',
  sources: ['kb:c1'],
  claims: [{ text: 'Giao trong 2 ngày', source_ids: ['kb:c1'], kind: 'fact' }],
  unanswered_topics: [],
  needs_human: false,
  reason: '',
  variants: [],
};
const candidate = (over: Partial<TryCandidate> = {}): TryCandidate => ({
  id: 'kb:c1',
  kind: 'kb',
  title: 'Chính sách giao hàng',
  text: unsafeMarkMasked('Giao trong 2 ngày.'),
  score: 0.9,
  topics: ['shipping'],
  conflictTopic: 'shipping_time',
  ...over,
});
const deps = (ask: string, found: TryCandidate[]): PipelineDeps => {
  const knowledge: TryKnowledge = { ...createDemoKnowledge(), searchKb: async () => found };
  return {
    extractor: createFixtureExtractor([{ match: /./, result: extractFor(ask) }]),
    drafter: createFixtureDrafter([{ match: /./, result: reply }]),
    knowledge,
  };
};
const decisionOf = async (text: string, ask: string, found: TryCandidate[]) => {
  const r = await runPipeline(input(text), deps(ask, found));
  if (r.status !== 'done') throw new Error(`expected done, got ${r.status}`);
  return r.decision;
};

describe('handoff khi đoạn dùng thuộc nhóm mâu thuẫn của đúng chủ đề khách hỏi', () => {
  it.each([
    ['khi nào hàng tới tay', 'khi nào hàng tới tay'],
    ['thời gian giao hàng bao lâu', 'thời gian giao hàng bao lâu'],
    ['when will it arrive?', 'when will it arrive?'],
  ])('"%s" + nguồn mâu thuẫn thời gian giao → handoff policy_conflict', async (text, ask) => {
    const d = await decisionOf(text, ask, [candidate()]);
    expect(d).toMatchObject({ action: 'handoff', reason: 'policy_conflict', needsHuman: true });
  });

  it('hỏi PHÍ ship khi chỉ thời gian giao mâu thuẫn → trả lời bình thường', async () => {
    const d = await decisionOf('phí ship bao nhiêu', 'phí ship bao nhiêu', [candidate()]);
    expect(d.action).not.toBe('handoff');
  });

  it('nguồn không mang cờ mâu thuẫn → trả lời bình thường', async () => {
    const d = await decisionOf('khi nào hàng tới tay', 'khi nào hàng tới tay', [
      candidate({ conflictTopic: undefined }),
    ]);
    expect(d.action).toBe('answer');
  });

  it('đoạn mâu thuẫn nằm dưới ngưỡng liên quan (không dùng để trả lời) → không handoff', async () => {
    const d = await decisionOf('khi nào hàng tới tay', 'khi nào hàng tới tay', [
      candidate({ score: 0.01 }),
    ]);
    expect(d.reason).not.toBe('policy_conflict');
  });
});
