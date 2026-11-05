import { type ChannelRef, createFacebookConnector, PlatformError } from '@flow/connectors';

/**
 * Đăng ký webhook `feed` cho ĐÚNG Page vừa chọn rồi đọc lại để xác nhận (WEBHOOK-SUBSCRIBE-VERIFY, bước 3 của
 * `connectFacebookPages`). Dùng connector Facebook với một `TokenProvider` chỉ trả đúng Page token này (token ở trong
 * bộ nhớ của lời gọi, không qua tham số/log). Đường dẫn dựng từ `channel.externalId` (connector kiểm định dạng id).
 */
export type FbSubscribeConfig = {
  appId: string;
  appSecret: string;
  /** Tiêm để test/mock; mặc định `fetch` toàn cục. */
  fetch?: typeof fetch;
};

export function createSubscribeAndVerify(config: FbSubscribeConfig) {
  return async (channel: ChannelRef, pageToken: string): Promise<void> => {
    const connector = createFacebookConnector({
      tokenProvider: { getAccessToken: async () => pageToken },
      appId: config.appId,
      appSecret: config.appSecret,
      ...(config.fetch ? { fetch: config.fetch } : {}),
    });
    await connector.subscribePage(channel, ['feed']);
    const subscription = await connector.getPageSubscription(channel);
    if (!subscription.subscribed || !subscription.fields.includes('feed')) {
      throw new PlatformError('UNKNOWN', { message: 'facebook_subscription_not_confirmed' });
    }
  };
}
