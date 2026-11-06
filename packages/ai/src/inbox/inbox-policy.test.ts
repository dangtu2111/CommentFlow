import { CONVERSATION_AUTO_WINDOW_MS, CONVERSATION_HUMAN_WINDOW_MS } from '@flow/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sendRecheck } from '../recheck';
import {
  DEFAULT_MAX_AI_TURNS,
  decideInboxSend,
  deriveInboxState,
  type InboxSendInput,
  inboxWindow,
  isExpiringSoon,
  messageRecheckFor,
  shouldHandoffToHuman,
} from './inbox-policy';

const NOW = new Date('2026-11-06T03:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const H = 3_600_000;

function input(over: Partial<InboxSendInput> = {}): InboxSendInput {
  return {
    sender: 'ai',
    now: NOW,
    lastCustomerMsgAt: ago(H),
    status: 'open',
    aiEnabled: true,
    aiTurns: 0,
    maxAiTurns: 5,
    ...over,
  };
}

describe('FR-047 inboxWindow — cửa sổ 24 giờ/7 ngày (biên loại trừ, khớp R8)', () => {
  it('mốc dưới/đúng/trên 24 giờ và 7 ngày', () => {
    expect(inboxWindow(ago(CONVERSATION_AUTO_WINDOW_MS - 1), NOW)).toBe('open');
    expect(inboxWindow(ago(CONVERSATION_AUTO_WINDOW_MS), NOW)).toBe('human_only');
    expect(inboxWindow(ago(CONVERSATION_HUMAN_WINDOW_MS - 1), NOW)).toBe('human_only');
    expect(inboxWindow(ago(CONVERSATION_HUMAN_WINDOW_MS), NOW)).toBe('closed');
  });
  it('chưa có tin khách hoặc ngày hỏng → closed', () => {
    expect(inboxWindow(null, NOW)).toBe('closed');
    expect(inboxWindow(new Date('x'), NOW)).toBe('closed');
    expect(inboxWindow(ago(H), new Date('x'))).toBe('closed');
  });
  it('lệch đồng hồ ≤ 5 phút → open; quá 5 phút ở tương lai → closed', () => {
    expect(inboxWindow(new Date(NOW.getTime() + 5 * 60_000), NOW)).toBe('open');
    expect(inboxWindow(new Date(NOW.getTime() + 5 * 60_000 + 1), NOW)).toBe('closed');
  });
});

describe('FR-047 decideInboxSend — AI', () => {
  it('trong 24 giờ, AI bật, còn lượt → được, không thẻ', () => {
    expect(decideInboxSend(input())).toEqual({ allowed: true, tag: null });
  });
  it('sau 24 giờ AI bị chặn (chỉ nhân viên)', () => {
    expect(decideInboxSend(input({ lastCustomerMsgAt: ago(25 * H) }))).toEqual({
      allowed: false,
      reason: 'ai_window_expired',
    });
  });
  it('sau 7 ngày: đóng', () => {
    expect(decideInboxSend(input({ lastCustomerMsgAt: ago(8 * 24 * H) }))).toEqual({
      allowed: false,
      reason: 'window_closed',
    });
  });
  it('AI tắt / hết lượt / đã giải quyết / tham số hỏng', () => {
    expect(decideInboxSend(input({ aiEnabled: false }))).toEqual({
      allowed: false,
      reason: 'ai_disabled',
    });
    expect(decideInboxSend(input({ aiTurns: 4 })).allowed).toBe(true);
    expect(decideInboxSend(input({ aiTurns: 5 }))).toEqual({
      allowed: false,
      reason: 'ai_turns_exhausted',
    });
    expect(decideInboxSend(input({ status: 'resolved' }))).toEqual({
      allowed: false,
      reason: 'conversation_resolved',
    });
    const bads: Partial<InboxSendInput>[] = [
      { aiTurns: -1 },
      { aiTurns: 1.5 },
      { maxAiTurns: -1 },
      { maxAiTurns: 0.5 },
    ];
    for (const bad of bads) {
      expect(decideInboxSend(input(bad))).toEqual({ allowed: false, reason: 'input_invalid' });
    }
    expect(DEFAULT_MAX_AI_TURNS).toBe(5);
  });
});

describe('FR-047 decideInboxSend — nhân viên', () => {
  const staff = (over: Partial<InboxSendInput> = {}) => input({ sender: 'staff', ...over });
  it('trong 24 giờ: gửi không thẻ, kể cả khi AI tắt/hết lượt/đã giải quyết', () => {
    expect(decideInboxSend(staff())).toEqual({ allowed: true, tag: null });
    expect(decideInboxSend(staff({ aiEnabled: false, aiTurns: 99, status: 'resolved' }))).toEqual({
      allowed: true,
      tag: null,
    });
  });
  it('24 giờ–7 ngày: bắt buộc thẻ HUMAN_AGENT', () => {
    expect(decideInboxSend(staff({ lastCustomerMsgAt: ago(25 * H) }))).toEqual({
      allowed: true,
      tag: 'HUMAN_AGENT',
    });
  });
  it('quá 7 ngày / chưa có tin khách: khóa', () => {
    for (const last of [ago(CONVERSATION_HUMAN_WINDOW_MS), null]) {
      expect(decideInboxSend(staff({ lastCustomerMsgAt: last }))).toEqual({
        allowed: false,
        reason: 'window_closed',
      });
    }
  });
});

describe('FR-047 quyền gửi khớp R8 của sendRecheck (property)', () => {
  const comment = (status: string) => ({
    status,
    externalReplyId: null,
    isHidden: false,
    mergedIntoId: null,
    deletedAt: null,
  });
  const common = {
    target: 'message',
    now: NOW.toISOString(),
    channel: { status: 'connected', sendSuspended: false },
    rate: null,
  };

  it('mọi thời điểm: quyền cửa sổ của inbox ⇔ R8 qua (AI = auto, nhân viên = human)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -600_000, max: 9 * 24 * H }),
        fc.constantFrom('ai', 'staff'),
        (elapsed, sender) => {
          const last = ago(elapsed);
          const permission = decideInboxSend(input({ sender, lastCustomerMsgAt: last }));
          const message = messageRecheckFor(sender, last);
          const result =
            sender === 'ai'
              ? sendRecheck({
                  ...common,
                  mode: 'auto',
                  comment: comment('scheduled_auto'),
                  automation: {
                    aiEnabled: true,
                    emergencyStopped: false,
                    aiPaused: false,
                    level: 'auto',
                  },
                  price: { hasMoney: false, snapshot: [], current: [] },
                  kb: { draftVersion: 'v1', currentVersion: 'v1', changeAffectsDraft: false },
                  quota: {
                    turnsRemaining: 10,
                    aiCostCapUsd: 50,
                    aiCostMonthUsd: 1,
                    dailyCap: 100,
                    autoSentToday: 1,
                  },
                  message,
                } as never)
              : sendRecheck({
                  ...common,
                  mode: 'human',
                  comment: comment('sending'),
                  automation: null,
                  price: null,
                  kb: null,
                  quota: null,
                  message,
                } as never);
          expect(permission.allowed).toBe(result.ok);
        },
      ),
      { seed: 47 },
    );
  });

  it('không có tin khách → messageRecheckFor trả null (R8 chặn)', () => {
    expect(messageRecheckFor('ai', null)).toBeNull();
  });
});

