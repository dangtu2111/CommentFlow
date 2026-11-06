import { describe, expect, it } from 'vitest';
import {
  MID,
  PAGE_ID,
  PSID,
  TS_MS,
  WEBHOOK_ECHO,
  WEBHOOK_IMAGE,
  WEBHOOK_MESSAGE,
} from './fixtures';
import { parseMessengerWebhook } from './webhook';

const clone = <T>(v: T): T => structuredClone(v);
type Body = typeof WEBHOOK_MESSAGE;
const first = (b: Body) => b.entry[0]?.messaging[0] as Record<string, unknown>;

describe('FR-014 parseMessengerWebhook', () => {
  it('tin khách → direction in, thời điểm theo ms, khách = sender, Page = entry.id', () => {
    const [event] = parseMessengerWebhook(WEBHOOK_MESSAGE);
    expect(event).toMatchObject({
      direction: 'in',
      channelExternalId: PAGE_ID,
      customerExternalId: PSID,
      message: { externalId: MID, text: 'Áo này còn size M không shop?', isFromPage: false },
    });
    expect(event?.message.createdAt.toISOString()).toBe('2025-11-05T03:00:00.000Z');
    expect(event?.message.createdAt.getTime()).toBe(TS_MS);
  });

  it('echo (is_echo) → direction out, khách = recipient, isFromPage (chống vòng lặp)', () => {
    const [event] = parseMessengerWebhook(WEBHOOK_ECHO);
    expect(event).toMatchObject({
      direction: 'out',
      customerExternalId: PSID,
      message: { externalId: 'm_test_mid_echo', text: 'Dạ còn ạ', isFromPage: true },
    });
  });

  it('ảnh → attachments photo (chỉ https), loại không hỗ trợ bị bỏ; không text vẫn nhận', () => {
    const [event] = parseMessengerWebhook(WEBHOOK_IMAGE);
    expect(event?.message.text).toBe('');
    expect(event?.message.attachments).toEqual([
      { type: 'photo', url: 'https://cdn.example.test/a.jpg' },
    ]);
  });

  it('sticker (image có sticker_id) và video; ảnh không có url vẫn giữ loại', () => {
    const body = clone(WEBHOOK_MESSAGE);
    first(body).message = {
      mid: 'm_att',
      attachments: [
        {
          type: 'image',
          payload: { url: 'https://cdn.example.test/s.png', sticker_id: 369239263222822 },
        },
        { type: 'video', payload: { url: 'https://cdn.example.test/v.mp4' } },
        { type: 'image' },
        'rác',
      ],
    };
    const [event] = parseMessengerWebhook(body);
    expect(event?.message.attachments).toEqual([
      { type: 'sticker', url: 'https://cdn.example.test/s.png' },
      { type: 'video', url: 'https://cdn.example.test/v.mp4' },
      { type: 'photo' },
    ]);
  });

  it('bỏ: sai object, delivery/read/postback, thiếu mid/timestamp/sender, người nhận không phải Page, rỗng', () => {
    const wrongObject = { ...clone(WEBHOOK_MESSAGE), object: 'instagram' };
    const read = clone(WEBHOOK_MESSAGE);
    first(read).message = undefined;
    first(read).read = { watermark: TS_MS };
    const noMid = clone(WEBHOOK_MESSAGE);
    delete (first(noMid).message as { mid?: string }).mid;
    const noTs = clone(WEBHOOK_MESSAGE);
    delete first(noTs).timestamp;
    const noSender = clone(WEBHOOK_MESSAGE);
    delete first(noSender).sender;
    const otherPage = clone(WEBHOOK_MESSAGE);
    first(otherPage).recipient = { id: '999' };
    const emptyMsg = clone(WEBHOOK_MESSAGE);
    first(emptyMsg).message = { mid: MID };
    const badTs = clone(WEBHOOK_MESSAGE);
    first(badTs).timestamp = 9e15;
    for (const body of [
      wrongObject,
      read,
      noMid,
      noTs,
      noSender,
      otherPage,
      emptyMsg,
      badTs,
      null,
      'x',
      {},
      { object: 'page' },
    ]) {
      expect(parseMessengerWebhook(body)).toEqual([]);
    }
  });

  it('một lô nhiều tin: tin hỏng không làm mất tin tốt; NUL/surrogate lẻ được làm sạch', () => {
    const body = clone(WEBHOOK_MESSAGE);
    const good = first(body);
    body.entry[0]?.messaging.push(
      { bad: true } as never,
      {
        ...clone(good),
        message: { mid: 'm2', text: 'a\u0000b\uD800' },
      } as never,
    );
    const events = parseMessengerWebhook(body);
    expect(events.map((e) => e.message.externalId)).toEqual([MID, 'm2']);
    expect(events[1]?.message.text).toBe('ab�');
  });
});
