import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createAccountTokenHooks,
  createOAuthTokenVault,
  type OAuthTokenCipher,
  OAuthTokenOpenError,
  type OAuthTokenScope,
  OAuthTokenScopeError,
} from './oauth-token-vault';

/** Bộ mã hóa thử cùng hình dạng với `createTokenCipher` của @flow/connectors (saas-core không được import nó). */
class MissingKey extends Error {
  constructor(readonly keyVersion: number) {
    super(`thieu khoa v${keyVersion}`);
    this.name = 'MissingKey';
  }
}
function fakeCipher(versions: number[]): OAuthTokenCipher {
  const keys = new Map(versions.map((v) => [v, Buffer.alloc(32, v)]));
  const currentVersion = Math.max(...versions);
  const aad = (c: { workspaceId: string; channelId: string }, v: number) =>
    Buffer.from(`${c.workspaceId}|${c.channelId}|${v}`);
  return {
    currentVersion,
    encrypt(plain, ctx) {
      const nonce = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', keys.get(currentVersion) as Buffer, nonce);
      c.setAAD(aad(ctx, currentVersion));
      const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
      return {
        ciphertext: Buffer.concat([nonce, body, c.getAuthTag()]),
        keyVersion: currentVersion,
      };
    },
    decrypt(ct, version, ctx) {
      const key = keys.get(version);
      if (!key) throw new MissingKey(version);
      const d = createDecipheriv('aes-256-gcm', key, ct.subarray(0, 12));
      d.setAAD(aad(ctx, version));
      d.setAuthTag(ct.subarray(ct.length - 16));
      return Buffer.concat([d.update(ct.subarray(12, ct.length - 16)), d.final()]).toString('utf8');
    },
  };
}

const scope: OAuthTokenScope = { userId: 'u-1', providerId: 'google', field: 'access_token' };
const v1 = createOAuthTokenVault(fakeCipher([1]));
const v12 = createOAuthTokenVault(fakeCipher([1, 2]));
const v2only = createOAuthTokenVault(fakeCipher([2]));

describe('seal/open', () => {
  it('khứ hồi đúng với mọi chuỗi (property)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 300 }), (plain) => {
        const sealed = v1.seal(plain, scope);
        expect(v1.isSealed(sealed)).toBe(true);
        expect(v1.open(sealed, scope)).toBe(plain);
      }),
    );
  });

  it('mỗi lần seal ra giá trị khác nhau và không chứa bản rõ', () => {
    const plain = 'tt-secret-value';
    const a = v1.seal(plain, scope);
    expect(a).not.toBe(v1.seal(plain, scope));
    expect(a).not.toContain(plain);
    expect(a.startsWith('enc:v1:')).toBe(true);
  });

  it('sai user/provider/trường → OAuthTokenOpenError không lộ dữ liệu', () => {
    const sealed = v1.seal('tt-secret-value', scope);
    for (const bad of [
      { ...scope, userId: 'u-2' },
      { ...scope, providerId: 'github' },
      { ...scope, field: 'refresh_token' as const },
    ]) {
      expect(() => v1.open(sealed, bad)).toThrow(OAuthTokenOpenError);
    }
    try {
      v1.open(sealed, { ...scope, userId: 'u-2' });
    } catch (e) {
      expect(String(e)).not.toContain('tt-secret-value');
      expect(String(e)).not.toContain(sealed);
    }
  });

  it('sửa một ký tự bất kỳ của bản niêm phong → lỗi (property)', () => {
    const sealed = v1.seal('tt-secret-value', scope);
    const head = 'enc:v1:'.length;
    fc.assert(
      // Bỏ ký tự cuối: nó chứa bit đệm base64 nên đổi đi có thể không đổi byte giải mã.
      fc.property(fc.integer({ min: head, max: sealed.length - 2 }), (i) => {
        const ch = sealed[i] === 'A' ? 'B' : 'A';
        const tampered = sealed.slice(0, i) + ch + sealed.slice(i + 1);
        expect(() => v1.open(tampered, scope)).toThrow();
      }),
    );
  });

  it('khai sai phiên bản trong tiền tố → không mở được', () => {
    const sealed = v12.seal('tt-secret-value', scope); // v2
    expect(() => v12.open(sealed.replace('enc:v2:', 'enc:v1:'), scope)).toThrow(
      OAuthTokenOpenError,
    );
  });

  it('tiền tố hỏng (v0, số lớn, rỗng) → lỗi chứ không coi là bản rõ', () => {
    for (const bad of ['enc:v0:AAAA', 'enc:v99999999999999999999:AAAA', 'enc:v1:']) {
      expect(() => v1.open(bad, scope)).toThrow(OAuthTokenOpenError);
    }
  });
});

