import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * Kho SĐT/email của Khách tiềm năng (FR-082, Q-LDS1): DB không bao giờ giữ số/email thô.
 *  - Mã hóa AES-256-GCM (để người được giao xem lại số): nonce 12 byte ngẫu nhiên ‖ bản mã ‖ tag 16 byte; AAD =
 *    `workspace|lead|trường|phiên bản khóa` nên bản mã chép sang lead/workspace/trường khác không giải mã được.
 *    `LEADS_ENC_KEYS=v1:<64 hex>,v2:<…>`: phiên bản cao nhất để mã hóa, cũ để giải mã (xoay khóa như `TOKEN_ENC_KEYS`).
 *  - Chỉ mục băm HMAC-SHA256 theo (workspace, loại) để chống trùng/tìm mà không lộ số. `LEADS_HASH_KEY` (64 hex)
 *    KHÔNG xoay được (đổi khóa = mọi băm cũ vô hiệu → mất chống trùng, không mất dữ liệu).
 * KHÔNG đưa bản rõ, bản mã hay khóa vào thông báo lỗi/log.
 */
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = 'aes-256-gcm';
const HEX_KEY = new RegExp(`^[0-9a-fA-F]{${KEY_BYTES * 2}}$`);

/** Cấu hình khóa sai/thiếu (lỗi CẤU HÌNH, không phải dữ liệu hỏng). Không chứa giá trị khóa. */
export class LeadKeyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeadKeyConfigError';
  }
}

/** Giải mã thất bại (sai khóa/AAD/bản mã hỏng). Cố ý không có `cause` và không chứa dữ liệu. */
export class LeadDecryptError extends Error {
  constructor() {
    super('Không giải mã được thông tin liên hệ.');
    this.name = 'LeadDecryptError';
  }
}

export type ParsedLeadKeys = { keys: ReadonlyMap<number, Buffer>; currentVersion: number };

export function parseLeadKeys(raw: string | undefined): ParsedLeadKeys {
  if (raw === undefined || raw.trim() === '') {
    throw new LeadKeyConfigError('Thiếu LEADS_ENC_KEYS (định dạng v1:<64 ký tự hex>,v2:<…>).');
  }
  const keys = new Map<number, Buffer>();
  raw.split(',').forEach((part, index) => {
    const match = /^v([1-9][0-9]*):(.*)$/.exec(part.trim());
    if (!match) {
      throw new LeadKeyConfigError(
        `LEADS_ENC_KEYS: mục thứ ${index + 1} phải có dạng v<số>:<64 ký tự hex>.`,
      );
    }
    const version = Number(match[1]);
    const key = match[2] as string;
    if (!Number.isSafeInteger(version)) {
      throw new LeadKeyConfigError(
        `LEADS_ENC_KEYS: phiên bản ở mục thứ ${index + 1} không hợp lệ.`,
      );
    }
    if (!HEX_KEY.test(key)) {
      throw new LeadKeyConfigError(
        `LEADS_ENC_KEYS: khóa của mục thứ ${index + 1} phải đúng ${KEY_BYTES * 2} ký tự hex (32 byte).`,
      );
    }
    if (keys.has(version)) {
      throw new LeadKeyConfigError(`LEADS_ENC_KEYS: phiên bản v${version} bị trùng.`);
    }
    keys.set(version, Buffer.from(key, 'hex'));
  });
  return { keys, currentVersion: Math.max(...keys.keys()) };
}

export function parseLeadHashKey(raw: string | undefined): Buffer {
  const value = raw?.trim() ?? '';
  if (!HEX_KEY.test(value)) {
    throw new LeadKeyConfigError(`LEADS_HASH_KEY phải đúng ${KEY_BYTES * 2} ký tự hex (32 byte).`);
  }
  return Buffer.from(value, 'hex');
}

export type LeadField = 'phone' | 'email';
export type LeadCipherContext = { workspaceId: string; leadId: string; field: LeadField };
export type EncryptedLeadField = { ciphertext: Buffer; keyVersion: number };

const aadOf = (ctx: LeadCipherContext, keyVersion: number): Buffer =>
  Buffer.from(`${ctx.workspaceId}|${ctx.leadId}|${ctx.field}|${keyVersion}`.toLowerCase(), 'utf8');

export function createLeadVault(config: { encKeys: ParsedLeadKeys; hashKey: Buffer }) {
  const { keys, currentVersion } = config.encKeys;

  function encrypt(plaintext: string, ctx: LeadCipherContext): EncryptedLeadField {
    const key = keys.get(currentVersion);
    if (!key) throw new LeadKeyConfigError('Thiếu khóa của phiên bản mã hóa hiện tại.');
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, nonce);
    cipher.setAAD(aadOf(ctx, currentVersion));
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: Buffer.concat([nonce, body, cipher.getAuthTag()]),
      keyVersion: currentVersion,
    };
  }

  function decrypt(ciphertext: Buffer, keyVersion: number, ctx: LeadCipherContext): string {
    const key = keys.get(keyVersion);
    if (!key) throw new LeadKeyConfigError(`Thiếu khóa cho key_version v${keyVersion}.`);
    if (ciphertext.length < NONCE_BYTES + TAG_BYTES) throw new LeadDecryptError();
    try {
      const nonce = ciphertext.subarray(0, NONCE_BYTES);
      const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES);
      const body = ciphertext.subarray(NONCE_BYTES, ciphertext.length - TAG_BYTES);
      const decipher = createDecipheriv(ALGORITHM, key, nonce);
      decipher.setAAD(aadOf(ctx, keyVersion));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    } catch {
      // Nuốt lỗi gốc có chủ đích: thông điệp OpenSSL có thể gợi ý về dữ liệu.
      throw new LeadDecryptError();
    }
  }

  /** HMAC-SHA256(khóa băm, `workspace|loại|giá trị chuẩn hóa`) — 32 byte; cùng đầu vào → cùng băm. */
  function blindIndex(workspaceId: string, field: LeadField, normalized: string): Buffer {
    return createHmac('sha256', config.hashKey)
      .update(`${workspaceId.toLowerCase()}|${field}|${normalized}`, 'utf8')
      .digest();
  }

  return { currentVersion, encrypt, decrypt, blindIndex };
}

export type LeadVault = ReturnType<typeof createLeadVault>;
