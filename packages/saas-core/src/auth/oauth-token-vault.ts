/**
 * Niêm phong token OAuth lưu ở `accounts.access_token/refresh_token/id_token` (docs/13 §5, Q-OTE1).
 *
 * `saas-core` không import code sản phẩm nên nhận bộ mã hóa qua interface `OAuthTokenCipher` — hình dạng khớp
 * `createTokenCipher` (AES-256-GCM, `TOKEN_ENC_KEYS`, `key_version`) của `@flow/connectors`; nơi lắp ráp truyền vào.
 * Không cần migration: cột là `text`, nên phiên bản khóa nằm trong chuỗi lưu `enc:v<n>:<base64url(nonce‖bản mã‖tag)>`.
 * Ngữ cảnh xác thực (AAD) = nhà cung cấp + user + tên trường: chép sang user/trường khác thì không mở được.
 * KHÔNG đưa token, bản niêm phong hay khóa vào thông báo lỗi/log.
 */
export type OAuthTokenCipher = {
  readonly currentVersion: number;
  encrypt(
    plaintext: string,
    ctx: { workspaceId: string; channelId: string },
  ): { ciphertext: Buffer; keyVersion: number };
  decrypt(
    ciphertext: Buffer,
    keyVersion: number,
    ctx: { workspaceId: string; channelId: string },
  ): string;
};

export type OAuthTokenField = 'access_token' | 'refresh_token' | 'id_token';
export type OAuthTokenScope = { userId: string; providerId: string; field: OAuthTokenField };

/** Bản niêm phong hỏng/sai ngữ cảnh/sai khóa. Cố ý không có `cause` và không chứa dữ liệu. */
export class OAuthTokenOpenError extends Error {
  constructor() {
    super('Không mở được token OAuth đã niêm phong.');
    this.name = 'OAuthTokenOpenError';
  }
}

const PREFIX = 'enc:v';
const SEALED = /^enc:v([1-9][0-9]{0,8}):([A-Za-z0-9_-]+)$/;

/** Cột trong `accounts` (tên thuộc tính Better Auth) → trường dùng làm ngữ cảnh. */
const FIELD_OF = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  idToken: 'id_token',
} as const satisfies Record<string, OAuthTokenField>;

const ctxOf = (s: OAuthTokenScope) => ({
  workspaceId: `oauth/${s.providerId}`,
  channelId: `${s.userId}/${s.field}`,
});

/** Lỗi thiếu khóa (có `keyVersion`, như `TokenKeyMissingError`) là lỗi CẤU HÌNH — ném nguyên, không đổi thành lỗi dữ liệu. */
const isKeyMissing = (e: unknown): boolean =>
  e instanceof Error && typeof (e as { keyVersion?: unknown }).keyVersion === 'number';

export function createOAuthTokenVault(cipher: OAuthTokenCipher) {
  const isSealed = (value: string): boolean => value.startsWith(PREFIX);

  function parse(stored: string): { version: number; ciphertext: Buffer } {
    const match = SEALED.exec(stored);
    if (!match) throw new OAuthTokenOpenError();
    return { version: Number(match[1]), ciphertext: Buffer.from(match[2] as string, 'base64url') };
  }

  function seal(plaintext: string, scope: OAuthTokenScope): string {
    if (isSealed(plaintext)) return plaintext; // không niêm phong hai lần
    const { ciphertext, keyVersion } = cipher.encrypt(plaintext, ctxOf(scope));
    return `${PREFIX}${keyVersion}:${ciphertext.toString('base64url')}`;
  }

  /** Bản rõ cũ (chưa có tiền tố) trả nguyên để chuyển tiếp; dùng `needsReseal` để mã hóa lại dần. */
  function open(stored: string, scope: OAuthTokenScope): string {
    if (!isSealed(stored)) return stored;
    const { version, ciphertext } = parse(stored);
    try {
      return cipher.decrypt(ciphertext, version, ctxOf(scope));
    } catch (e) {
      if (isKeyMissing(e)) throw e;
      throw new OAuthTokenOpenError();
    }
  }

  const needsReseal = (stored: string): boolean =>
    !isSealed(stored) || parse(stored).version !== cipher.currentVersion;

  /** Đưa về khóa mới nhất (bản rõ cũ → niêm phong). Lỗi mở → ném, không trả gì để ghi đè. */
  function rotate(stored: string, scope: OAuthTokenScope): string {
    if (!needsReseal(stored)) return stored;
    return seal(open(stored, scope), scope);
  }

  type Row = Partial<Record<keyof typeof FIELD_OF, string | null>>;
  const mapFields = <T extends Row>(
    data: T,
    who: { userId: string; providerId: string },
    fn: (value: string, scope: OAuthTokenScope) => string,
  ): T => {
    const out: Record<string, unknown> = { ...data };
    for (const [prop, field] of Object.entries(FIELD_OF)) {
      const value = out[prop];
      if (typeof value === 'string') out[prop] = fn(value, { ...who, field });
    }
    return out as T;
  };

  return {
    isSealed,
    seal,
    open,
    needsReseal,
    rotate,
    /** Niêm phong các trường token có trong `data` (null/undefined/trường khác giữ nguyên). */
    sealFields: <T extends Row>(data: T, who: { userId: string; providerId: string }): T =>
      mapFields(data, who, seal),
    openFields: <T extends Row>(data: T, who: { userId: string; providerId: string }): T =>
      mapFields(data, who, open),
  };
}

export type OAuthTokenVault = ReturnType<typeof createOAuthTokenVault>;

/** Ghi token mà không biết user/nhà cung cấp thì không có ngữ cảnh để niêm phong → từ chối, KHÔNG lưu bản rõ. */
export class OAuthTokenScopeError extends Error {
  constructor() {
    super('Thiếu userId/providerId nên không thể niêm phong token OAuth.');
    this.name = 'OAuthTokenScopeError';
  }
}

type AccountWrite = Record<string, unknown>;

/**
 * Hook ghi `accounts` của Better Auth: niêm phong token trước khi lưu. Không có cipher → `undefined` (hành vi cũ, TẮT
 * mặc định). Đọc lại token phải qua `vault.openFields`; giữ `account.encryptOAuthTokens` của Better Auth TẮT (tránh
 * mã hóa hai lần).
 */
export function createAccountTokenHooks(cipher: OAuthTokenCipher | undefined) {
  if (!cipher) return undefined;
  const vault = createOAuthTokenVault(cipher);
  const before = async (data: AccountWrite) => {
    const touchesToken = Object.keys(FIELD_OF).some((prop) => typeof data[prop] === 'string');
    if (!touchesToken) return { data };
    const { userId, providerId } = data;
    if (typeof userId !== 'string' || typeof providerId !== 'string') {
      throw new OAuthTokenScopeError();
    }
    return { data: vault.sealFields(data, { userId, providerId }) };
  };
  return { create: { before }, update: { before } };
}
