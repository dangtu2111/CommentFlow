import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { policyFormDefaults } from '../../lib/kb-policy-form';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

import { PolicyValueForm } from './policy-value-form';

const action = async () => {};
const html = async (over: Partial<Parameters<typeof PolicyValueForm>[0]>) =>
  renderToStaticMarkup(
    await PolicyValueForm({
      kind: 'returns',
      defaults: policyFormDefaults('returns', null),
      action,
      cancelHref: '/app/kb/policies',
      draft: null,
      labelEditable: false,
      heading: 'add',
      ...over,
    }),
  );

describe('PolicyValueForm', () => {
  it('đổi trả: các ô số ngày/điều kiện/hoàn tiền/phí ship/khả năng; có nút lưu nháp và quay lại', async () => {
    const out = await html({
      defaults: policyFormDefaults('returns', {
        days: 7,
        conditions: ['Còn tem mác'],
        refundTo: 'original_payment',
      }),
    });
    for (const name of [
      'kind',
      'days',
      'none',
      'conditions',
      'refundTo',
      'returnShippingPaidBy',
      'eligibility',
    ]) {
      expect(out, name).toContain(`name="${name}"`);
    }
    expect(out).toContain('value="7"');
    expect(out).toContain('Còn tem mác');
    expect(out).toContain('form.save');
    expect(out).toContain('href="/app/kb/policies"');
    expect(out).toContain('form.pageTitle.add');
  });

  it('nháp đang sửa: kèm draftId + rev ẩn và ghi chú; không có nháp thì không có', async () => {
    const withDraft = await html({ draft: { id: 'd-1', rev: 4 }, heading: 'edit' });
    expect(withDraft).toContain('name="draftId" value="d-1"');
    expect(withDraft).toContain('name="rev" value="4"');
    expect(withDraft).toContain('form.draftNote');
    expect(await html({})).not.toContain('name="draftId"');
  });

  it('ship: dòng mới cho nhập nhãn; dòng đã có khóa nhãn (ẩn) và hiện tên; đủ ô phí/ngày/COD/giao tới', async () => {
    const defaults = policyFormDefaults('ship_region', {
      kind: 'nationwide',
      label: 'Toàn quốc',
      currency: 'VND',
      feeMinor: 30000,
      daysMin: 2,
      daysMax: 4,
      cod: true,
    });
    const created = await html({ kind: 'ship_region', defaults, labelEditable: true });
    expect(created).toContain('type="text" id=');
    expect(created).toContain('name="label"');
    expect(created).toContain('form.labelHint');
    const locked = await html({ kind: 'ship_region', defaults, labelEditable: false });
    expect(locked).toContain('type="hidden" name="label" value="Toàn quốc"');
    for (const name of [
      'regionKind',
      'city',
      'places',
      'feeMode',
      'feeAmount',
      'freeOverAmount',
      'daysMode',
      'daysMin',
      'daysMax',
      'cod',
      'destinations',
      'currency',
    ]) {
      expect(locked, name).toContain(`name="${name}"`);
    }
  });

  it('bảo hành: tháng + không bảo hành + phạm vi; thanh toán: mỗi phương thức một ô, tick theo mặc định', async () => {
    const w = await html({
      kind: 'warranty',
      defaults: policyFormDefaults('warranty', { months: 3, scope: 'đường may' }),
    });
    for (const name of ['months', 'none', 'scope']) expect(w).toContain(`name="${name}"`);
    const p = await html({
      kind: 'payment',
      defaults: policyFormDefaults('payment', { methods: ['cod'] }),
    });
    expect(p.match(/name="methods"/g)).toHaveLength(5);
    expect(p).toMatch(/<input(?=[^>]*value="cod")(?=[^>]*checked)[^>]*>/);
    expect(p).not.toMatch(/<input(?=[^>]*value="card")(?=[^>]*checked)[^>]*>/);
  });
});
