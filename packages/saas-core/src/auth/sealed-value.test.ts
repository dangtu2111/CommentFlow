import { describe, expect, it } from 'vitest';
import { createSealedValueCodec } from './sealed-value';

const SECRET = 'a'.repeat(32);
const make = (over: Partial<Parameters<typeof createSealedValueCodec>[0]> = {}) =>
  createSealedValueCodec({ secret: SECRET, label: 'fb-oauth/v1', ttlSeconds: 600, ...over });

describe('createSealedValueCodec', () => {
  it('seal → open trả giá trị gốc; token không chứa bản rõ', () => {
    const codec = make();
    const token = codec.seal('EAAsecrettoken');
    expect(token).not.toContain('EAAsecrettoken');
    expect(Buffer.from(token, 'base64url').toString('latin1')).not.toContain('EAAsecrettoken');
    expect(codec.open(token)).toBe('EAAsecrettoken');
  });

  it('hai lần seal cùng giá trị cho hai token khác nhau (nonce ngẫu nhiên)', () => {
    const codec = make();
    expect(codec.seal('x')).not.toBe(codec.seal('x'));
  });

  it('hết hạn → null', () => {
    let t = 1_000_000;
    const codec = make({ now: () => t });
    const token = codec.seal('x');
    t += 599_000;
    expect(codec.open(token)).toBe('x');
    t += 2_000;
    expect(codec.open(token)).toBeNull();
  });

  it('sửa một byte, sai secret, sai nhãn, rác, rỗng → null', () => {
    const codec = make();
    const token = codec.seal('x');
    const flipped = `${token.slice(0, -2)}${token.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(codec.open(flipped)).toBeNull();
    expect(make({ secret: 'b'.repeat(32) }).open(token)).toBeNull();
    expect(make({ label: 'other/v1' }).open(token)).toBeNull();
    expect(codec.open('not-a-token')).toBeNull();
    expect(codec.open('')).toBeNull();
    expect(codec.open(undefined)).toBeNull();
    expect(codec.open('A'.repeat(5000))).toBeNull();
  });

  it('quá dài cho một cookie → ném lỗi khi seal', () => {
    expect(() => make().seal('x'.repeat(4000))).toThrow();
  });
});
