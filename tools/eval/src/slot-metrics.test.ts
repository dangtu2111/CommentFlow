import { describe, expect, it } from 'vitest';
import type { EvalSample } from './dataset';
import type { SampleOutcome } from './run-sample';
import { renderSlotReport, sampleReplies, summarizeSlots } from './slot-metrics';

const ok = (id: string, over: Partial<Extract<SampleOutcome, { ok: true }>> = {}): SampleOutcome =>
  ({
    ok: true,
    id,
    action: 'answer',
    reply: `r-${id}`,
    moneyViolations: 0,
    usage: [],
    ...over,
  }) as SampleOutcome;
const slot = (chosen: 'reply' | 'fallback', rejected: number, over = {}) => ({
  diagnostics: { rawTexts: 3, rejected, chosen },
  required: 2,
  known: 1,
  unknown: 1,
  clarify: false,
  ...over,
});

describe('summarizeSlots', () => {
  it('cộng từ chối cứng, câu chọn, sự kiện, hỏi lại, vi phạm tiền cuối; bỏ qua mẫu lỗi và mẫu không đi đường fact plan', () => {
    const s = summarizeSlots([
      ok('a', { slot: slot('reply', 1) }),
      ok('b', { slot: slot('fallback', 3, { clarify: true }), moneyViolations: 1 }),
      ok('c'),
      { ok: false, id: 'd', errorKind: 'error', usage: [] },
    ]);
    expect(s).toMatchObject({
      total: 3,
      slotted: 2,
      rawTexts: 6,
      rejected: 4,
      chosen: { reply: 1, fallback: 1 },
      requiredFacts: 4,
      knownFacts: 2,
      unknownFacts: 2,
      clarify: 1,
      finalMoneyViolations: 1,
      actions: { answer: 3 },
    });
  });
  it('lượt không có chẩn đoán vẫn được tính vào slotted', () => {
    const s = summarizeSlots([ok('a', { slot: { ...slot('reply', 0), diagnostics: null } })]);
    expect(s.slotted).toBe(1);
    expect(s.rawTexts).toBe(0);
  });
});

describe('sampleReplies / renderSlotReport', () => {
  const samples = Array.from({ length: 25 }, (_, i) => ({
    id: `s${i}`,
    text: `q${i}`,
  })) as EvalSample[];
  const outcomes = new Map(samples.map((x) => [x.id, ok(x.id, { slot: slot('reply', 0) })]));
  it('trải đều đúng số lượng; ít hơn thì lấy hết', () => {
    expect(sampleReplies(samples, outcomes, 10)).toHaveLength(10);
    expect(sampleReplies(samples.slice(0, 4), outcomes, 10)).toHaveLength(4);
  });
  it('báo cáo có tổng hợp và câu mẫu', () => {
    const text = renderSlotReport(samples, outcomes);
    expect(text).toContain('Đường fact plan');
    expect(text).toContain('KHÁCH: q0');
    expect(text).toContain('0/75 (0.0%)');
  });
  it('không lượt nào → phần trăm "—"', () => {
    expect(renderSlotReport([], new Map())).toContain('0/0 (—)');
  });
});

import { innerCitySamples, renderPolicyDiff } from './slot-metrics';

describe('renderPolicyDiff / innerCitySamples', () => {
  const shop = {
    id: 's',
    texts: [
      { text: 'Đổi trả trong 7 ngày nếu sản phẩm còn tem mác. Bảo hành 12 tháng. Nhận COD.' },
    ],
    policyFacts: [
      { kind: 'returns', data: { days: 7, conditions: ['còn tem mác'] } },
      { kind: 'warranty', data: { months: 6 } },
      { kind: 'payment', data: { methods: ['cod'] } },
    ],
  };
  it('KHỚP / KHÁC / CHỈ BẢN KHAI / CHỈ ĐỀ XUẤT', () => {
    const text = renderPolicyDiff(shop);
    expect(text).toContain('- KHỚP returns');
    expect(text).toContain('- KHÁC warranty');
    expect(text).toContain('- CHỈ BẢN KHAI payment');
    expect(text).toContain('- CHỈ ĐỀ XUẤT cod');
    expect(renderPolicyDiff({ id: 'x', texts: [], policyFacts: [] })).toContain(
      '(không có dòng nào)',
    );
  });
  it('liệt kê mẫu "nội thành 20.000đ" nhưng không nhầm 320.000', () => {
    const mk = (id: string, text: string, mustContain: string[] = []) =>
      ({ id, text, expected: { mustContain } }) as never;
    expect(
      innerCitySamples([
        mk('a', 'ship nội thành bao nhiêu', ['20.000']),
        mk('b', 'giá', ['320.000']),
        mk('c', 'inner city fee?'),
      ]),
    ).toEqual(['a', 'c']);
  });
});

import { isStockTerm, termPresent } from './metrics';
import { renderFactBreakdown } from './slot-metrics';

describe('chấm sự kiện bắt buộc theo chế độ tồn kho của shop', () => {
  const mk = (id: string, text: string, mustContain: string[]) =>
    ({ id, text, expected: { mustContain } }) as never as EvalSample;
  const stock = mk('s1', 'Váy hoa nhí còn hàng không ạ', ['3']);
  const ret = mk('r1', 'Mua về không vừa có đổi được không shop', ['7']);
  const price = mk('p1', 'Váy hoa nhí bao nhiêu', ['320.000']);

  it('isStockTerm: chỉ số nguyên ≤ 3 chữ số trong câu hỏi tồn kho, không phải đổi trả', () => {
    expect(isStockTerm(stock, '3')).toBe(true);
    expect(isStockTerm(ret, '7')).toBe(false);
    expect(isStockTerm(price, '320.000')).toBe(false);
    expect(isStockTerm(mk('x', 'còn mấy cái', ['5']), '5')).toBe(true);
  });
  it('status: "còn hàng" đạt; quantity: phải có số', () => {
    expect(termPresent(stock, 'Váy hoa nhí hiện còn hàng nhé', '3', 'status')).toBe(true);
    expect(termPresent(stock, 'Váy hoa nhí hiện còn hàng nhé', '3', 'quantity')).toBe(false);
    expect(termPresent(stock, 'Còn 3 sản phẩm', '3', 'quantity')).toBe(true);
    expect(termPresent(stock, 'Chào bạn', '3', 'status')).toBe(false);
    expect(termPresent(ret, 'Đổi trong 7 ngày', '7', 'status')).toBe(true);
  });
  it('renderFactBreakdown tách tổng / tồn kho / ngoài tồn kho', () => {
    const out = new Map<string, SampleOutcome>([
      ['s1', ok('s1', { reply: 'còn hàng' })],
      ['r1', ok('r1', { reply: 'Đổi trong 7 ngày' })],
      ['p1', ok('p1', { reply: 'Giá 999' })],
    ]);
    const text = renderFactBreakdown([stock, ret, price], out, 'status');
    expect(text).toContain('Tổng: 2/3');
    expect(text).toContain('Riêng tồn kho: 1/1');
    expect(text).toContain('Ngoài tồn kho: 1/2');
    expect(renderFactBreakdown([], new Map(), 'quantity')).toContain('Tổng: 0/0');
  });
  it('đếm lưới chặn cuối', () => {
    const o = ok('n', {
      slot: {
        diagnostics: { rawTexts: 1, rejected: 1, chosen: 'handoff', finalNetTriggered: true },
        required: 1,
        known: 1,
        unknown: 0,
        clarify: false,
      },
    });
    expect(summarizeSlots([o]).finalNetTriggered).toBe(1);
  });
});
