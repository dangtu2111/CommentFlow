/**
 * Mẫu MẪU của Messenger Platform, VIẾT TAY theo tài liệu chính thức của Meta (Messenger Platform: Webhook `messages`,
 * `message_echoes`, Send API; đọc 06/11/2026). KHÔNG phải kết quả gọi Meta thật — mọi giá trị là dữ liệu bịa để test.
 */

export const PAGE_ID = '100000000000001';
export const PSID = '5000000000000001';
export const APP_SECRET = 'test-app-secret-not-real';
export const TOKEN = 'EAAB-test-token-not-real-0123456789';
export const MID = 'm_test_mid_0001';
/** Mili-giây (Messenger dùng ms, khác `feed` dùng giây). */
export const TS_MS = 1_762_311_600_000; // 2025-11-05T03:00:00.000Z

/** Nguồn: webhooks/reference/messages — tin khách gửi tới Page. */
export const WEBHOOK_MESSAGE = {
  object: 'page',
  entry: [
    {
      id: PAGE_ID,
      time: TS_MS,
      messaging: [
        {
          sender: { id: PSID },
          recipient: { id: PAGE_ID },
          timestamp: TS_MS,
          message: { mid: MID, text: 'Áo này còn size M không shop?' },
        },
      ],
    },
  ],
};

/** Nguồn: webhooks/reference/message-echoes — tin Page gửi đi (`is_echo`; người gửi là Page, người nhận là khách). */
export const WEBHOOK_ECHO = {
  object: 'page',
  entry: [
    {
      id: PAGE_ID,
      time: TS_MS + 5000,
      messaging: [
        {
          sender: { id: PAGE_ID },
          recipient: { id: PSID },
          timestamp: TS_MS + 5000,
          message: { is_echo: true, mid: 'm_test_mid_echo', text: 'Dạ còn ạ' },
        },
      ],
    },
  ],
};

/** Nguồn: webhooks/reference/messages — tin có ảnh. */
export const WEBHOOK_IMAGE = {
  object: 'page',
  entry: [
    {
      id: PAGE_ID,
      time: TS_MS,
      messaging: [
        {
          sender: { id: PSID },
          recipient: { id: PAGE_ID },
          timestamp: TS_MS,
          message: {
            mid: 'm_test_mid_img',
            attachments: [
              { type: 'image', payload: { url: 'https://cdn.example.test/a.jpg' } },
              { type: 'location', payload: { coordinates: { lat: 1, long: 2 } } },
            ],
          },
        },
      ],
    },
  ],
};

/** Nguồn: Send API — phản hồi thành công. */
export const SEND_OK = { recipient_id: PSID, message_id: 'm_test_sent_0001' };
