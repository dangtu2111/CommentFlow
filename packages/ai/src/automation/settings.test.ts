import { describe, expect, it } from 'vitest';
import { readAutoSendInput } from '../gate/auto-send-gate';
import {
  DEFAULT_AUTOMATION_CONFIG,
  modeFor,
  parseAutomationConfig,
  toGateSettings,
} from './settings';

const CH = '3f2b8c1e-5d4a-4b7e-9a10-1c2d3e4f5a6b';
const base = () => structuredClone(DEFAULT_AUTOMATION_CONFIG);
const ok = (patch: Record<string, unknown>) => parseAutomationConfig({ ...base(), ...patch });
const good = (patch: Record<string, unknown>) => {
  const r = ok(patch);
  if (!r.success) throw new Error('phải hợp lệ');
  return r.data;
};

describe('FR-070 mặc định và mức theo kênh × nhãn', () => {
  it('FR-070 mặc định: không ô nào được khai báo, mọi ô là Tắt, ngưỡng 0,85', () => {
    expect(parseAutomationConfig(base()).success).toBe(true);
    expect(DEFAULT_AUTOMATION_CONFIG.rules).toEqual([]);
    expect(DEFAULT_AUTOMATION_CONFIG.threshold).toBe(0.85);
    expect(
      modeFor(DEFAULT_AUTOMATION_CONFIG, { channelId: CH, target: 'comment', label: 'price' }),
    ).toBe('off');
  });

  it('FR-070 tách Bình luận / Tin nhắn: cùng kênh, cùng nhãn, hai mức khác nhau', () => {
    const data = good({
      rules: [
        { channelId: CH, target: 'comment', label: 'price', mode: 'auto' },
        { channelId: CH, target: 'message', label: 'price', mode: 'shadow' },
      ],
    });
    expect(modeFor(data, { channelId: CH, target: 'comment', label: 'price' })).toBe('auto');
    expect(modeFor(data, { channelId: CH, target: 'message', label: 'price' })).toBe('shadow');
    expect(modeFor(data, { channelId: CH, target: 'comment', label: 'advice' })).toBe('off');
  });

  it.each([
    [
      'nhãn Khiếu nại (luôn chặn, FR-145)',
      { channelId: CH, target: 'comment', label: 'complaint', mode: 'auto' },
    ],
    ['nhãn Spam', { channelId: CH, target: 'comment', label: 'spam', mode: 'auto' }],
    ['mức lạ', { channelId: CH, target: 'comment', label: 'price', mode: 'always' }],
    ['kênh không phải uuid', { channelId: 'x', target: 'comment', label: 'price', mode: 'auto' }],
    ['đối tượng lạ', { channelId: CH, target: 'post', label: 'price', mode: 'auto' }],
  ])('FR-070 từ chối ô: %s', (_name, rule) => {
    expect(ok({ rules: [rule] }).success).toBe(false);
  });

  it('FR-070 từ chối ô trùng khóa (kênh, đối tượng, nhãn)', () => {
    const rule = { channelId: CH, target: 'comment', label: 'price', mode: 'auto' };
    expect(ok({ rules: [rule, { ...rule, mode: 'off' }] }).success).toBe(false);
  });
});

