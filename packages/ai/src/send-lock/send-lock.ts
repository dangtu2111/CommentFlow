import { z } from 'zod';

/**
 * Admin tạm khóa gửi (ADMIN-SEND-LOCK, FR-116, US-084, `docs/09` §6.1 R3 + §11). Logic THUẦN:
 * quyền (chỉ quản trị nền tảng), kiểm lệnh khóa, tìm khóa còn hiệu lực cho một đích gửi, lời giải thích hiển thị.
 *
 * - Khóa theo workspace HOẶC theo Page `(platform, externalId)`. Khóa Page áp XUYÊN workspace: Owner nối lại cùng
 *   Page ở workspace khác vẫn bị khóa (gap `SEND-LOCK-CROSS-WORKSPACE`).
 * - Bắt buộc có thời hạn (≤ 30 ngày) và mã lý do; vẫn nhận/hiển thị bình luận, chỉ chặn GỬI.
 * - Thiên về chặn: danh sách khóa không đọc được → coi là đang khóa (`unreadable`).
 * Module KHÔNG có đường ra lệnh ẩn hay gửi (nguyên tắc #3).
 */

export const SEND_LOCK_SCOPES = ['workspace', 'channel'] as const;
export type SendLockScope = (typeof SEND_LOCK_SCOPES)[number];

/**
 * Vai trò quản trị nền tảng (`admin_role` ở DB, docs/13 §3.2). Vai trò workspace (Owner, nhân viên) KHÔNG nằm ở đây.
 * Khóa workspace: chỉ Super Admin; khóa theo kênh: Super Admin + Support; Finance không được.
 */
export const PLATFORM_ADMIN_ROLES = ['super', 'support', 'finance'] as const;
export type PlatformAdminRole = (typeof PLATFORM_ADMIN_ROLES)[number];
export const SEND_LOCK_ROLES: Readonly<Record<SendLockScope, readonly PlatformAdminRole[]>> =
  Object.freeze({ workspace: ['super'], channel: ['super', 'support'] });

/** Nền tảng có kênh (khớp `channels.platform`); giá trị lạ bị từ chối để khóa không "lặng lẽ vô hiệu". */
export const SEND_LOCK_PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const;

export const SEND_LOCK_REASON_CODES = [
  'abuse',
  'policy_violation',
  'meta_app_risk',
  'owner_request',
  'other',
] as const;
export type SendLockReasonCode = (typeof SEND_LOCK_REASON_CODES)[number];

export const SEND_LOCK_MAX_MS = 30 * 24 * 3_600_000;
export const SEND_LOCK_NOTE_MAX = 500;

const instant = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((v) => (v instanceof Date ? v : new Date(v)))
  .refine((d) => Number.isFinite(d.getTime()), 'Thời điểm không hợp lệ');

const channelRefSchema = z.object({
  platform: z.enum(SEND_LOCK_PLATFORMS),
  externalId: z.string().trim().min(1),
});

const actorSchema = z.object({ id: z.string().min(1), role: z.string() });
export type SendLockActor = z.input<typeof actorSchema>;

/** Actor đọc từ phiên; hỏng/thiếu/vai trò lạ → không phải Admin. */
export function isPlatformAdmin(actor: unknown): boolean {
  const parsed = actorSchema.safeParse(actor);
  return parsed.success && (PLATFORM_ADMIN_ROLES as readonly string[]).includes(parsed.data.role);
}

/** Quyền khóa/mở khóa theo phạm vi của khóa (docs/13 §3.2). */
export function canManageSendLock(actor: unknown, scope: SendLockScope): boolean {
  const parsed = actorSchema.safeParse(actor);
  return parsed.success && (SEND_LOCK_ROLES[scope] as readonly string[]).includes(parsed.data.role);
}

const note = z.string().trim().min(1).max(SEND_LOCK_NOTE_MAX);
const reasonCode = z.enum(SEND_LOCK_REASON_CODES);

const commandBase = {
  /** Workspace chịu khóa (khóa Page vẫn mang workspace Admin đang xem, để báo Owner). */
  workspaceId: z.string().min(1),
  reasonCode,
  note,
  until: instant,
};

const commandSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('workspace'), ...commandBase }).strict(),
  z.object({ scope: z.literal('channel'), channel: channelRefSchema, ...commandBase }).strict(),
]);

export type SendLockCommand =
  | {
      scope: 'workspace';
      workspaceId: string;
      reasonCode: SendLockReasonCode;
      note: string;
      until: Date;
    }
  | {
      scope: 'channel';
      workspaceId: string;
      channel: { platform: (typeof SEND_LOCK_PLATFORMS)[number]; externalId: string };
      reasonCode: SendLockReasonCode;
      note: string;
      until: Date;
    };

