import { describe, expect, it, vi } from 'vitest';
import { createShopifyConnectService, type ShopifyConnectDeps } from './shopify-connect';

const SESSION = { workspaceId: 'w1', userId: 'u1' };
const CLIENT_ID = 'abcdef0123456789abcdef0123456789';
const SECRET = 'shpss_0123456789abcdef';

function setup(over: Partial<ShopifyConnectDeps> = {}) {
  const save = vi.fn().mockResolvedValue(undefined);
  const disconnect = vi.fn().mockResolvedValue(undefined);
  const requestSync = vi.fn().mockResolvedValue(true);
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const warn = vi.fn();
  const encrypt = vi.fn().mockReturnValue({ ciphertext: Buffer.alloc(40, 1), keyVersion: 1 });
  const deps: ShopifyConnectDeps = {
    encrypt,
    save,
    disconnect,
    requestSync,
    enqueue,
    warn,
    ...over,
  };
  return {
    service: createShopifyConnectService(deps),
    save,
    disconnect,
    requestSync,
    enqueue,
    warn,
    encrypt,
  };
}

describe('connect', () => {
  it('hợp lệ → mã hóa với AAD đúng workspace rồi lưu; trả ok', async () => {
    const { service, save, encrypt } = setup();
    expect(
      await service.connect(SESSION, 'https://Demo-Shop.myshopify.com/admin', CLIENT_ID, SECRET),
    ).toBe('ok');
    expect(encrypt).toHaveBeenCalledWith(SECRET, { workspaceId: 'w1' });
    expect(save).toHaveBeenCalledWith(SESSION, {
      shopDomain: 'demo-shop.myshopify.com',
      clientId: CLIENT_ID,
      ciphertext: Buffer.alloc(40, 1),
      keyVersion: 1,
    });
  });

  it('tên miền, Client ID hoặc secret sai → invalid, KHÔNG mã hóa, KHÔNG lưu', async () => {
    const { service, save, encrypt } = setup();
    expect(await service.connect(SESSION, 'evil.com', CLIENT_ID, SECRET)).toBe('invalid');
    expect(await service.connect(SESSION, 'demo-shop', CLIENT_ID, 'ngắn')).toBe('invalid');
    expect(await service.connect(SESSION, 'demo-shop', 'sai id', SECRET)).toBe('invalid');
    expect(encrypt).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('thiếu khóa mã hóa (encrypt = undefined) → not_configured', async () => {
    const { service, save } = setup({ encrypt: undefined });
    expect(await service.connect(SESSION, 'demo-shop', CLIENT_ID, SECRET)).toBe('not_configured');
    expect(save).not.toHaveBeenCalled();
  });

  it('DB từ chối quyền (42501) → forbidden; lỗi khác → unavailable, log không chứa token', async () => {
    const forbidden = setup({
      save: () => Promise.reject(Object.assign(new Error('x'), { code: '42501' })),
    });
    expect(await forbidden.service.connect(SESSION, 'demo-shop', CLIENT_ID, SECRET)).toBe(
      'forbidden',
    );
    const broken = setup({ save: () => Promise.reject(new Error(`boom ${SECRET}`)) });
    expect(await broken.service.connect(SESSION, 'demo-shop', CLIENT_ID, SECRET)).toBe(
      'unavailable',
    );
    expect(JSON.stringify(broken.warn.mock.calls)).not.toContain(SECRET);
    expect(JSON.stringify(broken.warn.mock.calls)).not.toContain('boom');
  });
});

describe('sync', () => {
  it('được phép → đẩy đúng một job của workspace', async () => {
    const { service, enqueue } = setup();
    expect(await service.sync(SESSION)).toBe('queued');
    expect(enqueue).toHaveBeenCalledWith({ workspaceId: 'w1' });
  });

  it('trong thời gian chờ hoặc chưa kết nối → recent, KHÔNG đẩy job', async () => {
    const { service, enqueue } = setup({ requestSync: async () => false });
    expect(await service.sync(SESSION)).toBe('recent');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('không đẩy được hàng đợi → unavailable', async () => {
    const { service, warn } = setup({ enqueue: () => Promise.reject(new Error('queue down')) });
    expect(await service.sync(SESSION)).toBe('unavailable');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('queue down');
  });
});

describe('disconnect', () => {
  it('ok / không có kết nối (P0002) → not_found / quyền (42501) → forbidden', async () => {
    expect(await setup().service.disconnect(SESSION)).toBe('ok');
    const none = setup({
      disconnect: () => Promise.reject(Object.assign(new Error('x'), { code: 'P0002' })),
    });
    expect(await none.service.disconnect(SESSION)).toBe('not_found');
    const denied = setup({
      disconnect: () => Promise.reject(Object.assign(new Error('x'), { code: '42501' })),
    });
    expect(await denied.service.disconnect(SESSION)).toBe('forbidden');
  });
});
