import { DEFAULT_AUTOMATION_CONFIG } from '@flow/ai';
import { describe, expect, it } from 'vitest';
import { automationFormDefaults, parseAutomationForm } from './automation-form';

const CH1 = '3f2b8c1e-5d4a-4b7e-9a10-1c2d3e4f5a6b';
const CH2 = '9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
const OTHER = '11111111-2222-4333-8444-555555555555';

function form(entries: Record<string, string | string[]>) {
  const map = new Map<string, string[]>(
    Object.entries(entries).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]),
  );
  return { get: (k: string) => map.get(k)?.[0] ?? null, getAll: (k: string) => map.get(k) ?? [] };
}
const general = {
  threshold: '85',
  delaySeconds: '60',
  dailyCap: '50',
  blockedKeywords: '',
  signature: '',
};

describe('FR-070 FR-071 đọc form cài đặt tự gửi', () => {
  it('FR-070 chỉ giữ ô khác Tắt; ô vắng mặt = Tắt', () => {
    const r = parseAutomationForm(
      form({
        ...general,
        [`mode:${CH1}:comment:price`]: 'auto',
        [`mode:${CH1}:message:price`]: 'shadow',
        [`mode:${CH1}:comment:advice`]: 'off',
      }),
      [CH1, CH2],
    );
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.config.rules).toEqual([
      { channelId: CH1, target: 'comment', label: 'price', mode: 'auto' },
      { channelId: CH1, target: 'message', label: 'price', mode: 'shadow' },
    ]);
  });

  it('FR-070 bỏ qua ô của kênh không thuộc workspace (không thể ghi chéo workspace)', () => {
    const r = parseAutomationForm(form({ ...general, [`mode:${OTHER}:comment:price`]: 'auto' }), [
      CH1,
    ]);
    expect(r.ok && r.config.rules).toEqual([]);
  });

  it('FR-070 mức lạ bị từ chối ở trường ma trận', () => {
    const r = parseAutomationForm(form({ ...general, [`mode:${CH1}:comment:price`]: 'always' }), [
      CH1,
    ]);
    expect(r).toEqual({ ok: false, field: 'rules' });
  });

  it('FR-071 ngưỡng nhập theo phần trăm: 85 → 0,85; 79 bị từ chối', () => {
    const a = parseAutomationForm(form({ ...general, threshold: '90' }), []);
    expect(a.ok && a.config.threshold).toBe(0.9);
    expect(parseAutomationForm(form({ ...general, threshold: '79' }), [])).toEqual({
      ok: false,
      field: 'threshold',
    });
  });

  it.each([
    ['threshold', 'abc'],
    ['threshold', ''],
    ['delaySeconds', '90'],
    ['dailyCap', '0'],
    ['dailyCap', '1.5'],
    ['dailyCap', ''],
  ])('FR-071 %s = %j → lỗi đúng trường', (field, value) => {
    expect(parseAutomationForm(form({ ...general, [field]: value }), [])).toEqual({
      ok: false,
      field,
    });
  });

  it('FR-071 giờ hoạt động: bật + ngày + giờ → một khung; tắt → null', () => {
    const on = parseAutomationForm(
      form({
        ...general,
        hoursEnabled: 'on',
        hoursDays: ['1', '2', '3'],
        hoursFrom: '08:00',
        hoursTo: '21:00',
      }),
      [],
    );
    expect(on.ok && on.config.activeHours).toEqual({ days: [1, 2, 3], from: '08:00', to: '21:00' });
    const off = parseAutomationForm(form({ ...general, hoursDays: ['1'] }), []);
    expect(off.ok && off.config.activeHours).toBeNull();
  });

  it('FR-071 giờ hoạt động bật mà thiếu ngày/giờ sai → lỗi trường activeHours', () => {
    expect(
      parseAutomationForm(
        form({ ...general, hoursEnabled: 'on', hoursFrom: '08:00', hoursTo: '21:00' }),
        [],
      ),
    ).toEqual({ ok: false, field: 'activeHours' });
    expect(
      parseAutomationForm(
        form({
          ...general,
          hoursEnabled: 'on',
          hoursDays: ['9'],
          hoursFrom: '08:00',
          hoursTo: '21:00',
        }),
        [],
      ),
    ).toEqual({ ok: false, field: 'activeHours' });
  });

  it('FR-071 từ khóa chặn tách theo dòng/dấu phẩy; chữ ký rỗng → null', () => {
    const r = parseAutomationForm(
      form({ ...general, blockedKeywords: 'giảm giá\r\nship, bảo hành ,', signature: ' ' }),
      [],
    );
    expect(r.ok && r.config.blockedKeywords).toEqual(['giảm giá', 'ship', 'bảo hành']);
    expect(r.ok && r.config.signature).toBeNull();
  });

  it('FR-071 quá nhiều từ khóa → lỗi trường blockedKeywords', () => {
    const many = Array.from({ length: 51 }, (_, i) => `k${i}`).join('\n');
    expect(parseAutomationForm(form({ ...general, blockedKeywords: many }), [])).toEqual({
      ok: false,
      field: 'blockedKeywords',
    });
  });

  it('FR-071 chữ ký quá dài → lỗi trường signature', () => {
    expect(parseAutomationForm(form({ ...general, signature: 'a'.repeat(121) }), [])).toEqual({
      ok: false,
      field: 'signature',
    });
  });

  it('FR-071 automationFormDefaults: mặc định hiển thị ngưỡng theo phần trăm và từ khóa theo dòng', () => {
    expect(automationFormDefaults(DEFAULT_AUTOMATION_CONFIG)).toMatchObject({
      thresholdPercent: '85',
      keywordsText: '',
      hoursEnabled: false,
    });
    expect(
      automationFormDefaults({
        ...DEFAULT_AUTOMATION_CONFIG,
        blockedKeywords: ['a', 'b'],
        threshold: 0.9,
      }),
    ).toMatchObject({ thresholdPercent: '90', keywordsText: 'a\nb' });
  });
});
