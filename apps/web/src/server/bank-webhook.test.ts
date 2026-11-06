import type { BankTransactionInput, ReconcileOutcome } from '@flow/saas-core';
import { describe, expect, it, vi } from 'vitest';
import { type BankWebhookDeps, createBankWebhookHandler } from './bank-webhook';

const KEY = ['k', 'test'].join('-');

function make(provider: 'sepay' | 'casso', over: Partial<BankWebhookDeps> = {}) {
  const reconcile = vi.fn(async (_tx: BankTransactionInput) => 'confirmed' as ReconcileOutcome);
  const warn = vi.fn();
  const handler = createBankWebhookHandler({
    provider,
    enabled: () => true,
    secret: () => KEY,
    reconcile,
    warn,
    ...over,
  });
  return { handler, reconcile, warn };
}

const sepayBody = {
  id: 5,
  transferType: 'in',
  transferAmount: 1000,
  content: 'CFABCDEFGH',
  accountNumber: '000111',
};
const cassoBody = {
  error: 0,
  data: [{ id: 6, amount: 1000, description: 'CFABCDEFGH', bank_sub_acc_id: '000111' }],
};

const post = (body: unknown, headers: Record<string, string>, raw?: string) =>
  new Request('http://x/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw ?? JSON.stringify(body),
  });

describe('FR-124 webhook SePay', () => {
  const ok = { authorization: `Apikey ${KEY}` };

  it('cờ tắt → 503, không đối soát', async () => {
    const { handler, reconcile } = make('sepay', { enabled: () => false });
    expect((await handler(post(sepayBody, ok))).status).toBe(503);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('thiếu khóa cấu hình → 503 (đóng)', async () => {
    const { handler } = make('sepay', { secret: () => undefined });
    expect((await handler(post(sepayBody, ok))).status).toBe(503);
  });

  it('chữ ký/khóa sai hoặc thiếu → 401, không đối soát', async () => {
    const { handler, reconcile } = make('sepay');
    expect((await handler(post(sepayBody, { authorization: 'Apikey nope' }))).status).toBe(401);
    expect((await handler(post(sepayBody, {}))).status).toBe(401);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('thân quá lớn → 413; JSON hỏng → 400', async () => {
    const { handler } = make('sepay');
    expect((await handler(post(null, ok, 'x'.repeat(300 * 1024)))).status).toBe(413);
    expect((await handler(post(null, ok, '{oops'))).status).toBe(400);
  });

  it('đúng khóa → đối soát đúng dữ liệu, trả {"success":true}', async () => {
    const { handler, reconcile } = make('sepay');
    const res = await handler(post(sepayBody, ok));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(reconcile).toHaveBeenCalledWith({
      bankRef: 'SEPAY:5',
      amountVnd: 1000,
      content: 'CFABCDEFGH',
      accountNumber: '000111',
    });
  });

  it('tiền ra → 200 nhưng không đối soát (nhà cung cấp không gửi lại)', async () => {
    const { handler, reconcile, warn } = make('sepay');
    const res = await handler(post({ ...sepayBody, transferType: 'out' }, ok));
    expect(res.status).toBe(200);
    expect(reconcile).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith({
      event: 'bank_webhook_ignored',
      reason: 'not_incoming_or_schema',
    });
  });

  it('kết quả nghiệp vụ không đối soát được (lệch tiền…) → vẫn 200, log chỉ tên kết quả', async () => {
    const { handler, warn } = make('sepay', { reconcile: async () => 'amount_mismatch' });
    expect((await handler(post(sepayBody, ok))).status).toBe(200);
    expect(warn).toHaveBeenCalledWith({
      event: 'bank_webhook_unsettled',
      reason: 'amount_mismatch',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('CFABCDEFGH');
  });

  it('lỗi hạ tầng khi đối soát → 500 (nhà cung cấp gửi lại), log không chứa nội dung lỗi', async () => {
    const { handler, warn } = make('sepay', {
      reconcile: async () => {
        throw new Error('secret detail CFABCDEFGH');
      },
    });
    expect((await handler(post(sepayBody, ok))).status).toBe(500);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('CFABCDEFGH');
  });
});

describe('FR-124 webhook Casso', () => {
  const ok = { 'secure-token': KEY };

  it('sai token → 401; đúng → 200 {"error":0} và đối soát từng dòng', async () => {
    const { handler, reconcile } = make('casso');
    expect((await handler(post(cassoBody, { 'secure-token': 'nope' }))).status).toBe(401);
    expect(reconcile).not.toHaveBeenCalled();
    const res = await handler(post(cassoBody, ok));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ error: 0 });
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('gửi lại cùng lô: mỗi lần gọi đối soát (idempotent do tầng dưới), cùng mã giao dịch', async () => {
    const { handler, reconcile } = make('casso');
    await handler(post(cassoBody, ok));
    await handler(post(cassoBody, ok));
    const refs = reconcile.mock.calls.map((c) => c[0].bankRef);
    expect(refs).toEqual(['CASSO:6', 'CASSO:6']);
  });
});
