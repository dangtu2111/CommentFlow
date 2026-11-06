import { z } from 'zod';

/**
 * Lựa chọn thông báo + giờ yên lặng + quyết định giao (FR-084, Q-PE1). Logic thuần, chưa nối DB (gap PUSH-EMAIL-STORE).
 *
 * - Người dùng chọn theo sự kiện × kênh (đẩy PWA / email). Dữ liệu hỏng → mặc định an toàn, không ném.
 * - Giờ yên lặng theo múi giờ IANA, khung qua đêm. Sự kiện KHẨN (lỗi kênh/token, hạn mức) vượt giờ yên lặng.
 * - `digestMinutes` > 0: sự kiện thường được gom (`batch`), 0: gửi lẻ.
 */
export const NOTIFICATION_EVENTS = [
  'channel_error',
  'quota_warning',
  'needs_human',
  'pending_review',
  'auto_sent_summary',
  'weekly_report',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/** Sự kiện khẩn: bỏ qua giờ yên lặng và không gom. */
export const URGENT_EVENTS: ReadonlySet<NotificationEvent> = new Set([
  'channel_error',
  'quota_warning',
]);

export const NOTIFICATION_CHANNELS = ['push', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type EventChannels = Record<NotificationChannel, boolean>;
export type QuietHours = { enabled: boolean; start: string; end: string; timezone: string };
export type NotificationPrefs = {
  events: Record<NotificationEvent, EventChannels>;
  quietHours: QuietHours;
  /** 0 = gửi lẻ; còn lại là cửa sổ gom (phút). */
  digestMinutes: number;
};

export const DIGEST_MAX_MINUTES = 24 * 60;

const DEFAULT_EVENTS: Record<NotificationEvent, EventChannels> = {
  channel_error: { push: true, email: true },
  quota_warning: { push: true, email: true },
  needs_human: { push: true, email: false },
  pending_review: { push: false, email: false },
  auto_sent_summary: { push: false, email: false },
  weekly_report: { push: false, email: true },
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const channelsSchema = z.object({ push: z.boolean(), email: z.boolean() });
const quietSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(HHMM),
  end: z.string().regex(HHMM),
  timezone: z.string().refine(isValidTimezone),
});

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const OFF_QUIET: QuietHours = { enabled: false, start: '22:00', end: '07:00', timezone: 'UTC' };

export function defaultNotificationPrefs(): NotificationPrefs {
  const events = Object.fromEntries(
    NOTIFICATION_EVENTS.map((e) => [e, { ...DEFAULT_EVENTS[e] }]),
  ) as Record<NotificationEvent, EventChannels>;
  return { events, quietHours: { ...OFF_QUIET }, digestMinutes: 30 };
}

/** Chuẩn hóa dữ liệu lưu của người dùng; từng trường hỏng quay về mặc định (khung giờ hỏng → tắt). */
export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  const prefs = defaultNotificationPrefs();
  if (typeof raw !== 'object' || raw === null) return prefs;
  const input = raw as Record<string, unknown>;
  const events =
    typeof input.events === 'object' && input.events !== null
      ? (input.events as Record<string, unknown>)
      : {};
  for (const event of NOTIFICATION_EVENTS) {
    const parsed = channelsSchema.safeParse(events[event]);
    if (parsed.success) prefs.events[event] = parsed.data;
  }
  const quiet = quietSchema.safeParse(input.quietHours);
  if (quiet.success) prefs.quietHours = quiet.data;
  const digest = input.digestMinutes;
  if (
    typeof digest === 'number' &&
    Number.isInteger(digest) &&
    digest >= 0 &&
    digest <= DIGEST_MAX_MINUTES
  ) {
    prefs.digestMinutes = digest;
  }
  return prefs;
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function minutesOfDay(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** Bắt đầu tính, kết thúc không tính. `start === end` coi như không có khung. */
export function isInQuietHours(at: Date, quiet: QuietHours): boolean {
  if (!quiet.enabled || quiet.start === quiet.end) return false;
  const now = minutesOfDay(at, quiet.timezone);
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** Mốc (làm tròn phút) hết giờ yên lặng gần nhất; ngoài yên lặng → null. */
export function nextQuietEnd(at: Date, quiet: QuietHours): Date | null {
  if (!isInQuietHours(at, quiet)) return null;
  const minute = 60_000;
  let t = Math.floor(at.getTime() / minute) * minute;
  // Khung hợp lệ luôn kết thúc trong 24 giờ (start ≠ end) nên vòng lặp luôn dừng.
  do t += minute;
  while (isInQuietHours(new Date(t), quiet));
  return new Date(t);
}

export type DeliveryAction = 'send' | 'batch' | 'defer' | 'skip';
export type DeliveryDecision = {
  channel: NotificationChannel;
  action: DeliveryAction;
  until?: Date;
};

export function decideDelivery(input: {
  event: NotificationEvent;
  prefs: NotificationPrefs;
  now: Date;
}): DeliveryDecision[] {
  const { event, prefs, now } = input;
  const choice = prefs.events[event];
  const until = URGENT_EVENTS.has(event) ? null : nextQuietEnd(now, prefs.quietHours);
  return NOTIFICATION_CHANNELS.map((channel): DeliveryDecision => {
    if (!choice?.[channel]) return { channel, action: 'skip' };
    if (URGENT_EVENTS.has(event)) return { channel, action: 'send' };
    if (until) return { channel, action: 'defer', until };
    return { channel, action: prefs.digestMinutes > 0 ? 'batch' : 'send' };
  });
}
