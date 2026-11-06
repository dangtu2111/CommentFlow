import { describe, expect, it, vi } from 'vitest';
import type { ExtractResult } from '../classify/extract-result';
import type { Extractor } from '../classify/extractor';
import { createFixtureExtractor, FIXTURE_EXTRACT_DEFAULT } from '../classify/fixture-extractor';
import { type DraftResult, needsHumanResult } from '../draft/draft-result';
import type { Drafter } from '../draft/drafter';
import { createFixtureDrafter } from '../draft/fixture-drafter';
import { createDemoKnowledge } from './demo-knowledge';
import { runTryPipeline, type TryInput } from './try-pipeline';

const voice = {
  do: [],
  dont: [],
  shopPronoun: 'shop' as const,
  customerAddress: 'ban' as const,
};
const base: TryInput = {
  workspaceId: 'ws1',
  text: 'ship về Hà Nội bao nhiêu',
  kbVersion: 'v1',
  voice,
  autoSendEnabled: true,
};

const extract = (patch: Partial<ExtractResult>): ExtractResult => ({
  ...FIXTURE_EXTRACT_DEFAULT,
  ...patch,
});

const shipExtract = extract({
  labels: [{ label: 'advice', confidence: 0.95 }],
  asks: ['phí ship'],
});
const shipReply: DraftResult = {
  reply: 'Phí ship nội thành 20.000đ ạ',
  lang: 'vi',
  sources: ['demo-kb-ship'],
  claims: [{ text: 'Phí ship 20.000đ', source_ids: ['demo-kb-ship'], kind: 'fact' }],
  unanswered_topics: [],
  needs_human: false,
  reason: '',
  variants: [],
};

function deps(over: { extractor?: Extractor; drafter?: Drafter } = {}) {
  return {
    extractor: over.extractor ?? createFixtureExtractor([{ match: /ship/, result: shipExtract }]),
    drafter: over.drafter ?? createFixtureDrafter([{ match: /ship/, result: shipReply }]),
    knowledge: createDemoKnowledge(),
  };
}

describe('FR-059 FR-029 US-034 runTryPipeline', () => {
  it('chạy cả chuỗi: nhãn, nguồn kèm điểm, câu trả lời, độ tin cậy, billed=false', async () => {
    const r = await runTryPipeline(base, deps());
    expect(r.status).toBe('done');
    if (r.status !== 'done') return;
    expect(r.billed).toBe(false);
    expect(r.label).toBe('advice');
    expect(r.route).toBe('hybrid');
    expect(r.decision.action).toBe('answer');
    expect(r.reply).toBe('Phí ship nội thành 20.000đ ạ');
    expect(r.candidates[0]).toMatchObject({ id: 'demo-kb-ship', used: true });
    expect(r.candidates[0]?.score).toBeGreaterThan(0.35);
    expect(r.confidence.confidence).toBeGreaterThan(0);
    expect(r.guard.ok).toBe(true);
    expect(r.lang).toBe('vi');
  });

  it('chỉ emoji/tag → skipped, không gọi extractor/drafter', async () => {
    const extractor = { extract: vi.fn() };
    const drafter = { draft: vi.fn() };
    const r = await runTryPipeline(
      { ...base, text: '😀😀 @shop' },
      { ...deps(), extractor, drafter },
    );
    expect(r).toMatchObject({ status: 'skipped', billed: false });
    expect(extractor.extract).not.toHaveBeenCalled();
    expect(drafter.draft).not.toHaveBeenCalled();
  });

  it('che PII trước khi vào extractor và drafter (nguyên tắc #6)', async () => {
    const extractor = { extract: vi.fn(async () => shipExtract) };
    const drafter = { draft: vi.fn(async () => shipReply) };
    await runTryPipeline(
      { ...base, text: 'ship về nhà, sdt 0912345678 mail a@b.com' },
      { ...deps(), extractor, drafter },
    );
    const sent = JSON.stringify([extractor.extract.mock.calls, drafter.draft.mock.calls]);
    expect(sent).not.toContain('0912345678');
    expect(sent).not.toContain('a@b.com');
    expect(sent).toContain('[sđt]');
  });

  it('không nguồn đạt ngưỡng → không tự gửi (no source), vẫn không ném', async () => {
    const r = await runTryPipeline(
      { ...base, text: 'thời tiết hôm nay' },
      deps({
        extractor: createFixtureExtractor([
          { match: /thời tiết/, result: extract({ asks: ['thời tiết'] }) },
        ]),
        drafter: createFixtureDrafter([]),
      }),
    );
    expect(r.status).toBe('done');
    if (r.status !== 'done') return;
    expect(r.autoSend.allowed).toBe(false);
    expect(r.candidates).toEqual([]);
  });

  it('khiếu nại → handoff + không tự gửi', async () => {
    const r = await runTryPipeline(
      { ...base, text: 'hàng lỗi quá, ship chậm' },
      deps({
        extractor: createFixtureExtractor([
          {
            match: /lỗi/,
            result: extract({ labels: [{ label: 'complaint', confidence: 0.9 }], asks: ['ship'] }),
          },
        ]),
        drafter: { draft: async () => needsHumanResult('Hành động chuyển người') },
      }),
    );
    if (r.status !== 'done') throw new Error('expected done');
    expect(r.decision.action).toBe('handoff');
    expect(r.autoSend.allowed).toBe(false);
    expect(r.autoSend.reasons).toContain('needs_human');
  });

  it('số tiền lạ trong câu soạn → guard_money chặn tự gửi', async () => {
    const bad: DraftResult = { ...shipReply, reply: 'Phí ship 99.000đ ạ' };
    const r = await runTryPipeline(
      base,
      deps({ drafter: createFixtureDrafter([{ match: /ship/, result: bad }]) }),
    );
    if (r.status !== 'done') throw new Error('expected done');
    expect(r.guard.ok).toBe(false);
    expect(r.autoSend.reasons).toContain('guard_money');
  });

  it('hỏi giá sản phẩm đã nhận → route sql, nguồn sản phẩm', async () => {
    const r = await runTryPipeline(
      { ...base, text: 'áo thun basic giá bao nhiêu size M màu đen' },
      deps({
        extractor: createFixtureExtractor([
          {
            match: /áo thun/,
            result: extract({
              labels: [{ label: 'price', confidence: 0.95 }],
              product_mentions: ['áo thun basic'],
              size: 'M',
              color: 'đen',
              asks: ['giá'],
            }),
          },
        ]),
        drafter: createFixtureDrafter([
          {
            match: /áo thun/,
            result: {
              ...shipReply,
              reply: 'Áo thun basic giá 150.000đ ạ',
              sources: ['demo-p1'],
              claims: [{ text: 'giá', source_ids: ['demo-p1'], kind: 'fact' }],
            },
          },
        ]),
      }),
    );
    if (r.status !== 'done') throw new Error('expected done');
    expect(r.route).toBe('sql');
    expect(r.candidates[0]).toMatchObject({ id: 'demo-p1', kind: 'product' });
    expect(r.guard.ok).toBe(true);
  });

  it('truyền lang + productIds cho searchKb', async () => {
    const knowledge = createDemoKnowledge();
    const searchKb = vi.fn(knowledge.searchKb);
    await runTryPipeline(base, { ...deps(), knowledge: { ...knowledge, searchKb } });
    expect(searchKb).toHaveBeenCalledWith(expect.stringContaining('ship'), {
      lang: 'vi',
      productIds: [],
    });
  });

  it('không có import usage-meter / consume (không trừ lượt)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./try-pipeline.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/usage-meter|consume\(/);
  });
});
