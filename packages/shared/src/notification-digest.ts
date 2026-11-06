import {
  NOTIFICATION_EVENTS,
  type NotificationChannel,
  type NotificationEvent,
} from './notification-prefs';

/**
 * Gom thông báo + dựng nội dung (FR-084, Q-PE1). Thuần, không I/O.
 *
 * PII (nguyên tắc #6): nội dung chỉ gồm nhãn chung theo loại sự kiện + số lượng; KHÔNG bao giờ chứa văn bản bình
 * luận/tin nhắn, tên, SĐT, email của khách. Người nhận mở ứng dụng để xem chi tiết (sau đăng nhập).
 */
export const DIGEST_MAX_ITEMS = 100;

export type PendingNotification = {
  userId: string;
  workspaceId: string;
  channel: NotificationChannel;
  event: NotificationEvent;
  count: number;
  createdAt: Date;
};

export type DigestGroup = {
  workspaceId: string;
  userId: string;
  channel: NotificationChannel;
  items: PendingNotification[];
};

export type NotificationLang = 'vi' | 'en';
export type NotificationMessage = { title: string; body: string };
export type DigestMessage = NotificationMessage & {
  kind: 'single' | 'digest';
  totals: Partial<Record<NotificationEvent, number>>;
};

export class NotificationError extends Error {
  constructor(readonly code: 'NOTIFICATION_DIGEST_EMPTY' | 'NOTIFICATION_CONFIG_INVALID') {
    super(code);
    this.name = 'NotificationError';
  }
}

const LABELS: Record<NotificationLang, Record<NotificationEvent, string>> = {
  vi: {
    channel_error: 'cảnh báo kênh',
    quota_warning: 'cảnh báo hạn mức',
    needs_human: 'mục cần người xử lý',
    pending_review: 'bản nháp chờ duyệt',
    auto_sent_summary: 'phản hồi đã tự gửi',
    weekly_report: 'báo cáo tuần',
  },
  en: {
    channel_error: 'channel alerts',
    quota_warning: 'quota alerts',
    needs_human: 'items needing a person',
    pending_review: 'drafts awaiting review',
    auto_sent_summary: 'auto-sent replies',
    weekly_report: 'weekly reports',
  },
};
const TITLES: Record<NotificationLang, { single: string; digest: string }> = {
  vi: { single: 'Thông báo mới', digest: 'Tóm tắt thông báo' },
  en: { single: 'New notification', digest: 'Notification summary' },
};

const safeCount = (n: number) =>
  Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 1_000_000) : 1;

export function buildSingleMessage(
  event: NotificationEvent,
  count: number,
  lang: NotificationLang,
): NotificationMessage {
  const l: NotificationLang = lang === 'en' ? 'en' : 'vi'; // giá trị lạ từ DB → tiếng Việt
  return { title: TITLES[l].single, body: `${safeCount(count)} ${LABELS[l][event]}` };
}

/** Gom theo (workspace, người dùng, kênh); mỗi nhóm ≤ `DIGEST_MAX_ITEMS` mục (dư tách nhóm kế). */
export function planDigests(items: readonly PendingNotification[]): DigestGroup[] {
  const groups = new Map<string, DigestGroup>();
  const out: DigestGroup[] = [];
  for (const it of items) {
    const key = JSON.stringify([it.workspaceId, it.userId, it.channel]);
    let group = groups.get(key);
    if (!group || group.items.length >= DIGEST_MAX_ITEMS) {
      group = { workspaceId: it.workspaceId, userId: it.userId, channel: it.channel, items: [] };
      groups.set(key, group);
      out.push(group);
    }
    group.items.push(it);
  }
  return out;
}

export function buildDigest(
  items: readonly PendingNotification[],
  lang: NotificationLang,
): DigestMessage {
  if (items.length === 0) throw new NotificationError('NOTIFICATION_DIGEST_EMPTY');
  const totals: Partial<Record<NotificationEvent, number>> = {};
  for (const it of items) totals[it.event] = (totals[it.event] ?? 0) + safeCount(it.count);
  const present = NOTIFICATION_EVENTS.filter((e) => totals[e] !== undefined);
  const [only] = present;
  if (present.length === 1 && items.length === 1 && only) {
    return { kind: 'single', totals, ...buildSingleMessage(only, totals[only] ?? 1, lang) };
  }
  const body = present.map((e) => `${totals[e]} ${LABELS[lang][e]}`).join(', ');
  return { kind: 'digest', totals, title: TITLES[lang].digest, body };
}
