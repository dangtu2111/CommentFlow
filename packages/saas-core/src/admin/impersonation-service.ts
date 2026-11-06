import { z } from 'zod';
import {
  authorizeImpersonatedRequest,
  canImpersonate,
  type DenyCode,
  type ImpersonationActor,
  type ImpersonationSession,
  parseStartImpersonation,
  type StartErrorCode,
} from './impersonation';

/**
 * Một dòng nhật ký kiểm toán của phiên "xem như khách". Khi nối DB sẽ ghi `action_logs`
 * (`actor_type='admin'`, `impersonation_id=sessionId`) — cần đường INSERT cho Admin (migration làn b,
 * gap `ADMIN-IMPERSONATE-WIRE`). KHÔNG chứa query string, email, token.
 */
export type ImpersonationAuditEntry = {
  event: 'start' | 'access' | 'blocked' | 'end';
  sessionId: string;
  adminId: string;
  workspaceId: string;
  at: Date;
  /** Chỉ ở `start`. */
  reason?: string;
  method?: string;
  path?: string;
  /** Chỉ ở `blocked`. */
  code?: AccessDenyCode;
};

export interface ImpersonationStore {
  insert(session: ImpersonationSession): Promise<void>;
  get(id: string): Promise<ImpersonationSession | null>;
  markEnded(id: string, at: Date): Promise<void>;
}

export interface ImpersonationAudit {
  write(entry: ImpersonationAuditEntry): Promise<void>;
}

export type ImpersonationStartResult =
  | { ok: true; session: ImpersonationSession }
  | { ok: false; code: StartErrorCode | 'audit_failed' | 'store_failed' };
export type AccessDenyCode = DenyCode | 'audit_failed' | 'store_failed';
export type ImpersonationAccessResult = { allow: true } | { allow: false; code: AccessDenyCode };
export type ImpersonationEndResult =
  | { ok: true }
  | { ok: false; code: 'no_session' | 'wrong_admin' | 'audit_failed' | 'store_failed' };

const PATH_MAX = 200;
/** Bỏ query/fragment, che đoạn có `@` (email) và dãy ≥ 6 chữ số (SĐT/mã) trong đường dẫn; cắt độ dài. */
export function sanitizePath(path: string): string {
  const bare = String(path).split(/[?#]/)[0] ?? '';
  return bare
    .split('/')
    .map((seg) => (seg.includes('@') ? '[email]' : seg.replace(/\d{6,}/g, '[số]')))
    .join('/')
    .slice(0, PATH_MAX);
}

export function createImpersonationService(deps: {
  store: ImpersonationStore;
  audit: ImpersonationAudit;
  now: () => Date;
  newId: () => string;
}) {
  const tryAudit = async (entry: ImpersonationAuditEntry): Promise<boolean> => {
    try {
      await deps.audit.write(entry);
      return true;
    } catch {
      return false;
    }
  };

  return {
    /** Nhật ký "start" ghi TRƯỚC khi tạo phiên: không ghi được thì không có phiên. */
    async start(input: {
      actor: ImpersonationActor;
      workspaceId: unknown;
      reason: unknown;
      ttlMs?: number;
    }): Promise<ImpersonationStartResult> {
      const parsed = parseStartImpersonation({ ...input, now: deps.now() });
      if (!parsed.ok) return parsed;
      const session: ImpersonationSession = { id: deps.newId(), endedAt: null, ...parsed.value };
      const logged = await tryAudit({
        event: 'start',
        sessionId: session.id,
        adminId: session.adminId,
        workspaceId: session.workspaceId,
        at: session.startedAt,
        reason: session.reason,
      });
      if (!logged) return { ok: false, code: 'audit_failed' };
      try {
        await deps.store.insert(session);
      } catch {
        return { ok: false, code: 'store_failed' };
      }
      return { ok: true, session };
    },

    /** Mọi lần dùng đều ghi nhật ký (cho và chặn). Không ghi được nhật ký "cho" → không cho. */
    async access(input: {
      sessionId: string;
      /** Actor lấy từ phiên đăng nhập Ở SERVER (không từ body/header); vai trò được kiểm lại mỗi request. */
      actor: ImpersonationActor;
      workspaceId: string;
      method: string;
      path: string;
    }): Promise<ImpersonationAccessResult> {
      const now = deps.now();
      if (!z.uuid().safeParse(input.workspaceId).success) {
        return { allow: false, code: 'wrong_workspace' };
      }
      const base = {
        sessionId: input.sessionId,
        adminId: input.actor.id,
        workspaceId: input.workspaceId,
        at: now,
        method: String(input.method).toUpperCase().slice(0, 16),
        path: sanitizePath(input.path),
      };
      const deny = async (code: AccessDenyCode): Promise<ImpersonationAccessResult> => {
        await tryAudit({ event: 'blocked', code, ...base });
        return { allow: false, code };
      };
      let session: ImpersonationSession | null;
      try {
        session = await deps.store.get(input.sessionId);
      } catch {
        return deny('store_failed');
      }
      if (!canImpersonate(input.actor)) return deny('forbidden');
      const verdict = authorizeImpersonatedRequest({
        session,
        adminId: input.actor.id,
        workspaceId: input.workspaceId,
        method: input.method,
        now,
      });
      if (!verdict.allow) return deny(verdict.code);
      return (await tryAudit({ event: 'access', ...base }))
        ? verdict
        : { allow: false, code: 'audit_failed' };
    },

    async end(input: { sessionId: string; adminId: string }): Promise<ImpersonationEndResult> {
      let session: ImpersonationSession | null;
      try {
        session = await deps.store.get(input.sessionId);
      } catch {
        return { ok: false, code: 'store_failed' };
      }
      if (!session) return { ok: false, code: 'no_session' };
      if (session.adminId !== input.adminId) return { ok: false, code: 'wrong_admin' };
      const at = deps.now();
      try {
        await deps.store.markEnded(session.id, at);
      } catch {
        return { ok: false, code: 'store_failed' };
      }
      const logged = await tryAudit({
        event: 'end',
        sessionId: session.id,
        adminId: session.adminId,
        workspaceId: session.workspaceId,
        at,
      });
      return logged ? { ok: true } : { ok: false, code: 'audit_failed' };
    },
  };
}
export type ImpersonationService = ReturnType<typeof createImpersonationService>;

/** Bản bộ nhớ cho test/fixture; bản DB chờ bảng `admin_impersonations` (migration làn b). */
export function createInMemoryImpersonation() {
  const sessions = new Map<string, ImpersonationSession>();
  const entries: ImpersonationAuditEntry[] = [];
  const store: ImpersonationStore = {
    async insert(s) {
      sessions.set(s.id, s);
    },
    async get(id) {
      return sessions.get(id) ?? null;
    },
    async markEnded(id, at) {
      const s = sessions.get(id);
      if (s && !s.endedAt) sessions.set(id, { ...s, endedAt: at });
    },
  };
  return { store, sessions, entries };
}