describe('FR-071 cài đặt chung', () => {
  it.each([0.8, 0.85, 0.99, 1])('FR-071 nhận ngưỡng %s', (threshold) => {
    expect(ok({ threshold }).success).toBe(true);
  });
  it.each([0.79, 0.5, 0, 1.01, -1, Number.NaN, '0.9'])(
    'FR-071 từ chối ngưỡng %s (sàn 0,80)',
    (threshold) => {
      expect(ok({ threshold }).success).toBe(false);
    },
  );

  it.each([0, 60, 120, 300])('FR-071 nhận khoảng trễ %ss', (delaySeconds) => {
    expect(ok({ delaySeconds }).success).toBe(true);
  });
  it.each([30, 61, 600, -60, 1.5])(
    'FR-071 từ chối khoảng trễ %s (chỉ 0/1/2/5 phút)',
    (delaySeconds) => {
      expect(ok({ delaySeconds }).success).toBe(false);
    },
  );

  it.each([1, 50, 1000])('FR-071 nhận giới hạn/ngày %s', (dailyCap) => {
    expect(ok({ dailyCap }).success).toBe(true);
  });
  it.each([0, -1, 1001, 2.5, null])(
    'FR-071 từ chối giới hạn/ngày %s (không có chế độ không giới hạn)',
    (dailyCap) => {
      expect(ok({ dailyCap }).success).toBe(false);
    },
  );

  it('FR-071 giờ hoạt động: null (cả ngày) hoặc một khung hợp lệ', () => {
    expect(ok({ activeHours: null }).success).toBe(true);
    expect(ok({ activeHours: { days: [1, 2, 3], from: '08:00', to: '21:30' } }).success).toBe(true);
  });
  it.each([
    { days: [], from: '08:00', to: '21:00' },
    { days: [7], from: '08:00', to: '21:00' },
    { days: [1, 1], from: '08:00', to: '21:00' },
    { days: [1], from: '8:00', to: '21:00' },
    { days: [1], from: '08:00', to: '25:00' },
    { days: [1], from: '09:00', to: '09:00' },
  ])('FR-071 từ chối khung giờ %j', (activeHours) => {
    expect(ok({ activeHours }).success).toBe(false);
  });

  it('FR-071 từ khóa chặn: cắt khoảng trắng, bỏ rỗng, bỏ trùng không phân biệt hoa/thường/dấu', () => {
    const data = good({ blockedKeywords: ['  Giảm giá ', 'giam gia', '', 'GIẢM GIÁ', 'ship'] });
    expect(data.blockedKeywords).toEqual(['Giảm giá', 'ship']);
  });
  it('FR-071 từ chối quá 50 từ khóa hoặc từ khóa > 60 ký tự', () => {
    const many = Array.from({ length: 51 }, (_, i) => `k${i}`);
    expect(ok({ blockedKeywords: many }).success).toBe(false);
    expect(ok({ blockedKeywords: ['a'.repeat(61)] }).success).toBe(false);
    expect(ok({ blockedKeywords: ['a'.repeat(60)] }).success).toBe(true);
  });

  it('FR-071 chữ ký công bố: cắt khoảng trắng, rỗng → null, ≤ 120 ký tự, không xuống dòng', () => {
    expect(good({ signature: '  — Trợ lý AI của shop  ' }).signature).toBe('— Trợ lý AI của shop');
    expect(good({ signature: '   ' }).signature).toBeNull();
    expect(ok({ signature: 'a'.repeat(121) }).success).toBe(false);
    expect(ok({ signature: 'a\nb' }).success).toBe(false);
  });

  it('FR-071 trường lạ bị từ chối (không lặng lẽ nhận cờ mở cổng)', () => {
    expect(ok({ allowEverything: true }).success).toBe(false);
  });
});

describe('FR-071 cầu nối sang cổng tự gửi', () => {
  it('FR-071 toGateSettings cho ra khối settings mà decideAutoSend đọc được', () => {
    const data = good({
      threshold: 0.9,
      dailyCap: 20,
      blockedKeywords: ['ship'],
      activeHours: { days: [1, 2], from: '08:00', to: '21:00' },
    });
    const settings = toGateSettings(data, { timezone: 'Asia/Ho_Chi_Minh' });
    expect(settings).toMatchObject({ threshold: 0.9, dailyCap: 20, blockedKeywords: ['ship'] });
    expect(settings.activeHours).toEqual({
      timezone: 'Asia/Ho_Chi_Minh',
      windows: [{ days: [1, 2], from: '08:00', to: '21:00' }],
    });
    expect(settings.blockedLabels).toContain('complaint');
  });

  it('FR-071 giờ hoạt động null → activeHours null; settings qua được readAutoSendInput', () => {
    const settings = toGateSettings(DEFAULT_AUTOMATION_CONFIG, { timezone: 'Asia/Ho_Chi_Minh' });
    expect(settings.activeHours).toBeNull();
    const input = {
      target: 'comment',
      now: new Date('2026-11-06T03:00:00Z'),
      workspace: {
        aiEnabled: true,
        emergencyStopped: false,
        aiCostCapUsd: null,
        aiCostMonthUsd: 0,
      },
      levels: { channelLabel: 'auto', post: null },
      settings: { ...settings, allowPartial: false, allowClarify: true },
      labels: ['price'],
      confidence: 0.95,
      decision: {
        action: 'answer',
        needsHuman: false,
        autoSendPolicy: 'standard',
        unansweredTopics: [],
      },
      draft: { reply: 'ok', needsHuman: false, claims: [], unansweredTopics: [] },
      grounding: { sourceTexts: [] },
      flags: {
        customerAngry: false,
        promptInjection: false,
        repeatCount: 0,
        imageProductUnresolved: false,
        humanHolding: false,
        readinessPercent: 100,
      },
      usage: { autoSentToday: 0 },
      message: null,
    };
    expect(readAutoSendInput(input)).not.toBeNull();
  });
});
