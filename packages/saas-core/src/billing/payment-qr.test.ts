import { buildVietQrPayload } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { renderPaymentQr } from './payment-qr';

const input = {
  receiver: { bankBin: '970415', accountNumber: '113366668888', accountName: 'CONG TY FIXTURE' },
  amountVnd: 299_000,
  transferCode: 'CFABCD2345',
};

describe('FR-091 vẽ QR thanh toán (fixture, không mạng)', () => {
  it('trả đúng payload VietQR của hóa đơn kèm ảnh PNG dạng data URL', async () => {
    const qr = await renderPaymentQr(input);
    expect(qr.payload).toBe(buildVietQrPayload(input));
    expect(qr.dataUrl).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
  });

  it('cùng đầu vào → cùng ảnh; đổi số tiền → ảnh khác', async () => {
    const a = await renderPaymentQr(input);
    const b = await renderPaymentQr(input);
    const c = await renderPaymentQr({ ...input, amountVnd: 299_001 });
    expect(b.dataUrl).toBe(a.dataUrl);
    expect(c.dataUrl).not.toBe(a.dataUrl);
  });

  it('đầu vào sai (số tiền, mã, tài khoản) → từ chối, không trả QR', async () => {
    await expect(renderPaymentQr({ ...input, amountVnd: 0 })).rejects.toThrow();
    await expect(renderPaymentQr({ ...input, transferCode: 'x' })).rejects.toThrow();
    await expect(
      renderPaymentQr({ ...input, receiver: { ...input.receiver, bankBin: '1' } }),
    ).rejects.toThrow();
  });
});
