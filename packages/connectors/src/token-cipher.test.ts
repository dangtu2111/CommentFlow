import { randomBytes } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createTokenCipher,
  parseTokenKeys,
  TOKEN_KEY_BYTES,
  TokenConfigError,
  TokenDecryptError,
} from './token-cipher';

const hex = () => randomBytes(TOKEN_KEY_BYTES).toString('hex');
const WS = '11111111-1111-4111-8111-111111111111';
const CH = '22222222-2222-4222-8222-222222222222';
const ctx = { workspaceId: WS, channelId: CH };

const cipherOf = (spec: string) => createTokenCipher(parseTokenKeys(spec));

describe('FR-010 parseTokenKeys — cấu hình khóa mã hóa token', () => {
  it('FR-010 đọc nhiều phiên bản; phiên bản cao nhất là khóa mã hóa hiện tại', () => {
    const parsed = parseTokenKeys(`v1:${hex()}, v3:${hex()},v2:${hex()}`);
    expect(parsed.currentVersion).toBe(3);
    expect([...parsed.keys.keys()].sort()).toEqual([1, 2, 3]);
    for (const key of parsed.keys.values()) expect(key.length).toBe(TOKEN_KEY_BYTES);
  });

  it('FR-010 từ chối: rỗng/thiếu, sai định dạng, khóa không đủ 64 hex, ký tự không phải hex, phiên bản trùng/không hợp lệ', () => {
    const bad = [
      undefined,
      '',
      '   ',
      'khong-co-phien-ban',
      `1:${hex()}`,
      `v0:${hex()}`,
      `v-1:${hex()}`,
      `v1.5:${hex()}`,
      `v1:${hex().slice(0, 62)}`,
      `v1:${hex()}00`,
      `v1:${'z'.repeat(64)}`,
      `v1:${hex()},v1:${hex()}`,
      `v1:${hex()},`,
      `v${'9'.repeat(30)}:${hex()}`,
    ];
    for (const spec of bad) {
      expect(() => parseTokenKeys(spec), String(spec)).toThrow(TokenConfigError);
    }
  });

  it('FR-010 thông báo lỗi KHÔNG chứa giá trị khóa (kể cả khi khóa sai độ dài)', () => {
    const secret = `${hex()}ab`;
    try {
      parseTokenKeys(`v1:${secret}`);
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(secret);
      expect(String((error as Error).message)).not.toContain(secret.slice(0, 16));
    }
  });
});

