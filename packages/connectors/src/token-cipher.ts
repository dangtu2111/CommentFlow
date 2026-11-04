import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Mã hóa token nền tảng (docs/13 §5): AES-256-GCM, nonce 12 byte ngẫu nhiên mỗi lần, `key_version` để xoay khóa.
 * Bố cục ciphertext: nonce (12) ‖ bản mã ‖ tag (16). Dữ liệu xác thực kèm (AAD) = `workspaceId|channelId|keyVersion`:
 * ciphertext copy sang kênh/workspace khác hoặc khai sai phiên bản khóa đều không giải mã được.
 * KHÔNG bao giờ đưa token, ciphertext hay khóa vào thông báo lỗi/log.
 */
export const TOKEN_KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = 'aes-256-gcm';

/** Cấu hình khóa sai/thiếu. Thông báo không chứa giá trị khóa. */
export class TokenConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenConfigError';
  }
}

/** Thiếu khóa cho một `key_version` đang có dữ liệu: lỗi CẤU HÌNH (không phải dữ liệu hỏng) — không đánh dấu kênh. */
export class TokenKeyMissingError extends TokenConfigError {
  constructor(readonly keyVersion: number) {
    super(`Thiếu khóa cho key_version v${keyVersion} trong TOKEN_ENC_KEYS.`);
    this.name = 'TokenKeyMissingError';
  }
}

/** Giải mã thất bại (sai khóa/AAD/ciphertext hỏng). Cố ý không có `cause` và không chứa dữ liệu nào. */
export class TokenDecryptError extends Error {
  constructor() {
    super('Không giải mã được token.');
    this.name = 'TokenDecryptError';
  }
}

export type ParsedTokenKeys = { keys: ReadonlyMap<number, Buffer>; currentVersion: number };

const HEX_KEY = new RegExp(`^[0-9a-fA-F]{${TOKEN_KEY_BYTES * 2}}$`);

/**
 * Đọc `TOKEN_ENC_KEYS` dạng `v1:<64 hex>,v2:<64 hex>`. Phiên bản cao nhất dùng để mã hóa, các phiên bản cũ chỉ để giải
 * mã. Sai định dạng → `TokenConfigError` (chỉ nói vị trí/lý do, không in khóa).
 */
export function parseTokenKeys(raw: string | undefined): ParsedTokenKeys {
  if (raw === undefined || raw.trim() === '') {
    throw new TokenConfigError('Thiếu TOKEN_ENC_KEYS (định dạng v1:<64 ký tự hex>,v2:<…>).');
  }
  const keys = new Map<number, Buffer>();
  raw.split(',').forEach((part, index) => {
    const match = /^v([1-9][0-9]*):(.*)$/.exec(part.trim());
    if (!match) {
      throw new TokenConfigError(
        `TOKEN_ENC_KEYS: mục thứ ${index + 1} phải có dạng v<số>:<64 ký tự hex>.`,
      );
    }
    const version = Number(match[1]);
    const key = match[2] as string; // regex luôn có nhóm 2 (có thể rỗng)
    if (!Number.isSafeInteger(version)) {
      throw new TokenConfigError(`TOKEN_ENC_KEYS: phiên bản ở mục thứ ${index + 1} không hợp lệ.`);
    }
    if (!HEX_KEY.test(key)) {
      throw new TokenConfigError(
        `TOKEN_ENC_KEYS: khóa của mục thứ ${index + 1} phải đúng ${TOKEN_KEY_BYTES * 2} ký tự hex (32 byte).`,
      );
    }
    if (keys.has(version)) {
      throw new TokenConfigError(`TOKEN_ENC_KEYS: phiên bản v${version} bị trùng.`);
    }
    keys.set(version, Buffer.from(key, 'hex'));
  });
  return { keys, currentVersion: Math.max(...keys.keys()) };
}

export type TokenContext = { workspaceId: string; channelId: string };
export type EncryptedToken = { ciphertext: Buffer; keyVersion: number };

const aadOf = (ctx: TokenContext, keyVersion: number): Buffer =>
  Buffer.from(`${ctx.workspaceId}|${ctx.channelId}|${keyVersion}`.toLowerCase(), 'utf8');

export function createTokenCipher(config: ParsedTokenKeys) {
  const { keys, currentVersion } = config;

  function encrypt(plaintext: string, ctx: TokenContext): EncryptedToken {
    const key = keys.get(currentVersion);
    if (!key) throw new TokenConfigError('Thiếu khóa của phiên bản mã hóa hiện tại.');
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, nonce);
    cipher.setAAD(aadOf(ctx, currentVersion));
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: Buffer.concat([nonce, body, cipher.getAuthTag()]),
      keyVersion: currentVersion,
    };
  }

  function decrypt(ciphertext: Buffer, keyVersion: number, ctx: TokenContext): string {
    const key = keys.get(keyVersion);
    if (!key) throw new TokenKeyMissingError(keyVersion);
    if (ciphertext.length < NONCE_BYTES + TAG_BYTES) throw new TokenDecryptError();
    try {
      const nonce = ciphertext.subarray(0, NONCE_BYTES);
      const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES);
      const body = ciphertext.subarray(NONCE_BYTES, ciphertext.length - TAG_BYTES);
      const decipher = createDecipheriv(ALGORITHM, key, nonce);
      decipher.setAAD(aadOf(ctx, keyVersion));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    } catch {
      // Nuốt lỗi gốc có chủ đích: thông điệp của OpenSSL có thể gợi ý về dữ liệu; không giữ `cause`.
      throw new TokenDecryptError();
    }
  }

  /** Giải mã bằng phiên bản cũ rồi mã hóa lại bằng phiên bản mới nhất (nonce mới). Lỗi giải mã → ném, không ghi gì. */
  function reencrypt(ciphertext: Buffer, fromVersion: number, ctx: TokenContext): EncryptedToken {
    return encrypt(decrypt(ciphertext, fromVersion, ctx), ctx);
  }

  return { currentVersion, encrypt, decrypt, reencrypt };
}

export type TokenCipher = ReturnType<typeof createTokenCipher>;