describe('FR-047 deriveInboxState — chọn trạng thái hiển thị', () => {
  const s = (over: Partial<Parameters<typeof deriveInboxState>[0]> = {}) =>
    deriveInboxState({
      now: NOW,
      lastCustomerMsgAt: ago(H),
      status: 'open',
      aiEnabled: true,
      aiTurns: 0,
      maxAiTurns: 5,
      ...over,
    });
  it('thứ tự ưu tiên', () => {
    expect(s({ status: 'resolved', aiEnabled: false })).toBe('resolved');
    expect(s({ lastCustomerMsgAt: ago(9 * 24 * H) })).toBe('expired');
    expect(s({ lastCustomerMsgAt: ago(30 * H) })).toBe('staff_only');
    expect(s()).toBe('ai_handling');
    expect(s({ aiEnabled: false })).toBe('staff_handling');
    expect(s({ aiTurns: 5 })).toBe('staff_handling');
    expect(s({ aiTurns: -1 })).toBe('staff_handling');
  });
  it('property: luôn ra đúng một trạng thái hợp lệ; ai_handling ⇒ AI được gửi', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: -H, max: 10 * 24 * H }), { nil: null }),
        fc.constantFrom('open', 'resolved'),
        fc.boolean(),
        fc.integer({ min: -2, max: 10 }),
        (elapsed, status, aiEnabled, aiTurns) => {
          const last = elapsed === null ? null : ago(elapsed);
          const st = s({ lastCustomerMsgAt: last, status, aiEnabled, aiTurns });
          expect(['resolved', 'expired', 'staff_only', 'ai_handling', 'staff_handling']).toContain(
            st,
          );
          if (st === 'ai_handling') {
            expect(
              decideInboxSend(input({ lastCustomerMsgAt: last, aiEnabled, aiTurns, status }))
                .allowed,
            ).toBe(true);
          }
        },
      ),
      { seed: 48 },
    );
  });
});

describe('US-020 isExpiringSoon — sắp hết 24 giờ (< 2 giờ)', () => {
  it('chỉ khi đang open và còn < 2 giờ', () => {
    expect(isExpiringSoon(ago(CONVERSATION_AUTO_WINDOW_MS - 2 * H + 1), NOW)).toBe(true);
    expect(isExpiringSoon(ago(CONVERSATION_AUTO_WINDOW_MS - 2 * H), NOW)).toBe(false);
    expect(isExpiringSoon(ago(H), NOW)).toBe(false);
    expect(isExpiringSoon(ago(25 * H), NOW)).toBe(false);
    expect(isExpiringSoon(null, NOW)).toBe(false);
  });
});

describe('FR-047 shouldHandoffToHuman — chuyển người', () => {
  it('hỏi lại ≥ 3 lần hoặc đòi gặp người', () => {
    expect(shouldHandoffToHuman({ repeatCount: 2, askedForHuman: false })).toEqual({
      handoff: false,
      reason: null,
    });
    expect(shouldHandoffToHuman({ repeatCount: 3, askedForHuman: false })).toEqual({
      handoff: true,
      reason: 'repeat_limit',
    });
    expect(shouldHandoffToHuman({ repeatCount: 0, askedForHuman: true })).toEqual({
      handoff: true,
      reason: 'asked_for_human',
    });
  });
  it('đòi gặp người ưu tiên hơn; đầu vào hỏng → chuyển người', () => {
    expect(shouldHandoffToHuman({ repeatCount: 9, askedForHuman: true }).reason).toBe(
      'asked_for_human',
    );
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(shouldHandoffToHuman({ repeatCount: bad, askedForHuman: false })).toEqual({
        handoff: true,
        reason: 'input_invalid',
      });
    }
  });
  it('property: đơn điệu theo repeatCount', () => {
    fc.assert(
      fc.property(fc.nat(50), (n) => {
        const a = shouldHandoffToHuman({ repeatCount: n, askedForHuman: false }).handoff;
        const b = shouldHandoffToHuman({ repeatCount: n + 1, askedForHuman: false }).handoff;
        expect(a && !b).toBe(false);
      }),
      { seed: 49 },
    );
  });
});
