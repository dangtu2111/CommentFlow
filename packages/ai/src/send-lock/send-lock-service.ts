import {
  canManageSendLock,
  findActiveSendLock,
  isPlatformAdmin,
  parseSendLockCommand,
  type SendLock,
  type SendLockActor,
  type SendLockScope,
  type SendLockStatus,
  type SendLockTarget,
} from './send-lock';

export type SendLockAuditEntry = {
  action: 'lock' | 'lift';
  actorId: string;
  workspaceId: string;
  lockId: string;
  scope: SendLockScope;
  channel: { platform: string; externalId: string } | null;
  reasonCode: string;
  until: Date;
  at: Date;
};

function auditDetail(lock: SendLock) {
  return {
    workspaceId: lock.workspaceId,
    lockId: lock.id,
    scope: lock.scope,
    channel: lock.channel ?? null,
    reasonCode: lock.reasonCode,
    until: new Date(lock.until),
  };
}

export type SendLockNotice = {
  kind: 'locked' | 'lifted';
  workspaceId: string;
  lockId: string;
};

/**
 * Nơi lưu khóa. Interface vì có 2 nơi dùng thật: bản bộ nhớ (test/fixture) và bản DB (bảng `send_locks`,
 * ghi chỉ vai trò Admin — cần migration làn b, gap `SEND-LOCK-WIRE`).
 */
export interface SendLockStore {
  insert(lock: SendLock): Promise<void>;
  get(id: string): Promise<SendLock | null>;
  /** Đặt `liftedAt`; trả hàng sau cập nhật, `null` nếu không có. */
  markLifted(id: string, at: Date): Promise<SendLock | null>;
  /** Mọi khóa có thể áp cho đích (workspace đó + Page đó ở mọi workspace); trả `unknown` để kiểm lại ở logic thuần. */
  listForTarget(target: SendLockTarget): Promise<unknown>;
}

/** Hiệu ứng phụ: nhật ký + báo Owner. Báo lỗi KHÔNG làm mất khóa. */
export interface SendLockEffects {
  audit(entry: SendLockAuditEntry): Promise<void>;
  notifyOwner(notice: SendLockNotice): Promise<void>;
}

export type LockResult =
  | { ok: true; lock: SendLock }
  | { ok: false; code: 'forbidden' | 'invalid' };
export type LiftResult =
  | { ok: true; lock: SendLock }
  | { ok: false; code: 'forbidden' | 'not_found' };

export type SendLockService = {
  lock(actor: unknown, rawCommand: unknown): Promise<LockResult>;
  lift(actor: unknown, lockId: string): Promise<LiftResult>;
  /** Trạng thái cho đích gửi; lỗi đọc → coi là khóa (không bao giờ mở khi không chắc). */
  statusFor(target: SendLockTarget): Promise<SendLockStatus>;
};

type Deps = {
  store: SendLockStore;
  effects: SendLockEffects;
  now: () => Date;
  newId: () => string;
};

export function createSendLockService(deps: Deps): SendLockService {
  const notifySafely = async (notice: SendLockNotice) => {
    try {
      await deps.effects.notifyOwner(notice);
    } catch {
      // Báo Owner lỗi không được làm hỏng/hoàn tác khóa; nơi nối thật dùng outbox để gửi lại.
    }
  };

  return {
    async lock(actor, rawCommand) {
      if (!isPlatformAdmin(actor)) return { ok: false, code: 'forbidden' };
      const now = deps.now();
      const parsed = parseSendLockCommand(rawCommand, now);
      if (!parsed.ok) return { ok: false, code: 'invalid' };
      const { command } = parsed;
      // Khóa workspace chỉ Super Admin; khóa theo kênh: Super Admin + Support (docs/13 §3.2).
      if (!canManageSendLock(actor, command.scope)) return { ok: false, code: 'forbidden' };
      const actorId = (actor as SendLockActor).id;
      const lock: SendLock = {
        id: deps.newId(),
        scope: command.scope,
        workspaceId: command.workspaceId,
        channel: command.scope === 'channel' ? command.channel : null,
        reasonCode: command.reasonCode,
        note: command.note,
        lockedBy: actorId,
        lockedAt: now,
        until: command.until,
        liftedAt: null,
      };
      await deps.store.insert(lock);
      await deps.effects.audit({
        action: 'lock',
        actorId,
        ...auditDetail(lock),
        at: now,
      });
      await notifySafely({ kind: 'locked', workspaceId: lock.workspaceId, lockId: lock.id });
      return { ok: true, lock };
    },

    async lift(actor, lockId) {
      if (!isPlatformAdmin(actor)) return { ok: false, code: 'forbidden' };
      const existing = await deps.store.get(lockId);
      if (existing === null) return { ok: false, code: 'not_found' };
      if (!canManageSendLock(actor, existing.scope)) return { ok: false, code: 'forbidden' };
      if ((existing.liftedAt ?? null) !== null) return { ok: true, lock: existing };
      const now = deps.now();
      const lifted = await deps.store.markLifted(lockId, now);
      if (lifted === null) return { ok: false, code: 'not_found' };
      await deps.effects.audit({
        action: 'lift',
        actorId: (actor as SendLockActor).id,
        ...auditDetail(lifted),
        at: now,
      });
      await notifySafely({ kind: 'lifted', workspaceId: lifted.workspaceId, lockId });
      return { ok: true, lock: lifted };
    },

    async statusFor(target) {
      let rows: unknown;
      try {
        rows = await deps.store.listForTarget(target);
      } catch {
        rows = null;
      }
      return findActiveSendLock(rows, target, deps.now());
    },
  };
}

export type InMemorySendLock = {
  service: SendLockService;
  store: SendLockStore;
  audit: SendLockAuditEntry[];
  notices: SendLockNotice[];
  failReads(on: boolean): void;
  failNotify(on: boolean): void;
};

/** Bản bộ nhớ cho test/fixture (chưa có DB). */
export function createInMemorySendLock(opts: {
  now: () => Date;
  newId: () => string;
}): InMemorySendLock {
  const rows = new Map<string, SendLock>();
  const audit: SendLockAuditEntry[] = [];
  const notices: SendLockNotice[] = [];
  let readsFail = false;
  let notifyFails = false;

  const store: SendLockStore = {
    async insert(lock) {
      rows.set(lock.id, lock);
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async markLifted(id, at) {
      const row = rows.get(id);
      if (row === undefined) return null;
      const next = { ...row, liftedAt: at };
      rows.set(id, next);
      return next;
    },
    async listForTarget() {
      if (readsFail) throw new Error('store read failed');
      return [...rows.values()];
    },
  };
  const effects: SendLockEffects = {
    async audit(entry) {
      audit.push(entry);
    },
    async notifyOwner(notice) {
      if (notifyFails) throw new Error('notify failed');
      notices.push(notice);
    },
  };

  return {
    service: createSendLockService({ store, effects, ...opts }),
    store,
    audit,
    notices,
    failReads: (on) => {
      readsFail = on;
    },
    failNotify: (on) => {
      notifyFails = on;
    },
  };
}
