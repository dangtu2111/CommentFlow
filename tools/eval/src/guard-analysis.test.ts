import { describe, expect, it } from 'vitest';
import { analyzeGuardRejections, renderGuardAnalysis } from './guard-analysis';
import type { SampleOutcome } from './run-sample';

const diag = (over: Record<string, unknown>) => ({
  usedSources: [],
  claims: [],
  moneyViolations: [],
  found: [],
  ...over,
});

const outcome = (over: Record<string, unknown>) =>
  ({
    ok: true,
    id: 's',
    action: 'answer',
    reason: 'all_sourced',
    reply: 'ok',
    moneyViolations: 0,
    usage: [],
    diagnostics: diag({}),
    ...over,
  }) as unknown as SampleOutcome;

const passage = (id: string, text: string, used = false) => ({
  id,
  kind: 'kb',
  topics: [],
  text,
  used,
});

describe('analyzeGuardRejections', () => {
  it('không mẫu nào bị bắt → 0; mẫu lỗi (ok=false) bị bỏ qua', () => {
    const out = analyzeGuardRejections([
      outcome({}),
      { ok: false, id: 'x', errorKind: 'error', usage: [] } as unknown as SampleOutcome,
    ]);
    expect(out).toMatchObject({ samples: 1, rejectedSamples: 0, oan: 0, that: 0 });
  });

  it('số tiền bị bắt: có trong một đoạn found khác → OAN (kèm id đoạn); không đoạn nào → THẬT', () => {
    const reply = 'Phí ship 30.000đ, giao trong 3 ngày.';
    const violations = [{ kind: 'money', display: '30.000đ' }];
    const first = passage('kb:a', 'Giao hàng nhanh.', true);
    const second = passage('kb:b', 'Phí ship toàn quốc 30.000đ.');
    const oan = analyzeGuardRejections([
      outcome({
        id: 'o1',
        reply,
        moneyViolations: 1,
        diagnostics: diag({ moneyViolations: violations, found: [first, second] }),
      }),
    ]);
    expect(oan.rejections[0]).toMatchObject({ kind: 'money', verdict: 'oan' });
    expect(oan.rejections[0]?.items[0]).toMatchObject({ inFound: true, foundIn: ['kb:b'] });
    const that = analyzeGuardRejections([
      outcome({
        id: 't1',
        reply,
        moneyViolations: 1,
        diagnostics: diag({ moneyViolations: violations, found: [first] }),
      }),
    ]);
    expect(that.rejections[0]).toMatchObject({ verdict: 'that' });
    expect(that.that).toBe(1);
  });

  it('khái niệm bị bắt: COD có ở đoạn found khác → OAN; không có → THẬT; nhiều khái niệm lệch nhau → HỖN HỢP', () => {
    const used = passage('kb:a', 'Phí ship 30.000đ.', true);
    const other = passage('kb:b', 'Shop hỗ trợ ship COD toàn quốc.');
    const run = (id: string, draftReply: string, concepts: string[], found: unknown[]) =>
      analyzeGuardRejections([
        outcome({
          id,
          diagnostics: diag({
            found,
            guardTrace: { concept: { concepts, draftReply, usedIds: ['kb:a'] } },
          }),
        }),
      ]);
    expect(run('c1', 'Dạ có COD ạ.', ['cod'], [used, other]).rejections[0]?.verdict).toBe('oan');
    expect(run('c2', 'Dạ có COD ạ.', ['cod'], [used]).rejections[0]?.verdict).toBe('that');
    expect(
      run('c3', 'Có COD và có trả góp ạ.', ['cod', 'installment'], [used, other]).rejections[0]
        ?.verdict,
    ).toBe('hon_hop');
  });

  it('đếm handoff/claim_unsupported; mẫu bị bắt cả tiền lẫn khái niệm chỉ tính một mẫu; báo cáo liệt kê từng mẫu', () => {
    const out = analyzeGuardRejections([
      outcome({ id: 'h', action: 'handoff', reason: 'claim_unsupported' }),
      outcome({
        id: 'm',
        reply: 'Giá 5.000đ, có COD.',
        moneyViolations: 1,
        diagnostics: diag({
          moneyViolations: [{ kind: 'money', display: '5.000đ' }],
          found: [],
          guardTrace: { concept: { concepts: ['cod'], draftReply: 'Có COD.', usedIds: [] } },
        }),
      }),
    ]);
    expect(out).toMatchObject({
      handoffClaimUnsupported: 1,
      rejectedSamples: 1,
      money: 1,
      concept: 1,
    });
    const text = renderGuardAnalysis(out);
    expect(text).toContain('Mẫu bị guard bắt: 1/2');
    expect(text).toContain('- m [money] THẬT: 5.000đ ∉ found');
    expect(text).toContain('- m [concept] THẬT: cod ∉ found');
    expect(renderGuardAnalysis(analyzeGuardRejections([]))).not.toContain('- m ');
  });

  it('vi phạm không có chuỗi hiển thị bị bỏ qua (không ném lỗi)', () => {
    const out = analyzeGuardRejections([
      outcome({ diagnostics: diag({ moneyViolations: [{ kind: 'money' }, null as never] }) }),
    ]);
    expect(out.rejectedSamples).toBe(0);
  });
});
