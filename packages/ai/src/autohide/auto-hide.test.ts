import type { ExtractedContacts } from '@flow/shared';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import type { ContactSink } from '../pii';
import {
  type AutoHideComment,
  type AutoHideRule,
  loadAutoHideConfig,
  planAutoHide,
  runAutoHide,
} from './auto-hide';

const NOW = new Date('2026-11-06T10:00:00Z');
const PAST = new Date('2026-11-01T00:00:00Z');
const FUTURE = new Date('2026-11-10T00:00:00Z');
const ON = { enabled: true };
const PHONE_TEXT = 'ib em 0912345678 nhé';
const LINK_TEXT = 'xem tại https://spam.example.com/x';

const phoneRule: AutoHideRule = { type: 'phone', enabled: true, shadowUntil: null };
const linkRule: AutoHideRule = { type: 'link', enabled: true, shadowUntil: null };

function comment(over: Partial<AutoHideComment> = {}): AutoHideComment {
  return {
    id: 'c1',
    text: PHONE_TEXT,
    isOwn: false,
    deleted: false,
    isHidden: false,
    status: 'new',
    ...over,
  };
}
const plan = (c: AutoHideComment, rules: AutoHideRule[] = [phoneRule], config = ON) =>
  planAutoHide({ config, rules, comment: c, now: NOW });

describe('FR-081 loadAutoHideConfig', () => {
  it('chỉ đúng chữ "true" mới bật', () => {
    expect(loadAutoHideConfig({ AUTO_HIDE_ENABLED: 'true' }).enabled).toBe(true);
    for (const v of [undefined, '', 'TRUE', '1', 'yes', ' true']) {
      expect(loadAutoHideConfig({ AUTO_HIDE_ENABLED: v }).enabled).toBe(false);
    }
  });
});

describe('FR-081 planAutoHide', () => {
  it('SĐT + quy tắc phone bật → hide', () => {
    expect(plan(comment())).toMatchObject({ outcome: 'hide', matched: ['phone'] });
  });
  it('link + quy tắc link bật → hide', () => {
    expect(plan(comment({ text: LINK_TEXT }), [linkRule])).toMatchObject({
      outcome: 'hide',
      matched: ['link'],
    });
  });
  it('cả hai khớp → liệt kê cả hai, theo thứ tự quy tắc', () => {
    const r = plan(comment({ text: `${PHONE_TEXT} ${LINK_TEXT}` }), [linkRule, phoneRule]);
    expect(r).toMatchObject({ outcome: 'hide', matched: ['link', 'phone'] });
  });
  it('cờ tắt → skip disabled', () => {
    expect(plan(comment(), [phoneRule], { enabled: false })).toEqual({
      outcome: 'skip',
      reason: 'disabled',
    });
  });
  it('không có quy tắc bật / không khớp loại → skip no_rule', () => {
    expect(plan(comment(), [])).toEqual({ outcome: 'skip', reason: 'no_rule' });
    expect(plan(comment(), [{ ...phoneRule, enabled: false }])).toEqual({
      outcome: 'skip',
      reason: 'no_rule',
    });
    expect(plan(comment(), [linkRule])).toEqual({ outcome: 'skip', reason: 'no_rule' });
    expect(plan(comment({ text: 'giá bao nhiêu shop' }), [phoneRule, linkRule])).toEqual({
      outcome: 'skip',
      reason: 'no_rule',
    });
  });
  it('loại quy tắc khác phone/link (keyword…) bị bỏ qua dù khớp', () => {
    const bad = { type: 'keyword', enabled: true, shadowUntil: null } as unknown as AutoHideRule;
    expect(plan(comment({ text: 'keyword' }), [bad])).toEqual({
      outcome: 'skip',
      reason: 'no_rule',
    });
  });
  it('bình luận của Page / đã xóa / đã ẩn → skip', () => {
    expect(plan(comment({ isOwn: true }))).toEqual({ outcome: 'skip', reason: 'own' });
    expect(plan(comment({ deleted: true }))).toEqual({ outcome: 'skip', reason: 'deleted' });
    expect(plan(comment({ isHidden: true }))).toEqual({
      outcome: 'skip',
      reason: 'already_hidden',
    });
  });
  it('trạng thái không phải chưa-xử-lý → skip status', () => {
    for (const status of [
      'replied',
      'auto_replied',
      'sending',
      'hidden',
      'skipped',
      'send_failed',
    ]) {
      expect(plan(comment({ status }))).toEqual({ outcome: 'skip', reason: 'status' });
    }
    for (const status of ['new', 'pending_review', 'needs_human', 'spam_suspected']) {
      expect(plan(comment({ status })).outcome).toBe('hide');
    }
  });
  it('shadow_until còn hạn → would_hide; hết hạn (đúng mốc) → hide', () => {
    expect(plan(comment(), [{ ...phoneRule, shadowUntil: FUTURE }])).toMatchObject({
      outcome: 'would_hide',
      matched: ['phone'],
    });
    expect(plan(comment(), [{ ...phoneRule, shadowUntil: PAST }]).outcome).toBe('hide');
    expect(plan(comment(), [{ ...phoneRule, shadowUntil: NOW }]).outcome).toBe('hide');
  });
  it('một quy tắc chạy thật + một đang shadow → hide, chỉ liệt kê quy tắc chạy thật', () => {
    const r = plan(comment({ text: `${PHONE_TEXT} ${LINK_TEXT}` }), [
      phoneRule,
      { ...linkRule, shadowUntil: FUTURE },
    ]);
    expect(r).toMatchObject({ outcome: 'hide', matched: ['phone'] });
  });
  it('hide mang liên hệ gốc để lưu trước khi ẩn', () => {
    const r = plan(comment({ text: 'zalo 0912345678 a@b.co' }));
    expect(r.outcome).toBe('hide');
    if (r.outcome === 'hide') {
      expect(r.contacts).toEqual({ phones: ['0912345678'], emails: ['a@b.co'] });
    }
  });
  it('đầu vào hỏng → skip invalid_input, không ném', () => {
    expect(
      planAutoHide({ config: ON, rules: [phoneRule], comment: { id: 1 } as never, now: NOW }),
    ).toEqual({ outcome: 'skip', reason: 'invalid_input' });
    expect(planAutoHide({ config: ON, rules: 'x' as never, comment: comment(), now: NOW })).toEqual(
      { outcome: 'skip', reason: 'invalid_input' },
    );
  });
});

