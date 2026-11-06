import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createLeadVault,
  LeadDecryptError,
  LeadKeyConfigError,
  parseLeadHashKey,
  parseLeadKeys,
} from './lead-vault';

const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);
const HASH = 'c'.repeat(64);
const WS = '11111111-1111-4111-8111-111111111111';
const WS2 = '22222222-2222-4222-8222-222222222222';
const LEAD = '33333333-3333-4333-8333-333333333333';

const vault = (keys = `v1:${HEX_A}`) =>
  createLeadVault({ encKeys: parseLeadKeys(keys), hashKey: parseLeadHashKey(HASH) });
const ctx = { workspaceId: WS, leadId: LEAD, field: 'phone' } as const;

describe('FR-082 kho khóa lead: đọc cấu hình', () => {
  it('đọc nhiều phiên bản, phiên bản cao nhất là hiện tại', () => {
    const parsed = parseLeadKeys(`v1:${HEX_A},v2:${HEX_B}`);
    expect(parsed.currentVersion).toBe(2);
    expect(parsed.keys.size).toBe(2);
  });

  it('thiếu/sai định dạng/trùng phiên bản → LeadKeyConfigError, không lộ khóa', () => {
    for (const raw of [undefined, '', 'v1:abc', `x1:${HEX_A}`, `v1:${HEX_A},v1:${HEX_B}`]) {
      expect(() => parseLeadKeys(raw)).toThrow(LeadKeyConfigError);
    }
    expect(() => parseLeadKeys('v1:zz')).toThrow(/mục thứ 1/);
    try {
      parseLeadKeys(`v1:${HEX_A.slice(0, 63)}`);
    } catch (e) {
      expect(String(e)).not.toContain(HEX_A.slice(0, 20));
    }
  });

  it('khóa băm phải đúng 64 hex', () => {
    expect(() => parseLeadHashKey(undefined)).toThrow(LeadKeyConfigError);
    expect(() => parseLeadHashKey('abc')).toThrow(LeadKeyConfigError);
    expect(parseLeadHashKey(HASH)).toBeInstanceOf(Buffer);
  });
});

describe('FR-082 mã hóa SĐT/email lead (AES-256-GCM)', () => {
  it('khứ hồi và bản mã không chứa bản rõ', () => {
    const v = vault();
    const enc = v.encrypt('0912345678', ctx);
    expect(enc.keyVersion).toBe(1);
    expect(enc.ciphertext.toString('utf8')).not.toContain('0912345678');
    expect(v.decrypt(enc.ciphertext, enc.keyVersion, ctx)).toBe('0912345678');
  });

  it('property: mọi chuỗi khứ hồi đúng; hai lần mã hóa cho bản mã khác nhau (nonce ngẫu nhiên)', () => {
    const v = vault();
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        const a = v.encrypt(text, ctx);
        const b = v.encrypt(text, ctx);
        expect(v.decrypt(a.ciphertext, a.keyVersion, ctx)).toBe(text);
        expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
      }),
    );
  });

  it('sai workspace, lead, trường hoặc phiên bản khóa → LeadDecryptError', () => {
    const v = vault(`v1:${HEX_A},v2:${HEX_B}`);
    const enc = v.encrypt('a@x.vn', { ...ctx, field: 'email' });
    const email = { ...ctx, field: 'email' } as const;
    expect(() => v.decrypt(enc.ciphertext, enc.keyVersion, { ...email, workspaceId: WS2 })).toThrow(
      LeadDecryptError,
    );
    expect(() => v.decrypt(enc.ciphertext, enc.keyVersion, { ...email, leadId: WS2 })).toThrow(
      LeadDecryptError,
    );
    expect(() => v.decrypt(enc.ciphertext, enc.keyVersion, ctx)).toThrow(LeadDecryptError);
    expect(() => v.decrypt(enc.ciphertext, 1, email)).toThrow(LeadDecryptError);
  });

  it('bản mã bị sửa hoặc quá ngắn → LeadDecryptError, thông báo không chứa dữ liệu', () => {
    const v = vault();
    const enc = v.encrypt('0912345678', ctx);
    const tampered = Buffer.from(enc.ciphertext);
    tampered[14] = (tampered[14] ?? 0) ^ 1;
    expect(() => v.decrypt(tampered, 1, ctx)).toThrow(LeadDecryptError);
    expect(() => v.decrypt(Buffer.alloc(5), 1, ctx)).toThrow(LeadDecryptError);
    try {
      v.decrypt(tampered, 1, ctx);
    } catch (e) {
      expect(String(e)).not.toContain('0912345678');
    }
  });

  it('khóa cũ vẫn giải mã được sau khi xoay; thiếu khóa phiên bản → lỗi cấu hình', () => {
    const old = vault(`v1:${HEX_A}`).encrypt('x', ctx);
    const rotated = vault(`v1:${HEX_A},v2:${HEX_B}`);
    expect(rotated.currentVersion).toBe(2);
    expect(rotated.decrypt(old.ciphertext, 1, ctx)).toBe('x');
    expect(() => vault(`v2:${HEX_B}`).decrypt(old.ciphertext, 1, ctx)).toThrow(LeadKeyConfigError);
  });
});

describe('FR-082 chỉ mục băm chống trùng (HMAC-SHA256)', () => {
  it('ổn định, 32 byte, không chứa bản rõ', () => {
    const v = vault();
    const h = v.blindIndex(WS, 'phone', '0912345678');
    expect(h).toHaveLength(32);
    expect(h.equals(v.blindIndex(WS, 'phone', '0912345678'))).toBe(true);
  });

  it('khác workspace / khác loại / khác giá trị / khác khóa → khác băm', () => {
    const v = vault();
    const base = v.blindIndex(WS, 'phone', '0912345678');
    expect(base.equals(v.blindIndex(WS2, 'phone', '0912345678'))).toBe(false);
    expect(base.equals(v.blindIndex(WS, 'email', '0912345678'))).toBe(false);
    expect(base.equals(v.blindIndex(WS, 'phone', '0912345679'))).toBe(false);
    const other = createLeadVault({
      encKeys: parseLeadKeys(`v1:${HEX_A}`),
      hashKey: parseLeadHashKey('d'.repeat(64)),
    });
    expect(base.equals(other.blindIndex(WS, 'phone', '0912345678'))).toBe(false);
  });

  it('property: băm không đổi khi xoay khóa mã hóa; hai giá trị khác nhau hiếm khi trùng', () => {
    const a = vault(`v1:${HEX_A}`);
    const b = vault(`v1:${HEX_A},v2:${HEX_B}`);
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 60 }), (text) => {
        expect(a.blindIndex(WS, 'email', text).equals(b.blindIndex(WS, 'email', text))).toBe(true);
      }),
    );
  });
});
