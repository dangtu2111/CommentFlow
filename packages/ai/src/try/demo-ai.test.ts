import { unsafeMarkMasked } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { createDemoDrafter, createDemoExtractor } from './demo-ai';

const q = (text: string) => ({ workspaceId: 'ws1', text: unsafeMarkMasked(text) });

describe('FR-027 FR-029 bản mock theo từ khóa cho ô Thử AI', () => {
  const extractor = createDemoExtractor();

  it('khiếu nại / mua / giá / còn lại', async () => {
    expect((await extractor.extract(q('hàng lỗi, tôi muốn hoàn tiền'))).labels[0]?.label).toBe(
      'complaint',
    );
    expect((await extractor.extract(q('chốt đơn áo thun basic'))).labels[0]?.label).toBe(
      'purchase',
    );
    expect((await extractor.extract(q('váy hoa nhí giá bao nhiêu'))).labels[0]?.label).toBe(
      'price',
    );
    expect((await extractor.extract(q('cho mình hỏi ship'))).labels[0]?.label).toBe('advice');
    expect((await extractor.extract(q('ok'))).labels[0]?.label).toBe('other');
  });

  it('tách size, màu, sản phẩm, ý hỏi', async () => {
    const r = await extractor.extract(q('áo thun basic size M màu đen còn hàng không, giá sao'));
    expect(r).toMatchObject({ size: 'M', color: 'đen', product_mentions: ['áo thun basic'] });
    expect(r.asks).toEqual(expect.arrayContaining(['giá', 'tồn kho']));
  });

  it('"ship … bao nhiêu" / "giảm giá" là hỏi phí/khuyến mãi, KHÔNG thêm ý "giá" sản phẩm (như model thật)', async () => {
    const ex = createDemoExtractor();
    for (const [text, expected] of [
      ['ship về Hà Nội bao nhiêu', ['phí ship']],
      ['giảm giá không shop', ['giảm giá']],
      ['áo này bao nhiêu', ['giá']],
    ] as const) {
      const r = await ex.extract({ workspaceId: 'w', text: unsafeMarkMasked(text) });
      expect(r.asks).toEqual(expected);
    }
  });

  it('không gọi LLM/mạng: kết quả xác định', async () => {
    const a = await extractor.extract(q('ship về hà nội'));
    const b = await extractor.extract(q('ship về hà nội'));
    expect(a).toEqual(b);
    expect(a.asks).toContain('phí ship');
  });
});

describe('createDemoDrafter', () => {
  const drafter = createDemoDrafter();
  const base = {
    workspaceId: 'ws1',
    question: unsafeMarkMasked('x'),
    lang: 'vi' as const,
    kbVersion: 'v1',
    voice: { do: [], dont: [], shopPronoun: 'shop' as const, customerAddress: 'ban' as const },
  };
  const src = (id: string, relevance: number) => ({
    id,
    kind: 'kb' as const,
    text: unsafeMarkMasked(`Nội dung ${id}`),
    relevance,
  });

  it('answer có nguồn đạt ngưỡng → câu trả lời từ nguồn, claims fact trỏ đúng id', async () => {
    const r = await drafter.draft({
      ...base,
      sources: [src('a', 0.9), src('b', 0.1)],
      decision: { action: 'answer', clarify: null, unansweredTopics: [], redirectTemplates: [] },
    });
    expect(r.needs_human).toBe(false);
    expect(r.sources).toEqual(['a']);
    expect(r.reply).toContain('Nội dung a');
    expect(r.claims[0]).toMatchObject({ kind: 'fact', source_ids: ['a'] });
  });

  it('handoff hoặc không nguồn → needs_human, không câu trả lời', async () => {
    const h = await drafter.draft({
      ...base,
      sources: [src('a', 0.9)],
      decision: { action: 'handoff', clarify: null, unansweredTopics: [], redirectTemplates: [] },
    });
    expect(h.needs_human).toBe(true);
    const n = await drafter.draft({ ...base, sources: [src('a', 0.1)] });
    expect(n.needs_human).toBe(true);
    expect(n.reply).toBe('');
  });

  it('clarify → câu hỏi lại, không cần nguồn, không có ý fact', async () => {
    const r = await drafter.draft({
      ...base,
      sources: [],
      decision: {
        action: 'clarify',
        clarify: { ask: 'variant', axes: ['size'], options: [] },
        unansweredTopics: [],
        redirectTemplates: [],
      },
    });
    expect(r.needs_human).toBe(false);
    expect(r.claims.every((c) => c.kind !== 'fact')).toBe(true);
    expect(r.reply).not.toBe('');
  });

  it('redirect → trả phần có nguồn rồi mời ib shop', async () => {
    const r = await drafter.draft({
      ...base,
      sources: [src('a', 0.9)],
      decision: {
        action: 'redirect',
        clarify: null,
        unansweredTopics: ['discount'],
        redirectTemplates: ['discount'],
      },
    });
    expect(r.reply).toContain('Nội dung a');
    expect(r.claims.some((c) => c.kind === 'handoff')).toBe(true);
  });
});
