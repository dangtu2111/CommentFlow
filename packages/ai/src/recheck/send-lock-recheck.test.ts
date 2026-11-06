import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RECHECK_REASONS, type SendRecheckInput, sendRecheck } from './send-recheck';

/** FR-116: khóa gửi của Admin chặn ở R3 trong MỌI chế độ (người bấm Gửi cũng bị chặn). */
const NOW = '2026-11-06T03:00:00.000Z';

function human(over: Partial<SendRecheckInput> = {}): SendRecheckInput {
  return {
    mode: 'human',
    target: 'comment',
    now: NOW,
    comment: {
      status: 'sending',
      externalReplyId: null,
      isHidden: false,
      mergedIntoId: null,
      deletedAt: null,
    },
    channel: { status: 'connected', sendSuspended: false },
    automation: null,
    price: null,
    kb: null,
    quota: null,
    message: null,
    rate: null,
    ...over,
  };
}

function auto(over: Partial<SendRecheckInput> = {}): SendRecheckInput {
  return human({
    mode: 'auto',
    comment: {
      status: 'scheduled_auto',
      externalReplyId: null,
      isHidden: false,
      mergedIntoId: null,
      deletedAt: null,
    },
    automation: { aiEnabled: true, emergencyStopped: false, aiPaused: false, level: 'auto' },
    price: { hasMoney: false, snapshot: [], current: [] },
    kb: { draftVersion: 'v1', currentVersion: 'v1', changeAffectsDraft: false },
    quota: {
      turnsRemaining: 10,
      aiCostCapUsd: 50,
      aiCostMonthUsd: 1,
      dailyCap: 100,
      autoSentToday: 1,
    },
    ...over,
  });
}

describe('FR-116 sendRecheck R3 — khóa gửi của Admin', () => {
  it('lý do mới nằm trong RECHECK_REASONS', () => {
    expect(RECHECK_REASONS).toContain('admin_send_locked');
    expect(RECHECK_REASONS).toContain('send_lock_unknown');
  });

  it('không truyền sendLock / chưa khóa → qua', () => {
    expect(sendRecheck(human()).ok).toBe(true);
    expect(sendRecheck(human({ sendLock: { locked: false } })).ok).toBe(true);
    expect(sendRecheck(auto({ sendLock: { locked: false } })).ok).toBe(true);
  });

  it('bị khóa → trượt R3 ở cả human và auto, action channel_error', () => {
    for (const make of [human, auto]) {
      expect(sendRecheck(make({ sendLock: { locked: true } }))).toEqual({
        ok: false,
        rule: 'recheck:R3',
        reason: 'admin_send_locked',
        action: 'channel_error',
        rulesPassed: 2,
      });
    }
  });

  it('khóa không đọc được / đọc lỗi (null) → send_lock_unknown ở R3', () => {
    for (const sendLock of [
      { locked: true, unreadable: true },
      { locked: false, unreadable: true },
      null,
    ]) {
      for (const make of [human, auto]) {
        expect(sendRecheck(make({ sendLock }))).toMatchObject({
          ok: false,
          rule: 'recheck:R3',
          reason: 'send_lock_unknown',
          action: 'channel_error',
        });
      }
    }
  });

  it('áp cho cả tin nhắn', () => {
    const r = sendRecheck(human({ target: 'message', sendLock: { locked: true } }));
    expect(r).toMatchObject({ ok: false, reason: 'admin_send_locked' });
  });

  it('R1/R2 vẫn trượt trước R3 (thứ tự cố định)', () => {
    const replied = human({
      sendLock: { locked: true },
      comment: {
        status: 'sending',
        externalReplyId: 'x',
        isHidden: false,
        mergedIntoId: null,
        deletedAt: null,
      },
    });
    expect(sendRecheck(replied)).toMatchObject({ rule: 'recheck:R1' });
  });

  it('property: bị khóa thì không bao giờ ok, bất kể chế độ/đích', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('human', 'auto'),
        fc.constantFrom('comment', 'message'),
        fc.boolean(),
        (mode, target, unreadable) => {
          const input = mode === 'human' ? human({ target }) : auto({ target });
          const sendLock = unreadable ? { locked: true, unreadable: true } : { locked: true };
          expect(sendRecheck({ ...input, sendLock }).ok).toBe(false);
        },
      ),
    );
  });
});
