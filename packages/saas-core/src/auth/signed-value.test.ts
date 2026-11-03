import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSignedValueCodec, deriveKey } from './signed-value';

const secret = randomBytes(32).toString('hex');

describe('deriveKey', () => {
  it('cùng secret + nhãn cho cùng khóa; khác nhãn hoặc khác secret cho khóa khác', () => {
    expect(deriveKey(secret, 'a').equals(deriveKey(secret, 'a'))).toBe(true);
    expect(deriveKey(secret, 'a').equals(deriveKey(secret, 'b'))).toBe(false);
    expect(deriveKey(secret, 'a').equals(deriveKey(`${secret}x`, 'a'))).toBe(false);
  });

  it('khóa con không bằng secret gốc và dài 32 byte', () => {
    const key = deriveKey(secret, 'a');
    expect(key.length).toBe(32);
    expect(key.equals(Buffer.from(secret))).toBe(false);
  });

  it('từ chối secret hoặc nhãn rỗng', () => {
    expect(() => deriveKey('', 'a')).toThrow();
    expect(() => deriveKey(secret, '')).toThrow();
  });
});

describe('createSignedValueCodec', () => {
  let clock = 1_000_000;
  const codec = (label = 'workspace-cookie/v1', s = secret) =>
    createSignedValueCodec({ secret: s, label, ttlSeconds: 60, now: () => clock });

  it('ký rồi kiểm lại được giá trị gốc', () => {
    expect(codec().verify(codec().sign('ws-1'))).toBe('ws-1');
  });

  it('hết hạn thì bị loại', () => {
    const token = codec().sign('ws-1');
    clock += 61_000;
    expect(codec().verify(token)).toBeNull();
    clock -= 61_000;
  });

  it('sửa giá trị hoặc chữ ký thì bị loại', () => {
    const token = codec().sign('ws-1');
    const [payload, sig] = token.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ v: 'ws-2', x: 9_999_999_999 })).toString(
      'base64url',
    );
    expect(codec().verify(`${forged}.${sig}`)).toBeNull();
    expect(codec().verify(`${payload}.${sig.slice(0, -1)}A`)).toBeNull();
  });

  it('khóa của mục đích khác hoặc secret khác không kiểm được', () => {
    const token = codec('workspace-cookie/v1').sign('ws-1');
    expect(codec('invite-cookie/v1').verify(token)).toBeNull();
    expect(codec('workspace-cookie/v1', `${secret}x`).verify(token)).toBeNull();
  });

  it('rác, rỗng, quá dài → null', () => {
    for (const bad of [undefined, '', 'abc', '.', 'a.b', 'x'.repeat(2000)])
      expect(codec().verify(bad)).toBeNull();
  });
});