export type ParseLockCommandResult =
  | { ok: true; command: SendLockCommand }
  | { ok: false; code: 'invalid' };

/** Kiểm lệnh khóa: có thời hạn ở tương lai và ≤ 30 ngày. Không ném. */
export function parseSendLockCommand(raw: unknown, now: Date): ParseLockCommandResult {
  const parsed = commandSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'invalid' };
  const untilMs = parsed.data.until.getTime();
  if (untilMs <= now.getTime() || untilMs - now.getTime() > SEND_LOCK_MAX_MS)
    return { ok: false, code: 'invalid' };
  return { ok: true, command: parsed.data };
}

const lockSchema = z
  .object({
    id: z.string().min(1),
    scope: z.enum(SEND_LOCK_SCOPES),
    workspaceId: z.string().min(1),
    channel: channelRefSchema.nullable(),
    reasonCode,
    note: z.string(),
    lockedBy: z.string().min(1),
    lockedAt: instant,
    until: instant,
    liftedAt: instant.nullable(),
  })
  // Khóa Page mà thiếu Page (hoặc khóa workspace kèm Page) là dữ liệu hỏng → không đọc được → chặn.
  .refine((l) => (l.scope === 'channel') === (l.channel !== null), 'scope/channel không khớp');
export type SendLock = z.input<typeof lockSchema>;

export type SendLockTarget = { workspaceId: string; platform: string; externalId: string };

export type SendLockStatus =
  | { locked: false }
  | {
      locked: true;
      /** `null` khi danh sách khóa không đọc được. */
      lockId: string | null;
      scope: SendLockScope | null;
      reasonCode: SendLockReasonCode | null;
      note: string | null;
      until: Date | null;
      unreadable?: true;
    };

const UNREADABLE: SendLockStatus = Object.freeze({
  locked: true,
  lockId: null,
  scope: null,
  reasonCode: null,
  note: null,
  until: null,
  unreadable: true,
});

type ParsedLock = z.output<typeof lockSchema>;

function appliesTo(lock: ParsedLock, target: SendLockTarget): boolean {
  if (lock.scope === 'workspace') return lock.workspaceId === target.workspaceId;
  return (
    lock.channel !== null &&
    lock.channel.platform === target.platform &&
    lock.channel.externalId === target.externalId
  );
}

/**
 * Khóa còn hiệu lực cho đích gửi. Khóa workspace khớp `workspaceId`; khóa Page khớp `(platform, externalId)`
 * bất kể workspace. Nhiều khóa → báo khóa hết hạn muộn nhất. Hỏng bất kỳ mục nào → `unreadable` (chặn).
 */
export function findActiveSendLock(
  rawLocks: unknown,
  target: SendLockTarget,
  now: Date,
): SendLockStatus {
  const parsed = z.array(lockSchema).safeParse(rawLocks);
  if (!parsed.success) return UNREADABLE;
  let best: ParsedLock | null = null;
  for (const lock of parsed.data) {
    if (lock.liftedAt !== null || lock.until.getTime() <= now.getTime()) continue;
    if (!appliesTo(lock, target)) continue;
    if (best === null || lock.until.getTime() > best.until.getTime()) best = lock;
  }
  if (best === null) return { locked: false };
  return {
    locked: true,
    lockId: best.id,
    scope: best.scope,
    reasonCode: best.reasonCode,
    // Khóa Page đặt ở workspace khác: không lộ ghi chú của workspace đó.
    note: best.scope === 'channel' && best.workspaceId !== target.workspaceId ? '' : best.note,
    until: best.until,
  };
}

/** Dạng gọn cho đầu vào cổng tự gửi / `sendRecheck`. */
export function toGateSendLock(status: SendLockStatus): { locked: boolean; unreadable?: boolean } {
  if (!status.locked) return { locked: false };
  return status.unreadable === true ? { locked: true, unreadable: true } : { locked: true };
}

/** Lý do hiển thị cho Owner/nhân viên ("Không gửi vì…"); không lộ danh tính Admin. `null` khi không khóa. */
export function describeSendLock(status: SendLockStatus): string | null {
  if (!status.locked) return null;
  if (status.unreadable === true || status.note === null || status.until === null)
    return 'Gửi đang tạm khóa vì chưa xác nhận được trạng thái khóa. Bình luận vẫn được nhận.';
  const why = status.note === '' ? '' : `: ${status.note}`;
  return `Quản trị nền tảng đang tạm khóa gửi đến ${status.until.toISOString()}${why}. Bình luận vẫn được nhận.`;
}