describe('xoay khóa', () => {
  it('dữ liệu v1 vẫn mở được khi cấu hình v1+v2; rotate đưa về v2', () => {
    const old = v1.seal('tt-secret-value', scope);
    expect(v12.open(old, scope)).toBe('tt-secret-value');
    expect(v12.needsReseal(old)).toBe(true);
    const rotated = v12.rotate(old, scope);
    expect(rotated.startsWith('enc:v2:')).toBe(true);
    expect(v12.needsReseal(rotated)).toBe(false);
    expect(v12.open(rotated, scope)).toBe('tt-secret-value');
    expect(v2only.open(rotated, scope)).toBe('tt-secret-value');
  });

  it('thiếu khóa v1 → lỗi cấu hình gốc được ném nguyên (không đổi thành lỗi dữ liệu)', () => {
    const old = v1.seal('tt-secret-value', scope);
    expect(() => v2only.open(old, scope)).toThrow('thieu khoa v1');
    expect(() => v2only.rotate(old, scope)).toThrow('thieu khoa v1');
  });

  it('rotate giữ nguyên bản đã mới nhất và bản rõ chuyển tiếp thì được niêm phong', () => {
    const fresh = v12.seal('tt-secret-value', scope);
    expect(v12.rotate(fresh, scope)).toBe(fresh);
    const legacy = v12.rotate('tt-plain-legacy', scope);
    expect(v12.isSealed(legacy)).toBe(true);
    expect(v12.open(legacy, scope)).toBe('tt-plain-legacy');
  });
});

describe('giá trị đặc biệt', () => {
  it('bản rõ cũ (chưa mã hóa) vẫn đọc được và được đánh dấu cần niêm phong', () => {
    expect(v1.open('tt-plain-legacy', scope)).toBe('tt-plain-legacy');
    expect(v1.needsReseal('tt-plain-legacy')).toBe(true);
  });

  it('không niêm phong hai lần', () => {
    const once = v1.seal('tt-secret-value', scope);
    expect(v1.seal(once, scope)).toBe(once);
  });
});

describe('sealFields / openFields', () => {
  const user = { userId: 'u-1', providerId: 'google' };

  it('niêm phong ba token, bỏ qua null/undefined và trường khác', () => {
    const out = v1.sealFields(
      { ...user, accessToken: 'tt-a', refreshToken: null, scope: 'email', password: undefined },
      user,
    );
    expect(v1.isSealed(out.accessToken as string)).toBe(true);
    expect(out.refreshToken).toBeNull();
    expect('idToken' in out).toBe(false);
    expect(out.scope).toBe('email');
    expect(v1.openFields(out, user)).toMatchObject({ accessToken: 'tt-a', refreshToken: null });
  });

  it('mỗi trường có ngữ cảnh riêng: hoán đổi access↔refresh không mở được', () => {
    const out = v1.sealFields({ accessToken: 'tt-a', refreshToken: 'tt-r' }, user);
    const swapped = { accessToken: out.refreshToken, refreshToken: out.accessToken };
    expect(() => v1.openFields(swapped, user)).toThrow(OAuthTokenOpenError);
  });

  it('không có userId/providerId trong dữ liệu ghi thì dùng ngữ cảnh cho sẵn (update)', () => {
    const out = v1.sealFields({ refreshToken: 'tt-r' }, user);
    expect(v1.openFields(out, user).refreshToken).toBe('tt-r');
  });
});

describe('createAccountTokenHooks', () => {
  it('không có cipher → không có hook (TẮT mặc định)', () => {
    expect(createAccountTokenHooks(undefined)).toBeUndefined();
  });

  it('niêm phong token khi tạo; dữ liệu khác nguyên vẹn; đọc lại qua vault', async () => {
    const cipher = fakeCipher([1]);
    const hooks = createAccountTokenHooks(cipher);
    const out = await hooks?.create.before({
      userId: 'u-1',
      providerId: 'google',
      accountId: 'g-1',
      accessToken: 'tt-a',
      idToken: null,
    });
    const data = out?.data as Record<string, string | null>;
    expect(data.accountId).toBe('g-1');
    expect(data.idToken).toBeNull();
    expect(data.accessToken).toMatch(/^enc:v1:/);
    expect(createOAuthTokenVault(cipher).open(data.accessToken as string, scope)).toBe('tt-a');
  });

  it('ghi không đụng token → đi qua nguyên vẹn, kể cả thiếu userId', async () => {
    const hooks = createAccountTokenHooks(fakeCipher([1]));
    const out = await hooks?.update.before({ scope: 'email' });
    expect(out?.data).toEqual({ scope: 'email' });
  });

  it('ghi token mà thiếu userId/providerId → từ chối (không lưu bản rõ)', async () => {
    const hooks = createAccountTokenHooks(fakeCipher([1]));
    await expect(hooks?.update.before({ refreshToken: 'tt-r' })).rejects.toThrow(
      OAuthTokenScopeError,
    );
  });
});
