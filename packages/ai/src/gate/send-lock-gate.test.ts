import { describe, expect, it } from 'vitest';
import {
  type AutoSendInput,
  DEFAULT_THRESHOLD,
  decideAutoSend,
  GATE_REASONS,
} from './auto-send-gate';

/** FR-116: khóa gửi của Admin nền tảng chặn ở cổng 1 (cùng nhóm với công tắc/Dừng khẩn cấp). */
const NOW = '2026-11-06T03:00:00.000Z'; // 10:00 thứ Sáu giờ Việt Nam

function base(over: Partial<AutoSendInput> = {}): AutoSendInput {
  return {
    target: 'comment',
    now: NOW,
    workspace: { aiEnabled: true, emergencyStopped: false, aiCostCapUsd: 50, aiCostMonthUsd: 10 },
    levels: { channelLabel: 'auto', post: null },
    settings: {
      threshold: DEFAULT_THRESHOLD,
      dailyCap: 100,
      blockedLabels: ['complaint'],
      blockedKeywords: [],
      allowPartial: false,
      allowClarify: true,
      activeHours: null,
    },
    labels: ['price'],
    confidence: 0.9,
    decision: {
      action: 'answer',
      needsHuman: false,
      autoSendPolicy: 'standard',
      unansweredTopics: [],
    },
    draft: {
      reply: 'Dạ áo thun A giá 199.000đ ạ.',
      needsHuman: false,
      claims: [{ kind: 'fact' }],
      unansweredTopics: [],
    },
    grounding: { sourceTexts: ['Áo thun A: 199.000đ'] },
    flags: {
      customerAngry: false,
      promptInjection: false,
      repeatCount: 0,
      imageProductUnresolved: false,
      humanHolding: false,
      readinessPercent: 95,
    },
    usage: { autoSentToday: 3 },
    message: null,
    ...over,
  };
}

describe('FR-116 decideAutoSend — khóa gửi của Admin (cổng 1)', () => {
  it('lý do mới nằm trong GATE_REASONS', () => {
    expect(GATE_REASONS).toContain('admin_send_locked');
    expect(GATE_REASONS).toContain('send_lock_unknown');
  });

  it('không truyền sendLock → hành vi cũ (qua)', () => {
    expect(decideAutoSend(base()).outcome).toBe('auto_send');
  });

  it('sendLock.locked = false → qua', () => {
    expect(decideAutoSend(base({ sendLock: { locked: false } })).outcome).toBe('auto_send');
  });

  it('bị khóa → hold gate:1 admin_send_locked', () => {
    expect(decideAutoSend(base({ sendLock: { locked: true } }))).toEqual({
      outcome: 'hold',
      failedGate: 'gate:1',
      reason: 'admin_send_locked',
      gatesPassed: 0,
    });
  });

  it('khóa không đọc được hoặc đọc lỗi (null) → send_lock_unknown', () => {
    for (const sendLock of [
      { locked: true, unreadable: true },
      { locked: false, unreadable: true },
      null,
    ]) {
      expect(decideAutoSend(base({ sendLock }))).toMatchObject({
        outcome: 'hold',
        failedGate: 'gate:1',
        reason: 'send_lock_unknown',
      });
    }
  });

  it('khóa chặn cả khi mức là Chạy thử (log "sẽ gửi" không được sai)', () => {
    const r = decideAutoSend(
      base({ levels: { channelLabel: 'shadow', post: null }, sendLock: { locked: true } }),
    );
    expect(r.outcome).toBe('hold');
  });

  it('thứ tự: Dừng khẩn cấp vẫn báo trước khóa gửi', () => {
    const r = decideAutoSend(
      base({
        workspace: {
          aiEnabled: true,
          emergencyStopped: true,
          aiCostCapUsd: null,
          aiCostMonthUsd: 0,
        },
        sendLock: { locked: true },
      }),
    );
    expect(r.reason).toBe('emergency_stopped');
  });

  it('sendLock sai kiểu → đầu vào hỏng, không ném', () => {
    const r = decideAutoSend({ ...base(), sendLock: 'locked' });
    expect(r).toMatchObject({ outcome: 'hold', failedGate: 'input' });
  });
});
