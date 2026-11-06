import { z } from 'zod';

/**
 * "Xem như khách" cho quản trị nền tảng (ADMIN-IMPERSONATE, FR-105, US-082, `docs/09` §admin-kit).
 * Logic THUẦN, không DB: quyền, kiểm lệnh bắt đầu (lý do bắt buộc), trạng thái phiên (≤ 30 phút), guard chỉ-đọc.
 *
 * - Chỉ Super Admin và Support; Finance không được. Vai trò workspace (Owner/nhân viên) không bao giờ đủ quyền.
 * - Lý do bắt buộc (10–500 ký tự sau khi cắt khoảng trắng); phiên gắn đúng MỘT admin + MỘT workspace.
 * - Chỉ cho phương thức an toàn (GET/HEAD). Mọi thứ khác — kể cả phương thức lạ — bị chặn.
 * - Thiên về chặn: dữ liệu phiên hỏng, hạn > 30 phút (bị sửa), sai admin/workspace → không cho.
 */

export const IMPERSONATION_ROLES = ['super', 'support'] as const;
export const IMPERSONATION_MAX_MS = 30 * 60_000;
export const IMPERSONATION_REASON_MIN = 10;
export const IMPERSONATION_REASON_MAX = 500;
const SAFE_METHODS: readonly string[] = ['GET', 'HEAD'];

const actorSchema = z.object({ id: z.string().min(1), role: z.string() });
export type ImpersonationActor = z.input<typeof actorSchema>;

const sessionSchema = z.object({
  id: z.string().min(1),
  adminId: z.string().min(1),
  workspaceId: z.string().min(1),
  reason: z.string(),
  startedAt: z.date(),
  expiresAt: z.date(),
  endedAt: z.date().nullable(),
});
export type ImpersonationSession = z.infer<typeof sessionSchema>;

export function canImpersonate(actor: unknown): boolean {
  const p = actorSchema.safeParse(actor);
  return p.success && (IMPERSONATION_ROLES as readonly string[]).includes(p.data.role);
}

export type StartErrorCode = 'forbidden' | 'invalid_target' | 'reason_required' | 'invalid_ttl';
export type StartResult =
  | {
      ok: true;
      value: {
        adminId: string;
        workspaceId: string;
        reason: string;
        startedAt: Date;
        expiresAt: Date;
      };
    }
  | { ok: false; code: StartErrorCode };

const fail = (code: StartErrorCode): StartResult => ({ ok: false, code });

export function parseStartImpersonation(input: {
  actor: unknown;
  workspaceId: unknown;
  reason: unknown;
  now: Date;
  ttlMs?: number;
}): StartResult {
  const actor = actorSchema.safeParse(input.actor);
  if (!actor.success || !canImpersonate(actor.data)) return fail('forbidden');
  const ws = z.uuid().safeParse(input.workspaceId);
  if (!ws.success) return fail('invalid_target');
  const reason = z
    .string()
    .trim()
    .min(IMPERSONATION_REASON_MIN)
    .max(IMPERSONATION_REASON_MAX)
    .safeParse(input.reason);
  if (!reason.success) return fail('reason_required');
  const ttl = input.ttlMs ?? IMPERSONATION_MAX_MS;
  if (!Number.isFinite(ttl) || ttl <= 0) return fail('invalid_ttl');
  if (!Number.isFinite(input.now.getTime())) return fail('invalid_ttl');
  return {
    ok: true,
    value: {
      adminId: actor.data.id,
      workspaceId: ws.data,
      reason: reason.data,
      startedAt: input.now,
      expiresAt: new Date(input.now.getTime() + Math.min(ttl, IMPERSONATION_MAX_MS)),
    },
  };
}

export type SessionState = 'active' | 'expired' | 'ended' | 'invalid';

export function sessionState(session: unknown, now: Date): SessionState {
  const p = sessionSchema.safeParse(session);
  const t = now.getTime();
  if (!p.success || !Number.isFinite(t)) return 'invalid';
  const { startedAt, expiresAt, endedAt } = p.data;
  const span = expiresAt.getTime() - startedAt.getTime();
  if (!Number.isFinite(span) || span <= 0 || span > IMPERSONATION_MAX_MS) return 'invalid';
  if (t < startedAt.getTime()) return 'invalid';
  if (endedAt) return 'ended';
  return t >= expiresAt.getTime() ? 'expired' : 'active';
}

export type DenyCode =
  | 'no_session'
  | 'invalid'
  | 'expired'
  | 'ended'
  | 'wrong_admin'
  | 'forbidden'
  | 'wrong_workspace'
  | 'read_only';
export type Authorization = { allow: true } | { allow: false; code: DenyCode };

/** Guard cho mọi request đi qua phiên "xem như khách". Đặt ở middleware, trước handler. */
export function authorizeImpersonatedRequest(input: {
  session: unknown;
  adminId: string;
  workspaceId: string;
  method: string;
  now: Date;
}): Authorization {
  if (input.session === null || input.session === undefined) {
    return { allow: false, code: 'no_session' };
  }
  const state = sessionState(input.session, input.now);
  if (state !== 'active') return { allow: false, code: state };
  const s = input.session as ImpersonationSession;
  if (s.adminId !== input.adminId) return { allow: false, code: 'wrong_admin' };
  if (s.workspaceId !== input.workspaceId) return { allow: false, code: 'wrong_workspace' };
  if (!SAFE_METHODS.includes(String(input.method).toUpperCase())) {
    return { allow: false, code: 'read_only' };
  }
  return { allow: true };
}
