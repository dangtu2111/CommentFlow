import { describe, expect, it } from 'vitest';
import { getMessages } from '../i18n/messages';
import { parseSpamRuleForm } from './spam-rules-form';

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

describe('FR-080 parseSpamRuleForm', () => {
  it('FR-080 form hợp lệ → quy tắc + ý định', () => {
    const r = parseSpamRuleForm(
      form({ intent: 'preview', name: 'Zalo', type: 'keyword', pattern: 'zalo', action: 'mark' }),
    );
    expect(r).toEqual({
      ok: true,
      intent: 'preview',
      rule: { name: 'Zalo', type: 'keyword', pattern: 'zalo', action: 'mark' },
    });
  });

  it('FR-080 ý định lạ → bad_request (nơi gọi trả 404)', () => {
    expect(parseSpamRuleForm(form({ intent: 'hide' }))).toEqual({ ok: false, code: 'bad_request' });
    expect(parseSpamRuleForm(form({}))).toEqual({ ok: false, code: 'bad_request' });
  });

  it('FR-080 US-050 action auto_hide từ client bị từ chối → invalid_rule', () => {
    expect(
      parseSpamRuleForm(
        form({ intent: 'save', name: 'a', type: 'phone', pattern: '', action: 'auto_hide' }),
      ),
    ).toEqual({ ok: false, code: 'invalid_rule' });
  });

  it('FR-080 regex nguy hiểm → invalid_rule', () => {
    expect(
      parseSpamRuleForm(
        form({ intent: 'preview', name: 'a', type: 'regex', pattern: '(a+)+$', action: 'mark' }),
      ),
    ).toEqual({ ok: false, code: 'invalid_rule' });
  });
});

describe('FR-080 chuỗi giao diện spamRules', () => {
  it('FR-080 vi và en cùng bộ khóa, không rỗng', () => {
    const flat = (o: unknown, p = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        typeof v === 'object' && v ? flat(v, `${p}${k}.`) : [`${p}${k}:${String(v) !== ''}`],
      );
    const vi = flat(getMessages('vi').spamRules);
    expect(vi.length).toBeGreaterThan(10);
    expect(vi.every((x) => x.endsWith(':true'))).toBe(true);
    expect(flat(getMessages('en').spamRules)).toEqual(vi);
  });
});
