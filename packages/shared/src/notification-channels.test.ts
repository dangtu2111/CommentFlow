import { describe, expect, it } from 'vitest';
import {
  createMockEmailProvider,
  createMockPushProvider,
  createNotificationDispatcher,
  type EmailProvider,
  type PushProvider,
  readNotificationConfig,
} from './notification-channels';
import { parseNotificationPrefs } from './notification-prefs';

const fakeKey = (tag: string) => ['k', tag].join('-');
const target = {
  userId: 'u1',
  workspaceId: 'w1',
  lang: 'vi' as const,
  email: 'a@b.vn',
  pushSubscriptions: [{ id: 's1', endpoint: 'https://push.test/s1' }],
};
const noon = new Date('2026-11-06T05:00:00Z');
const prefs = parseNotificationPrefs({
  events: { channel_error: { push: true, email: true }, needs_human: { push: true, email: false } },
  digestMinutes: 0,
});

describe('FR-084 cấu hình', () => {
  it('mặc định TẮT; bật cần đủ khóa VAPID khi dùng push thật', () => {
    expect(readNotificationConfig({}).enabled).toBe(false);
    expect(readNotificationConfig({ PUSH_EMAIL_ENABLED: 'true' }).enabled).toBe(true);
  });
  it('giá trị cờ lạ → lỗi có mã', () => {
    expect(() => readNotificationConfig({ PUSH_EMAIL_ENABLED: 'yes' })).toThrow(
      'NOTIFICATION_CONFIG_INVALID',
    );
  });
  it('khóa VAPID một nửa → lỗi; đủ cặp → có cấu hình push thật', () => {
    expect(() => readNotificationConfig({ WEB_PUSH_VAPID_PUBLIC_KEY: fakeKey('p') })).toThrow(
      'NOTIFICATION_CONFIG_INVALID',
    );
    const c = readNotificationConfig({
      WEB_PUSH_VAPID_PUBLIC_KEY: fakeKey('p'),
      WEB_PUSH_VAPID_PRIVATE_KEY: fakeKey('s'),
      WEB_PUSH_SUBJECT: 'mailto:ops@example.test',
    });
    expect(c.vapid).toEqual({
      publicKey: fakeKey('p'),
      privateKey: fakeKey('s'),
      subject: 'mailto:ops@example.test',
    });
  });
  it('VAPID subject phải là mailto:/https:', () => {
    expect(() =>
      readNotificationConfig({
        WEB_PUSH_VAPID_PUBLIC_KEY: fakeKey('p'),
        WEB_PUSH_VAPID_PRIVATE_KEY: fakeKey('s'),
        WEB_PUSH_SUBJECT: 'ftp://x',
      }),
    ).toThrow('NOTIFICATION_CONFIG_INVALID');
  });
});

