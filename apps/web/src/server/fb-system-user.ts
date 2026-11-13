import { diagnoseFbSystemToken, parseFbSystemToken } from '../lib/fb-system-token-form';

export type FbSystemUserSession = { workspaceId: string; userId: string };
export type FbSealed = { ciphertext: Buffer; keyVersion: number };

export type FbSystemUserSaveResult =
  | 'ok'
  | 'invalid'
  | 'not_configured'
  | 'forbidden'
  | 'unavailable'
  | 'invalid_credentials'
  | 'missing_scopes'
  | 'unreachable';
export type FbSystemUserLoadResult =
  | { status: 'ok'; token: string }
  | { status: 'none' }
  | { status: 'unusable' };
export type FbSystemUserDisconnectResult = 'ok' | 'not_found' | 'forbidden' | 'unavailable';

/** Kết quả hỏi Meta về token vừa dán (`debug_token`): còn hiệu lực, có đủ quyền liệt kê Page. */
export type FbSystemUserVerifyResult = {
  status: 'ok' | 'invalid_credentials' | 'missing_scopes' | 'unreachable';
};

export type FbSystemUserDeps = {
  /** Mã hóa (AES-GCM, AAD = workspace + khóa cố định); `undefined` khi máy chủ chưa có `TOKEN_ENC_KEYS`. */
  encrypt: ((token: string, ctx: { workspaceId: string }) => FbSealed) | undefined;
  /** Giải mã; ném nếu sai khóa/AAD/ciphertext hỏng. */
  decrypt: (sealed: FbSealed, ctx: { workspaceId: string }) => string;
  verify: (token: string) => Promise<FbSystemUserVerifyResult>;
  save: (session: FbSystemUserSession, sealed: FbSealed) => Promise<void>;
  /** Đọc ciphertext (đường hệ thống `withJob`, CHỈ sau khi nơi gọi đã kiểm Owner). `null` = chưa lưu/đã ngắt/đã hỏng. */
  readCipher: (session: FbSystemUserSession) => Promise<FbSealed | null>;
  markInvalid: (session: FbSystemUserSession) => Promise<void>;
  disconnect: (session: FbSystemUserSession) => Promise<void>;
  warn: (event: { event: string; reason: string }) => void;
};

/** Mã lỗi Postgres; Drizzle bọc lỗi gốc trong `cause` nên đọc cả hai tầng. */
const codeOf = (error: unknown): string | undefined => {
  for (let current: unknown = error, depth = 0; current && depth < 3; depth += 1) {
    if (typeof current === 'object' && 'code' in current) {
      return String((current as { code: unknown }).code);
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
};

/**
 * Dịch vụ token System User Facebook (CHANNELS-SYSTEM-USER). Quyền do DB quyết định (hàm DEFINER, migration 0086): ở đây chỉ kiểm
 * đầu vào, xác minh với Meta, mã hóa và dịch mã lỗi. Không log token, nội dung lỗi hay tên Page (có thể chứa token). Workspace luôn từ
 * phiên của người gọi, không từ form.
 */
export function createFbSystemUserService(deps: FbSystemUserDeps) {
  /** Meta từ chối token đã lưu (hết hiệu lực/bị thu hồi): hạ xuống `invalid`. Không ném. */
  async function markRejected(session: FbSystemUserSession): Promise<void> {
    try {
      await deps.markInvalid(session);
    } catch (error) {
      deps.warn({ event: 'fb_system_mark_invalid_failed', reason: codeOf(error) ?? 'unknown' });
    }
  }

  return {
    async save(session: FbSystemUserSession, tokenInput: string): Promise<FbSystemUserSaveResult> {
      const token = parseFbSystemToken(tokenInput);
      if (!token) {
        // Chỉ ghi LOẠI lý do (rỗng / quá ngắn / quá dài / ký tự lạ), không bao giờ ghi giá trị đã dán.
        deps.warn({ event: 'fb_system_token_rejected', reason: diagnoseFbSystemToken(tokenInput) });
        return 'invalid';
      }
      if (!deps.encrypt) return 'not_configured';
      let verified: FbSystemUserVerifyResult;
      try {
        verified = await deps.verify(token);
      } catch (error) {
        deps.warn({ event: 'fb_system_verify_failed', reason: codeOf(error) ?? 'unknown' });
        return 'unreachable';
      }
      if (verified.status !== 'ok') return verified.status;
      try {
        await deps.save(session, deps.encrypt(token, { workspaceId: session.workspaceId }));
        return 'ok';
      } catch (error) {
        if (codeOf(error) === '42501') return 'forbidden';
        deps.warn({ event: 'fb_system_save_failed', reason: codeOf(error) ?? 'unknown' });
        return 'unavailable';
      }
    },

    /** Lấy token đã lưu (giải mã). Giải mã hỏng → đánh dấu `invalid` để giao diện báo dán lại. */
    async load(session: FbSystemUserSession): Promise<FbSystemUserLoadResult> {
      let sealed: FbSealed | null;
      try {
        sealed = await deps.readCipher(session);
      } catch (error) {
        deps.warn({ event: 'fb_system_read_failed', reason: codeOf(error) ?? 'unknown' });
        return { status: 'unusable' };
      }
      if (!sealed) return { status: 'none' };
      try {
        return { status: 'ok', token: deps.decrypt(sealed, { workspaceId: session.workspaceId }) };
      } catch {
        await markRejected(session);
        return { status: 'unusable' };
      }
    },

    markRejected,

    async disconnect(session: FbSystemUserSession): Promise<FbSystemUserDisconnectResult> {
      try {
        await deps.disconnect(session);
        return 'ok';
      } catch (error) {
        const code = codeOf(error);
        if (code === 'P0002') return 'not_found';
        if (code === '42501') return 'forbidden';
        deps.warn({ event: 'fb_system_disconnect_failed', reason: code ?? 'unknown' });
        return 'unavailable';
      }
    },
  };
}
