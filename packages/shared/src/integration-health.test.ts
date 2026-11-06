import { describe, expect, it } from 'vitest';
import {
  canViewIntegrationHealth,
  evaluateProviderHealth,
  evaluateQueueHealth,
  INTEGRATION_PROVIDERS,
  sanitizeIncidentMessage,
  summarizeIntegrationHealth,
} from './integration-health';

describe('canViewIntegrationHealth (docs/13 §3.2: chỉ Super Admin)', () => {
  it('chỉ cho Admin vai trò super', () => {
    expect(canViewIntegrationHealth({ isAdmin: true, adminRole: 'super' })).toBe(true);
  });
  it.each(['support', 'finance', null, 'root'])('từ chối vai trò %s', (adminRole) => {
    expect(canViewIntegrationHealth({ isAdmin: true, adminRole })).toBe(false);
  });
  it('từ chối người không phải Admin dù vai trò là super', () => {
    expect(canViewIntegrationHealth({ isAdmin: false, adminRole: 'super' })).toBe(false);
  });
});

describe('evaluateProviderHealth', () => {
  it('không lỗi → ok', () => {
    expect(evaluateProviderHealth({ errorCount: 0 })).toBe('ok');
  });
  it('có lỗi ít → degraded', () => {
    expect(evaluateProviderHealth({ errorCount: 3 })).toBe('degraded');
  });
  it('nhiều lỗi → down', () => {
    expect(evaluateProviderHealth({ errorCount: 20 })).toBe('down');
  });
  it('số lỗi âm/NaN → coi là nặng (thiên về cảnh báo)', () => {
    expect(evaluateProviderHealth({ errorCount: Number.NaN })).toBe('down');
    expect(evaluateProviderHealth({ errorCount: -1 })).toBe('down');
  });
});

describe('evaluateQueueHealth (docs/15: ingest tồn > 5 phút → cảnh báo)', () => {
  it('ingest chờ > 300 giây → down', () => {
    expect(evaluateQueueHealth({ name: 'ingest', oldestWaitingSeconds: 301, deadCount: 0 })).toBe(
      'down',
    );
  });
  it('ingest chờ đúng 300 giây → ok', () => {
    expect(evaluateQueueHealth({ name: 'ingest', oldestWaitingSeconds: 300, deadCount: 0 })).toBe(
      'ok',
    );
  });
  it('hàng đợi khác có ngưỡng rộng hơn', () => {
    expect(evaluateQueueHealth({ name: 'send', oldestWaitingSeconds: 600, deadCount: 0 })).toBe(
      'ok',
    );
    expect(evaluateQueueHealth({ name: 'send', oldestWaitingSeconds: 1801, deadCount: 0 })).toBe(
      'down',
    );
  });
  it('có dead letter → ít nhất degraded', () => {
    expect(evaluateQueueHealth({ name: 'send', oldestWaitingSeconds: 0, deadCount: 2 })).toBe(
      'degraded',
    );
  });
  it('số liệu hỏng → down', () => {
    expect(
      evaluateQueueHealth({ name: 'send', oldestWaitingSeconds: Number.NaN, deadCount: 0 }),
    ).toBe('down');
  });
});

describe('summarizeIntegrationHealth', () => {
  it('liệt kê đủ nhà cung cấp, trạng thái xấu nhất là tổng', () => {
    const summary = summarizeIntegrationHealth({
      providerErrors: [{ provider: 'shopify', errorCount: 4 }],
      queues: [{ name: 'ingest', oldestWaitingSeconds: 10, deadCount: 0 }],
    });
    expect(summary.providers).toHaveLength(INTEGRATION_PROVIDERS.length);
    expect(summary.providers.find((p) => p.provider === 'shopify')?.status).toBe('degraded');
    expect(summary.providers.find((p) => p.provider === 'facebook')?.status).toBe('ok');
    expect(summary.overall).toBe('degraded');
  });
  it('cộng dồn nhiều dòng cùng nhà cung cấp', () => {
    const summary = summarizeIntegrationHealth({
      providerErrors: [
        { provider: 'facebook', errorCount: 10 },
        { provider: 'facebook', errorCount: 10 },
      ],
      queues: [],
    });
    expect(summary.providers.find((p) => p.provider === 'facebook')?.status).toBe('down');
    expect(summary.overall).toBe('down');
  });
  it('hàng đợi hỏng kéo tổng xuống down', () => {
    const summary = summarizeIntegrationHealth({
      providerErrors: [],
      queues: [{ name: 'ingest', oldestWaitingSeconds: 999, deadCount: 0 }],
    });
    expect(summary.overall).toBe('down');
    expect(summary.queues[0]?.status).toBe('down');
  });
  it('nhà cung cấp lạ bị bỏ qua', () => {
    const summary = summarizeIntegrationHealth({
      providerErrors: [{ provider: 'zzz', errorCount: 99 }],
      queues: [],
    });
    expect(summary.providers).toHaveLength(INTEGRATION_PROVIDERS.length);
    expect(summary.overall).toBe('ok');
  });
  it('mọi thứ tốt → ok', () => {
    expect(summarizeIntegrationHealth({ providerErrors: [], queues: [] }).overall).toBe('ok');
  });
});

describe('sanitizeIncidentMessage (bất biến #6: không log PII/token)', () => {
  it('che email và số điện thoại', () => {
    const out = sanitizeIncidentMessage('lỗi gửi cho a@b.vn gọi 0912345678');
    expect(out).not.toContain('a@b.vn');
    expect(out).not.toContain('0912345678');
  });
  it('che chuỗi giống token dài', () => {
    const blob = 'x'.repeat(40);
    expect(sanitizeIncidentMessage(`Bearer ${blob} hết hạn`)).not.toContain(blob);
  });
  it('cắt tối đa 300 ký tự', () => {
    expect(sanitizeIncidentMessage('ab '.repeat(500)).length).toBeLessThanOrEqual(300);
  });
});