describe('FR-081 AI không bao giờ tự ẩn (property)', () => {
  it('trường nhãn/độ tin cậy/điểm của AI trong đầu vào không đổi quyết định', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 120 }),
        fc.constantFrom('spam', 'price', 'other', 'complaint'),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.boolean(),
        (text, label, confidence, needsHuman) => {
          const base = comment({ text });
          const noisy = {
            ...base,
            label,
            confidence,
            needsHuman,
            aiSpamScore: 1,
            action: 'hide',
          } as AutoHideComment;
          const rules = [phoneRule, linkRule];
          expect(planAutoHide({ config: ON, rules, comment: noisy, now: NOW })).toEqual(
            planAutoHide({ config: ON, rules, comment: base, now: NOW }),
          );
        },
      ),
      { seed: 81, numRuns: 200 },
    );
  });
  it('văn bản không có SĐT/link không bao giờ bị ẩn, dù nhãn là spam', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-zA-Zà-ỹ ,!?]{0,80}$/), (text) => {
        const noisy = { ...comment({ text }), label: 'spam', confidence: 1 } as AutoHideComment;
        const r = planAutoHide({
          config: ON,
          rules: [phoneRule, linkRule],
          comment: noisy,
          now: NOW,
        });
        expect(r.outcome).not.toBe('hide');
      }),
      { seed: 82, numRuns: 200 },
    );
  });
  it('cờ tắt → không bao giờ hide, với mọi văn bản', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (text) => {
        expect(plan(comment({ text }), [phoneRule, linkRule], { enabled: false }).outcome).toBe(
          'skip',
        );
      }),
      { seed: 83, numRuns: 200 },
    );
  });
});

describe('FR-081 runAutoHide: lưu khách trước, ẩn sau', () => {
  type Over = { save?: ContactSink['save']; request?: (id: string) => Promise<string | null> };
  const deps = (order: string[], over: Over = {}) => ({
    contactSink: {
      save:
        over.save ??
        (async (_w: string, c: ExtractedContacts) => {
          order.push(`save:${c.phones.join(',')}`);
        }),
    },
    hideRequester: {
      requestHide:
        over.request ??
        (async (id: string) => {
          order.push(`hide:${id}`);
          return 'h1';
        }),
    },
  });
  const input = (c = comment(), rules = [phoneRule]) => ({
    workspaceId: 'w1',
    config: ON,
    rules,
    comment: c,
    now: NOW,
  });

  it('lưu xong rồi mới yêu cầu ẩn', async () => {
    const order: string[] = [];
    const r = await runAutoHide(input(), deps(order));
    expect(order).toEqual(['save:0912345678', 'hide:c1']);
    expect(r).toEqual({ outcome: 'hide_requested', hideId: 'h1', matched: ['phone'] });
  });
  it('yêu cầu ẩn trả null (đã có việc đang chạy) → hide_requested hideId null', async () => {
    const r = await runAutoHide(input(), deps([], { request: async () => null }));
    expect(r).toEqual({ outcome: 'hide_requested', hideId: null, matched: ['phone'] });
  });
  it('chỉ có link (không liên hệ) → không gọi lưu, vẫn ẩn', async () => {
    const save = vi.fn();
    const r = await runAutoHide(
      input(comment({ text: LINK_TEXT }), [linkRule]),
      deps([], { save }),
    );
    expect(save).not.toHaveBeenCalled();
    expect(r.outcome).toBe('hide_requested');
  });
  it('lưu lỗi → KHÔNG ẩn, held, không lộ PII', async () => {
    const request = vi.fn();
    const save = async () => {
      throw new Error('dup 0912345678');
    };
    const r = await runAutoHide(input(), deps([], { save, request }));
    expect(request).not.toHaveBeenCalled();
    expect(r).toEqual({ outcome: 'held', reason: 'lead_save_failed' });
    expect(JSON.stringify(r)).not.toContain('0912345678');
  });
  it('yêu cầu ẩn ném lỗi → hide_failed chỉ có mã, không lộ nội dung', async () => {
    const request = async () => {
      throw new Error('boom 0912345678 ib em');
    };
    const r = await runAutoHide(input(), deps([], { request }));
    expect(r).toEqual({ outcome: 'hide_failed', reason: 'hide_request_failed' });
    expect(JSON.stringify(r)).not.toContain('0912345678');
  });
  it('would_hide / skip → không lưu, không ẩn', async () => {
    const save = vi.fn();
    const request = vi.fn();
    const shadow = await runAutoHide(
      input(comment(), [{ ...phoneRule, shadowUntil: FUTURE }]),
      deps([], { save, request }),
    );
    const off = await runAutoHide(
      { ...input(), config: { enabled: false } },
      deps([], { save, request }),
    );
    expect(shadow.outcome).toBe('would_hide');
    expect(off).toEqual({ outcome: 'skip', reason: 'disabled' });
    expect(save).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});
