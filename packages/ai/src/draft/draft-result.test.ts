import { isAppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { enforceClaimSources, needsHumanResult, parseDraftOutput } from './draft-result';

const good = {
  reply: 'Dạ áo này giá 199.000đ ạ.',
  lang: 'vi',
  sources: ['kb-1', 'kb-1', 'sp-2'],
  claims: [
    { text: 'Chào bạn', source_ids: [], kind: 'greeting' },
    { text: 'Giá 199.000đ', source_ids: ['sp-2'], kind: 'fact' },
  ],
  unanswered_topics: [' ship ', ''],
  needs_human: false,
  reason: '',
};

function codeOf(text: string): unknown {
  try {
    parseDraftOutput(text);
  } catch (e) {
    return isAppError(e) ? e.code : 'khác';
  }
  return 'không ném';
}

describe('FR-029 đọc đầu ra soạn trả lời', () => {
  it('đọc JSON hợp lệ, khử trùng sources, làm sạch unanswered_topics', () => {
    const r = parseDraftOutput(JSON.stringify(good));
    expect(r.sources).toEqual(['kb-1', 'sp-2']);
    expect(r.unanswered_topics).toEqual(['ship']);
    expect(r.lang).toBe('vi');
    expect(r.needs_human).toBe(false);
  });

  it('bỏ hàng rào ```json và chữ thừa', () => {
    const r = parseDraftOutput(`Đây:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\``);
    expect(r.reply).toContain('199.000đ');
  });

  it('không phải JSON / sai schema / thiếu trường → LLM_UNAVAILABLE', () => {
    const bads = [
      'không json',
      '{ hỏng',
      '{ hỏng }',
      '{"a":1}',
      JSON.stringify({ ...good, lang: 'fr' }),
      JSON.stringify({ ...good, claims: [{ text: 'x', source_ids: [], kind: 'lạ' }] }),
      JSON.stringify({ ...good, needs_human: 'có' }),
    ];
    for (const bad of bads) expect(codeOf(bad)).toBe('LLM_UNAVAILABLE');
  });

  it('reply rỗng khi không needs_human → không đọc được; needs_human thì reply rỗng được', () => {
    expect(codeOf(JSON.stringify({ ...good, reply: '  ' }))).toBe('LLM_UNAVAILABLE');
    const r = parseDraftOutput(
      JSON.stringify({ ...good, reply: '', needs_human: true, reason: 'Khách khiếu nại' }),
    );
    expect(r.needs_human).toBe(true);
    expect(r.reason).toBe('Khách khiếu nại');
  });

  it('needs_human mà thiếu reason → có lý do mặc định', () => {
    const r = parseDraftOutput(
      JSON.stringify({ ...good, needs_human: true, reply: '', reason: '' }),
    );
    expect(r.reason).not.toBe('');
  });

  it('thông báo lỗi không chứa đầu ra thô', () => {
    try {
      parseDraftOutput('bi-mat-khach-0901234567');
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('0901234567');
    }
  });
});

describe('FR-140 kiểm nguồn của từng ý', () => {
  const allowed = new Set(['kb-1', 'sp-2']);
  const withClaims = (claims: unknown[]) => parseDraftOutput(JSON.stringify({ ...good, claims }));

  it('mọi ý fact trỏ nguồn đã đưa vào prompt → giữ nguyên', () => {
    const r = parseDraftOutput(JSON.stringify(good));
    expect(enforceClaimSources(r, allowed)).toEqual(r);
  });

  it('ý fact không có source_ids → needs_human "Thiếu nguồn", reply rỗng', () => {
    const out = enforceClaimSources(
      withClaims([{ text: 'Còn hàng', source_ids: [], kind: 'fact' }]),
      allowed,
    );
    expect(out.needs_human).toBe(true);
    expect(out.reason).toBe('Thiếu nguồn');
    expect(out.reply).toBe('');
  });

  it('ý fact trỏ id lạ (không thuộc prompt) → Thiếu nguồn', () => {
    const r = withClaims([{ text: 'x', source_ids: ['ma-bia'], kind: 'fact' }]);
    expect(enforceClaimSources(r, allowed).reason).toBe('Thiếu nguồn');
  });

  it('sources[] chứa id lạ → Thiếu nguồn', () => {
    const r = parseDraftOutput(JSON.stringify({ ...good, sources: ['ma-bia'] }));
    expect(enforceClaimSources(r, allowed).needs_human).toBe(true);
  });

  it('ý greeting/question_back/handoff không cần nguồn', () => {
    const r = withClaims(
      ['greeting', 'question_back', 'handoff'].map((kind) => ({
        text: 'a',
        source_ids: [],
        kind,
      })),
    );
    expect(enforceClaimSources(r, allowed).needs_human).toBe(false);
  });

  it('đã needs_human sẵn → giữ lý do của model, không ghi đè', () => {
    const r = parseDraftOutput(
      JSON.stringify({
        ...good,
        reply: '',
        needs_human: true,
        reason: 'Khiếu nại',
        claims: [{ text: 'x', source_ids: [], kind: 'fact' }],
      }),
    );
    expect(enforceClaimSources(r, allowed).reason).toBe('Khiếu nại');
  });

  it('needsHumanResult: không reply, không nguồn, có lý do', () => {
    const r = needsHumanResult('Không có kiến thức liên quan', 'en');
    expect(r).toMatchObject({
      reply: '',
      lang: 'en',
      sources: [],
      claims: [],
      needs_human: true,
      reason: 'Không có kiến thức liên quan',
    });
  });
});
