import { describe, expect, it } from 'vitest';
import {
  canReconnect,
  connectSummaryQuery,
  countParam,
  fbNoticeOf,
  summarizeConnect,
} from './fb-connect-view';

describe('fbNoticeOf / countParam', () => {
  it('chỉ nhận khóa đã biết', () => {
    expect(fbNoticeOf('done')).toBe('done');
    expect(fbNoticeOf(['limit', 'x'])).toBe('limit');
    expect(fbNoticeOf('select')).toBeNull();
    expect(fbNoticeOf('<script>')).toBeNull();
    expect(fbNoticeOf(undefined)).toBeNull();
  });
  it('số chỉ chữ số ≤ 3', () => {
    expect(countParam('2')).toBe(2);
    expect(countParam('1000')).toBe(0);
    expect(countParam('-1')).toBe(0);
    expect(countParam('1e3')).toBe(0);
    expect(countParam(undefined)).toBe(0);
  });
});

describe('summarizeConnect', () => {
  it('tất cả ổn → done; lẫn lộn → partial; không Page nào xong → error', () => {
    expect(summarizeConnect([{ outcome: 'connected' }]).notice).toBe('done');
    expect(summarizeConnect([{ outcome: 'connected' }, { outcome: 'identity_mismatch' }])).toEqual({
      notice: 'partial',
      connected: 1,
      problems: 1,
    });
    expect(summarizeConnect([{ outcome: 'connected_without_webhook' }]).notice).toBe('error');
    expect(connectSummaryQuery([{ outcome: 'connected' }, { outcome: 'failed' }])).toBe(
      'fb=partial&ok=1&bad=1',
    );
  });
});

describe('canReconnect (CH-RECONNECT-ACTION)', () => {
  const base = {
    role: 'owner',
    enabled: true,
    status: 'expired',
    webhookSubscribed: true,
  } as const;
  it('Owner + bật + kênh hỏng → có', () => {
    for (const status of ['expired', 'revoked', 'error'] as const)
      expect(canReconnect({ ...base, status })).toBe(true);
  });
  it('kênh ổn nhưng chưa nhận webhook → có; ổn hoàn toàn → không', () => {
    expect(canReconnect({ ...base, status: 'connected', webhookSubscribed: false })).toBe(true);
    expect(canReconnect({ ...base, status: 'connected', webhookSubscribed: true })).toBe(false);
  });
  it('Staff hoặc tính năng tắt → không bao giờ', () => {
    expect(canReconnect({ ...base, role: 'staff' })).toBe(false);
    expect(canReconnect({ ...base, enabled: false })).toBe(false);
  });
});