describe('FR-010 createTokenCipher — AES-256-GCM', () => {
  it('FR-010 mã hóa rồi giải mã ra đúng bản rõ; ciphertext không chứa bản rõ', () => {
    const cipher = cipherOf(`v1:${hex()}`);
    const { ciphertext, keyVersion } = cipher.encrypt('EAAGm0PX4ZCpsBA-token-that', ctx);
    expect(keyVersion).toBe(1);
    expect(ciphertext.toString('utf8')).not.toContain('EAAGm0PX4ZCpsBA');
    expect(cipher.decrypt(ciphertext, keyVersion, ctx)).toBe('EAAGm0PX4ZCpsBA-token-that');
  });

  it('FR-010 nonce ngẫu nhiên: cùng bản rõ mã hóa hai lần cho ciphertext khác nhau', () => {
    const cipher = cipherOf(`v1:${hex()}`);
    const a = cipher.encrypt('cung-mot-token', ctx).ciphertext;
    const b = cipher.encrypt('cung-mot-token', ctx).ciphertext;
    expect(a.equals(b)).toBe(false);
    expect(a.subarray(0, 12).equals(b.subarray(0, 12))).toBe(false);
  });

  it('FR-010 sửa BẤT KỲ bit nào của ciphertext (nonce, thân, tag) → lỗi giải mã', () => {
    const cipher = cipherOf(`v1:${hex()}`);
    const { ciphertext, keyVersion } = cipher.encrypt('token', ctx);
    for (let i = 0; i < ciphertext.length; i++) {
      const tampered = Buffer.from(ciphertext);
      tampered[i] = (tampered[i] ?? 0) ^ 0x01;
      expect(() => cipher.decrypt(tampered, keyVersion, ctx), `byte ${i}`).toThrow(
        TokenDecryptError,
      );
    }
    expect(() =>
      cipher.decrypt(ciphertext.subarray(0, ciphertext.length - 1), keyVersion, ctx),
    ).toThrow(TokenDecryptError);
    expect(() => cipher.decrypt(Buffer.alloc(0), keyVersion, ctx)).toThrow(TokenDecryptError);
  });

  it('FR-010 AAD: sai workspaceId hoặc channelId (ciphertext copy sang kênh khác) → lỗi', () => {
    const cipher = cipherOf(`v1:${hex()}`);
    const { ciphertext, keyVersion } = cipher.encrypt('token', ctx);
    const otherWs = { ...ctx, workspaceId: '33333333-3333-4333-8333-333333333333' };
    const otherCh = { ...ctx, channelId: '44444444-4444-4444-8444-444444444444' };
    expect(() => cipher.decrypt(ciphertext, keyVersion, otherWs)).toThrow(TokenDecryptError);
    expect(() => cipher.decrypt(ciphertext, keyVersion, otherCh)).toThrow(TokenDecryptError);
  });

  it('FR-010 AAD gồm key_version: khai sai phiên bản (dù có khóa đúng) → lỗi; phiên bản không có khóa → lỗi', () => {
    const k = hex();
    const cipher = cipherOf(`v1:${k},v2:${k}`); // cùng khóa hai phiên bản: chỉ AAD phân biệt
    const { ciphertext } = cipher.encrypt('token', ctx); // mã hóa bằng v2
    expect(() => cipher.decrypt(ciphertext, 1, ctx)).toThrow(TokenDecryptError);
    expect(cipher.decrypt(ciphertext, 2, ctx)).toBe('token');
    expect(() => cipher.decrypt(ciphertext, 9, ctx)).toThrow(TokenDecryptError);
  });

  it('FR-010 sai khóa → lỗi giải mã', () => {
    const { ciphertext, keyVersion } = cipherOf(`v1:${hex()}`).encrypt('token', ctx);
    expect(() => cipherOf(`v1:${hex()}`).decrypt(ciphertext, keyVersion, ctx)).toThrow(
      TokenDecryptError,
    );
  });

  it('FR-010 TokenDecryptError không chứa token, ciphertext, khóa hay nonce trong thông báo/nguyên nhân', () => {
    const k = hex();
    const cipher = cipherOf(`v1:${k}`);
    const { ciphertext, keyVersion } = cipher.encrypt('token-bi-mat-123', ctx);
    const tampered = Buffer.from(ciphertext);
    tampered[20] = (tampered[20] ?? 0) ^ 0xff;
    try {
      cipher.decrypt(tampered, keyVersion, ctx);
      expect.unreachable();
    } catch (error) {
      const e = error as TokenDecryptError;
      const dump = JSON.stringify({
        m: e.message,
        c: String(e.cause ?? ''),
        s: e.stack?.split('\n')[0],
      });
      for (const secret of [
        'token-bi-mat-123',
        k,
        tampered.toString('hex'),
        tampered.toString('base64'),
      ]) {
        expect(dump).not.toContain(secret);
      }
      expect(e.cause).toBeUndefined();
    }
  });

  it('FR-010 xoay khóa: bản mã hóa bằng v1 vẫn giải mã được sau khi thêm v2; bản mới dùng v2', () => {
    const k1 = hex();
    const k2 = hex();
    const old = cipherOf(`v1:${k1}`).encrypt('token-cu', ctx);
    expect(old.keyVersion).toBe(1);
    const rotated = cipherOf(`v1:${k1},v2:${k2}`);
    expect(rotated.currentVersion).toBe(2);
    expect(rotated.decrypt(old.ciphertext, old.keyVersion, ctx)).toBe('token-cu');
    expect(rotated.encrypt('token-moi', ctx).keyVersion).toBe(2);
  });

  it('FR-010 reencrypt: đọc bằng khóa cũ, ghi bằng phiên bản mới nhất (nonce mới), bản rõ không đổi', () => {
    const k1 = hex();
    const k2 = hex();
    const old = cipherOf(`v1:${k1}`).encrypt('token-xoay', ctx);
    const cipher = cipherOf(`v1:${k1},v2:${k2}`);
    const next = cipher.reencrypt(old.ciphertext, old.keyVersion, ctx);
    expect(next.keyVersion).toBe(2);
    expect(next.ciphertext.equals(old.ciphertext)).toBe(false);
    expect(cipher.decrypt(next.ciphertext, next.keyVersion, ctx)).toBe('token-xoay');
    // gỡ khóa v1 vẫn đọc được bản đã xoay; bản chưa xoay thì không
    const onlyV2 = cipherOf(`v2:${k2}`);
    expect(onlyV2.decrypt(next.ciphertext, 2, ctx)).toBe('token-xoay');
    expect(() => onlyV2.decrypt(old.ciphertext, 1, ctx)).toThrow(TokenDecryptError);
  });

  it('FR-010 reencrypt từ chối khi không giải mã được bản gốc (không làm hỏng dữ liệu âm thầm)', () => {
    const cipher = cipherOf(`v1:${hex()},v2:${hex()}`);
    expect(() => cipher.reencrypt(randomBytes(40), 1, ctx)).toThrow(TokenDecryptError);
  });

  it('FR-010 cấu hình hỏng (phiên bản mã hóa hiện tại không có khóa) → TokenConfigError khi mã hóa', () => {
    const cipher = createTokenCipher({ keys: new Map(), currentVersion: 1 });
    expect(() => cipher.encrypt('token', ctx)).toThrow(TokenConfigError);
  });

  it('FR-010 thuộc tính: giải mã(mã hóa(x)) = x với mọi chuỗi Unicode, kể cả rỗng và rất dài', () => {
    const cipher = cipherOf(`v1:${hex()}`);
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 5000 }), (text) => {
        const { ciphertext, keyVersion } = cipher.encrypt(text, ctx);
        expect(cipher.decrypt(ciphertext, keyVersion, ctx)).toBe(text);
      }),
      { numRuns: 100 },
    );
  });
});
