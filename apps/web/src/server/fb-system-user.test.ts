import { describe, expect, it, vi } from 'vitest';
import { createFbSystemUserService, type FbSystemUserDeps } from './fb-system-user';

const SESSION = { workspaceId: 'ws-1', userId: 'u-1' };
const TOKEN = `EAAB${'x'.repeat(60)}`;
const CIPHER = { ciphertext: Buffer.alloc(40, 7), keyVersion: 2 };

function build(over: Partial<FbSystemUserDeps> = {}) {
  const deps: FbSystemUserDeps = {
    encrypt: vi.fn(() => CIPHER),
    decrypt: vi.fn(() => TOKEN),
    verify: vi.fn(async () => ({ status: 'ok' as const })),
    save: vi.fn(async () => undefined),
    readCipher: vi.fn(async () => CIPHER),
    markInvalid: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    warn: vi.fn(),
    ...over,
  };
  return { deps, service: createFbSystemUserService(deps) };
}

describe('save', () => {
  it('token hợp lệ → xác minh với Meta, mã hóa rồi lưu; trả ok', async () => {
    const { deps, service } = build();
    expect(await service.save(SESSION, TOKEN)).toBe('ok');
    expect(deps.verify).toHaveBeenCalledWith(TOKEN);
    expect(deps.encrypt).toHaveBeenCalledWith(TOKEN, { workspaceId: 'ws-1' });
    expect(deps.save).toHaveBeenCalledWith(SESSION, CIPHER);
  });

  it('sai dạng → invalid, không gọi Meta, không lưu', async () => {
    const { deps, service } = build();
    expect(await service.save(SESSION, 'ngan')).toBe('invalid');
    expect(deps.verify).not.toHaveBeenCalled();
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('thiếu khóa mã hóa → not_configured, không lưu', async () => {
    const { deps, service } = build({ encrypt: undefined });
    expect(await service.save(SESSION, TOKEN)).toBe('not_configured');
    expect(deps.save).not.toHaveBeenCalled();
  });

  it('Meta từ chối / thiếu quyền / không liên lạc được → trả đúng mã và KHÔNG lưu', async () => {
    for (const status of ['invalid_credentials', 'missing_scopes', 'unreachable'] as const) {
      const { deps, service } = build({ verify: vi.fn(async () => ({ status })) });
      expect(await service.save(SESSION, TOKEN)).toBe(status);
      expect(deps.save).not.toHaveBeenCalled();
    }
  });

  it('DB từ chối (không phải Owner, 42501) → forbidden; lỗi khác → unavailable, nhật ký không chứa token', async () => {
    const forbidden = build({
      save: vi.fn(async () => {
        throw Object.assign(new Error('x'), { code: '42501' });
      }),
    });
    expect(await forbidden.service.save(SESSION, TOKEN)).toBe('forbidden');
    const broken = build({
      save: vi.fn(async () => {
        throw Object.assign(new Error(`lỗi ${TOKEN}`), { code: '08006' });
      }),
    });
    expect(await broken.service.save(SESSION, TOKEN)).toBe('unavailable');
    expect(JSON.stringify(vi.mocked(broken.deps.warn).mock.calls)).not.toContain(TOKEN);
  });
});

describe('load', () => {
  it('có token lưu → giải mã trả về', async () => {
    const { deps, service } = build();
    expect(await service.load(SESSION)).toEqual({ status: 'ok', token: TOKEN });
    expect(deps.decrypt).toHaveBeenCalledWith(CIPHER, { workspaceId: 'ws-1' });
  });

  it('chưa lưu/đã ngắt → none', async () => {
    const { service } = build({ readCipher: vi.fn(async () => null) });
    expect(await service.load(SESSION)).toEqual({ status: 'none' });
  });

  it('giải mã hỏng (sai khóa/AAD) → unusable, đánh dấu invalid để giao diện báo dán lại', async () => {
    const { deps, service } = build({
      decrypt: vi.fn(() => {
        throw new Error('decrypt');
      }),
    });
    expect(await service.load(SESSION)).toEqual({ status: 'unusable' });
    expect(deps.markInvalid).toHaveBeenCalledWith(SESSION);
  });
});

describe('khi Meta từ chối token đã lưu', () => {
  it('markRejected đánh dấu invalid', async () => {
    const { deps, service } = build();
    await service.markRejected(SESSION);
    expect(deps.markInvalid).toHaveBeenCalledWith(SESSION);
  });
});

describe('disconnect', () => {
  it('ok / not_found (P0002) / forbidden (42501) / unavailable', async () => {
    expect(await build().service.disconnect(SESSION)).toBe('ok');
    const code = (c: string) =>
      build({
        disconnect: vi.fn(async () => {
          throw Object.assign(new Error('x'), { code: c });
        }),
      }).service.disconnect(SESSION);
    expect(await code('P0002')).toBe('not_found');
    expect(await code('42501')).toBe('forbidden');
    expect(await code('08006')).toBe('unavailable');
  });
});
