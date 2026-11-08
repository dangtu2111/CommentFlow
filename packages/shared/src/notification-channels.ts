import {
  buildSingleMessage,
  NotificationError,
  type NotificationLang,
  type NotificationMessage,
} from './notification-digest';
import {
  decideDelivery,
  type NotificationChannel,
  type NotificationEvent,
  type NotificationPrefs,
} from './notification-prefs';
import { assertMockAllowed } from './test-process';

/**
 * Nhà cung cấp thông báo sau interface + bản giả (FR-084, Q-PE1, Xong-mock). Chưa gọi dịch vụ thật.
 *
 * - `PushProvider` theo giao thức Web Push chính thức (RFC 8030 gửi, RFC 8292 VAPID, RFC 8291 mã hóa nội dung): máy
 *   chủ đẩy trả 404/410 = đăng ký đã hết hạn → bản thật phải map sang `'gone'` để dispatcher báo xóa đăng ký.
 * - `EmailProvider` bọc `MailTransport` SMTP của saas-core khi nối thật.
 * - Cờ `PUSH_EMAIL_ENABLED` mặc định TẮT: tắt → dispatcher không gọi nhà cung cấp nào.
 * - Kết quả/lỗi KHÔNG chứa địa chỉ email, endpoint hay khóa (nguyên tắc #6).
 */
export type PushSubscriptionRef = { id: string; endpoint: string };
export type PushOutcome = 'delivered' | 'gone';

export interface PushProvider {
  send(subscription: PushSubscriptionRef, message: NotificationMessage): Promise<PushOutcome>;
}
export interface EmailProvider {
  send(mail: { to: string; subject: string; text: string; lang: NotificationLang }): Promise<void>;
}

export type MockPushProvider = PushProvider & {
  sent: { subscription: PushSubscriptionRef; message: NotificationMessage }[];
};
export type MockEmailProvider = EmailProvider & {
  sent: { to: string; subject: string; text: string; lang: NotificationLang }[];
};

/** `outcomes`: kết quả giả theo id đăng ký (mặc định `delivered`). */
export function createMockPushProvider(
  outcomes: Record<string, PushOutcome> = {},
): MockPushProvider {
  // Bản giả CHỈ cho test tự động/EVAL tự khai báo; tiến trình web/worker nạp → lỗi ngay (chủ dự án chốt 08/11: không mock khi chạy).
  assertMockAllowed('createMockPushProvider');
  const sent: MockPushProvider['sent'] = [];
  return {
    sent,
    async send(subscription, message) {
      const outcome = outcomes[subscription.id] ?? 'delivered';
      if (outcome === 'delivered') sent.push({ subscription, message });
      return outcome;
    },
  };
}

export function createMockEmailProvider(): MockEmailProvider {
  // Bản giả CHỈ cho test tự động/EVAL tự khai báo; tiến trình web/worker nạp → lỗi ngay (chủ dự án chốt 08/11: không mock khi chạy).
  assertMockAllowed('createMockEmailProvider');
  const sent: MockEmailProvider['sent'] = [];
  return {
    sent,
    async send(mail) {
      sent.push(mail);
    },
  };
}

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };
export type NotificationConfig = { enabled: boolean; vapid: VapidConfig | null };

/** `PUSH_EMAIL_ENABLED` (mặc định TẮT) + `WEB_PUSH_VAPID_PUBLIC_KEY`/`_PRIVATE_KEY`/`WEB_PUSH_SUBJECT` (cả bộ hoặc không). */
export function readNotificationConfig(
  env: Record<string, string | undefined>,
): NotificationConfig {
  const invalid = () => new NotificationError('NOTIFICATION_CONFIG_INVALID');
  const flag = env.PUSH_EMAIL_ENABLED?.trim().toLowerCase() ?? '';
  if (!['', 'true', 'false'].includes(flag)) throw invalid();
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? '';
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? '';
  const subject = env.WEB_PUSH_SUBJECT?.trim() ?? '';
  const given = [publicKey, privateKey].filter(Boolean).length;
  if (given === 1) throw invalid();
  if (given === 0) return { enabled: flag === 'true', vapid: null };
  if (!/^(mailto:|https:\/\/)\S+$/.test(subject)) throw invalid();
  return { enabled: flag === 'true', vapid: { publicKey, privateKey, subject } };
}

export type DeliveryTarget = {
  userId: string;
  workspaceId: string;
  lang: NotificationLang;
  email: string | null;
  pushSubscriptions: PushSubscriptionRef[];
};

export type ChannelResult = {
  channel: NotificationChannel;
  status: 'sent' | 'sent_none' | 'queued' | 'deferred' | 'skipped' | 'no_target' | 'failed';
  until?: Date;
  errorCode?: 'NOTIFICATION_PROVIDER_FAILED';
};
export type DeliverResult = { results: ChannelResult[]; expiredSubscriptionIds: string[] };

export type NotificationDispatcher = {
  deliver(input: {
    event: NotificationEvent;
    count: number;
    prefs: NotificationPrefs;
    target: DeliveryTarget;
    now: Date;
  }): Promise<DeliverResult>;
};

export function createNotificationDispatcher(deps: {
  enabled: boolean;
  push: PushProvider;
  email: EmailProvider;
}): NotificationDispatcher {
  return {
    async deliver({ event, count, prefs, target, now }) {
      const out: DeliverResult = { results: [], expiredSubscriptionIds: [] };
      if (!deps.enabled) return out;
      const message = buildSingleMessage(event, count, target.lang);
      for (const decision of decideDelivery({ event, prefs, now })) {
        const { channel } = decision;
        if (decision.action === 'skip') continue;
        if (decision.action === 'defer') {
          out.results.push({
            channel,
            status: 'deferred',
            ...(decision.until ? { until: decision.until } : {}),
          });
          continue;
        }
        if (decision.action === 'batch') {
          out.results.push({ channel, status: 'queued' });
          continue;
        }
        out.results.push(await sendOne(deps, channel, message, target, out));
      }
      return out;
    },
  };
}

async function sendOne(
  deps: { push: PushProvider; email: EmailProvider },
  channel: NotificationChannel,
  message: NotificationMessage,
  target: DeliveryTarget,
  out: DeliverResult,
): Promise<ChannelResult> {
  try {
    if (channel === 'email') {
      if (!target.email) return { channel, status: 'no_target' };
      await deps.email.send({
        to: target.email,
        subject: message.title,
        text: message.body,
        lang: target.lang,
      });
      return { channel, status: 'sent' };
    }
    if (target.pushSubscriptions.length === 0) return { channel, status: 'no_target' };
    let delivered = 0;
    let failed = 0;
    for (const sub of target.pushSubscriptions) {
      try {
        if ((await deps.push.send(sub, message)) === 'delivered') delivered += 1;
        else out.expiredSubscriptionIds.push(sub.id);
      } catch {
        failed += 1; // một đăng ký lỗi không chặn các thiết bị khác
      }
    }
    if (delivered > 0) return { channel, status: 'sent' };
    if (failed > 0) return { channel, status: 'failed', errorCode: 'NOTIFICATION_PROVIDER_FAILED' };
    return { channel, status: 'sent_none' };
  } catch {
    return { channel, status: 'failed', errorCode: 'NOTIFICATION_PROVIDER_FAILED' };
  }
}