describe('FR-084 dispatcher', () => {
  it('cờ TẮT → không gọi nhà cung cấp', async () => {
    const push = createMockPushProvider();
    const email = createMockEmailProvider();
    const d = createNotificationDispatcher({ enabled: false, push, email });
    const r = await d.deliver({ event: 'channel_error', count: 1, prefs, target, now: noon });
    expect(r.results).toEqual([]);
    expect(push.sent).toHaveLength(0);
    expect(email.sent).toHaveLength(0);
  });
  it('sự kiện khẩn đi cả hai kênh; email không chứa PII khách', async () => {
    const push = createMockPushProvider();
    const email = createMockEmailProvider();
    const d = createNotificationDispatcher({ enabled: true, push, email });
    const r = await d.deliver({ event: 'channel_error', count: 2, prefs, target, now: noon });
    expect(r.results.map((x) => [x.channel, x.status])).toEqual([
      ['push', 'sent'],
      ['email', 'sent'],
    ]);
    expect(push.sent[0]?.message.body).toContain('2');
    expect(email.sent[0]?.to).toBe('a@b.vn');
  });
  it('push "gone" → báo đăng ký hết hạn để xóa, không coi là lỗi', async () => {
    const push = createMockPushProvider({ s1: 'gone' });
    const d = createNotificationDispatcher({
      enabled: true,
      push,
      email: createMockEmailProvider(),
    });
    const r = await d.deliver({ event: 'needs_human', count: 1, prefs, target, now: noon });
    expect(r.expiredSubscriptionIds).toEqual(['s1']);
    expect(r.results[0]?.status).toBe('sent_none');
  });
  it('lỗi một kênh không làm hỏng kênh kia và không bị nuốt', async () => {
    const failing: EmailProvider = {
      async send() {
        throw new Error('smtp down');
      },
    };
    const push = createMockPushProvider();
    const d = createNotificationDispatcher({ enabled: true, push, email: failing });
    const r = await d.deliver({ event: 'channel_error', count: 1, prefs, target, now: noon });
    expect(r.results.find((x) => x.channel === 'push')?.status).toBe('sent');
    const mail = r.results.find((x) => x.channel === 'email');
    expect(mail).toMatchObject({ status: 'failed', errorCode: 'NOTIFICATION_PROVIDER_FAILED' });
    expect(JSON.stringify(r)).not.toContain('a@b.vn');
  });
  it('trong giờ yên lặng: sự kiện thường trả `deferred` kèm mốc, không gửi', async () => {
    const push = createMockPushProvider();
    const quietPrefs = parseNotificationPrefs({
      events: { needs_human: { push: true, email: false } },
      quietHours: { enabled: true, start: '22:00', end: '07:00', timezone: 'Asia/Ho_Chi_Minh' },
      digestMinutes: 0,
    });
    const d = createNotificationDispatcher({
      enabled: true,
      push,
      email: createMockEmailProvider(),
    });
    const r = await d.deliver({
      event: 'needs_human',
      count: 1,
      prefs: quietPrefs,
      target,
      now: new Date('2026-11-06T16:00:00Z'),
    });
    expect(r.results[0]).toMatchObject({ channel: 'push', status: 'deferred' });
    expect(r.results[0]?.until?.toISOString()).toBe('2026-11-07T00:00:00.000Z');
    expect(push.sent).toHaveLength(0);
  });
  it('batch → trả `queued` cho kho gom, không gửi', async () => {
    const push = createMockPushProvider();
    const p = parseNotificationPrefs({
      events: { needs_human: { push: true, email: false } },
      digestMinutes: 15,
    });
    const d = createNotificationDispatcher({
      enabled: true,
      push,
      email: createMockEmailProvider(),
    });
    const r = await d.deliver({ event: 'needs_human', count: 1, prefs: p, target, now: noon });
    expect(r.results[0]).toMatchObject({ channel: 'push', status: 'queued' });
    expect(push.sent).toHaveLength(0);
  });
  it('thiếu địa chỉ/đăng ký → bỏ qua kênh đó (`no_target`)', async () => {
    const d = createNotificationDispatcher({
      enabled: true,
      push: createMockPushProvider(),
      email: createMockEmailProvider(),
    });
    const r = await d.deliver({
      event: 'channel_error',
      count: 1,
      prefs,
      target: { ...target, email: null, pushSubscriptions: [] },
      now: noon,
    });
    expect(r.results.map((x) => x.status)).toEqual(['no_target', 'no_target']);
  });
  it('một đăng ký push lỗi không chặn thiết bị khác; chỉ failed khi tất cả lỗi', async () => {
    const flaky: PushProvider = {
      async send(sub) {
        if (sub.id === 'bad') throw new Error('x');
        return 'delivered';
      },
    };
    const bad1 = { id: 'bad', endpoint: 'https://p.test/b' };
    const d = createNotificationDispatcher({
      enabled: true,
      push: flaky,
      email: createMockEmailProvider(),
    });
    const two = { ...target, pushSubscriptions: [bad1, ...target.pushSubscriptions] };
    const ok = await d.deliver({ event: 'needs_human', count: 1, prefs, target: two, now: noon });
    expect(ok.results[0]?.status).toBe('sent');
    const only = { ...target, pushSubscriptions: [bad1] };
    const bad = await d.deliver({ event: 'needs_human', count: 1, prefs, target: only, now: noon });
    expect(bad.results[0]).toMatchObject({
      status: 'failed',
      errorCode: 'NOTIFICATION_PROVIDER_FAILED',
    });
  });
  it('lang lạ từ DB → tiếng Việt, không ném', async () => {
    const push = createMockPushProvider();
    const d = createNotificationDispatcher({
      enabled: true,
      push,
      email: createMockEmailProvider(),
    });
    const weird = { ...target, lang: 'xx' as never };
    await d.deliver({ event: 'needs_human', count: 1, prefs, target: weird, now: noon });
    expect(push.sent[0]?.message.title).toBe('Thông báo mới');
  });
  it('mock PushProvider có kiểu hợp đồng', () => {
    const p: PushProvider = createMockPushProvider();
    expect(typeof p.send).toBe('function');
  });
});
