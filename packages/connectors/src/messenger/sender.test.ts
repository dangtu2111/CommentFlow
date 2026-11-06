import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { isPlatformError, PlatformError } from '../errors';
import type { ChannelRef, ConversationRef, TokenProvider } from '../types';
import { APP_SECRET, PAGE_ID, PSID, SEND_OK, TOKEN } from './fixtures';
import { createMessengerSender, MessageNotAllowedError } from './sender';

const HOUR = 3_600_000;
const NOW = new Date('2026-11-05T12:00:00Z');
const channel: ChannelRef = {
  id: 'c1',
  workspaceId: 'w1',
  platform: 'facebook',
  externalId: PAGE_ID,
};
const conversation = (ageMs: number): ConversationRef => ({
  id: 'v1',
  channelId: 'c1',
  externalId: PSID,
  lastUserMessageAt: new Date(NOW.getTime() - ageMs),
});
const tokenProvider: TokenProvider = { getAccessToken: async () => TOKEN };

function setup(response: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response();
  });
  const sender = createMessengerSender({
    tokenProvider,
    appSecret: APP_SECRET,
    fetch: fetchMock as unknown as typeof fetch,
    now: () => NOW,
  });
  return { sender, calls, fetchMock };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const bodyOf = (call?: { init: RequestInit }) => JSON.parse(String(call?.init.body));

describe('FR-014 createMessengerSender.sendMessage', () => {
  it('trong 24 giờ: POST /{page}/messages, RESPONSE, token + appsecret_proof ở THÂN (không ở URL)', async () => {
    const { sender, calls } = setup(() => json(SEND_OK));
    const result = await sender.sendMessage(channel, conversation(HOUR), 'Dạ còn ạ', {
      humanAgent: false,
    });
    expect(result).toEqual({ externalId: SEND_OK.message_id });
    const [call] = calls;
    expect(call?.url).toBe(`https://graph.facebook.com/v27.0/${PAGE_ID}/messages`);
    expect(call?.url).not.toContain(TOKEN);
    expect(call?.init.method).toBe('POST');
    expect(call?.init.redirect).toBe('error');
    expect(bodyOf(call)).toEqual({
      recipient: { id: PSID },
      messaging_type: 'RESPONSE',
      message: { text: 'Dạ còn ạ' },
      access_token: TOKEN,
      appsecret_proof: createHmac('sha256', APP_SECRET).update(TOKEN).digest('hex'),
    });
  });

  it('24 giờ–7 ngày do người gửi: MESSAGE_TAG + HUMAN_AGENT', async () => {
    const { sender, calls } = setup(() => json(SEND_OK));
    await sender.sendMessage(channel, conversation(30 * HOUR), 'Chào bạn', { humanAgent: true });
    expect(bodyOf(calls[0])).toMatchObject({ messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' });
  });

  it('AI (không phải người) ngoài 24 giờ, hoặc quá 7 ngày: từ chối TRƯỚC khi gọi mạng', async () => {
    const { sender, fetchMock } = setup(() => json(SEND_OK));
    const ai = sender.sendMessage(channel, conversation(30 * HOUR), 'x', { humanAgent: false });
    await expect(ai).rejects.toMatchObject({ reason: 'HUMAN_REQUIRED' });
    const late = sender.sendMessage(channel, conversation(200 * HOUR), 'x', { humanAgent: true });
    await expect(late).rejects.toBeInstanceOf(MessageNotAllowedError);
    await expect(late).rejects.toMatchObject({ reason: 'WINDOW_EXPIRED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('văn bản rỗng/quá 2000 ký tự (điểm mã) và id sai dạng: từ chối trước khi gọi mạng', async () => {
    const { sender, fetchMock } = setup(() => json(SEND_OK));
    const run = (text: string, conv = conversation(HOUR), ch = channel) =>
      sender.sendMessage(ch, conv, text, { humanAgent: false });
    await expect(run('   ')).rejects.toMatchObject({ message: 'messenger_text_invalid' });
    await expect(run('😀'.repeat(2001))).rejects.toMatchObject({
      message: 'messenger_text_invalid',
    });
    await expect(run('😀'.repeat(2000))).resolves.toBeDefined();
    fetchMock.mockClear();
    await expect(run('x', { ...conversation(HOUR), externalId: '../x' })).rejects.toMatchObject({
      message: 'messenger_invalid_id',
    });
    await expect(
      run('x', conversation(HOUR), { ...channel, externalId: 'abc' }),
    ).rejects.toMatchObject({
      message: 'messenger_invalid_id',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('kênh không phải Facebook hoặc hội thoại của kênh khác: từ chối trước khi gọi mạng', async () => {
    const { sender, fetchMock } = setup(() => json(SEND_OK));
    const opts = { humanAgent: false };
    await expect(
      sender.sendMessage({ ...channel, platform: 'instagram' }, conversation(HOUR), 'x', opts),
    ).rejects.toMatchObject({ message: 'messenger_channel_mismatch' });
    await expect(
      sender.sendMessage(channel, { ...conversation(HOUR), channelId: 'c2' }, 'x', opts),
    ).rejects.toMatchObject({ message: 'messenger_channel_mismatch' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lỗi Graph 190/10/4/368 → mã chuẩn; thông báo không chứa token/nội dung', async () => {
    const expected = {
      190: 'TOKEN_EXPIRED',
      10: 'PERMISSION',
      4: 'RATE_LIMIT',
      368: 'BLOCKED',
    } as const;
    for (const [code, platformCode] of Object.entries(expected)) {
      const { sender } = setup(() =>
        json({ error: { code: Number(code), message: `bí mật ${TOKEN}` } }, 400),
      );
      const error = await sender
        .sendMessage(channel, conversation(HOUR), 'nội dung riêng', { humanAgent: false })
        .catch((e: unknown) => e);
      expect(isPlatformError(error) && error.code).toBe(platformCode);
      expect(String((error as Error).message)).not.toMatch(/bí mật|nội dung|EAAB/);
    }
  });

  it('mạng hỏng, 2xx thiếu message_id, thân không phải JSON → UNKNOWN (job kiểm lại trước khi gửi lại)', async () => {
    const net = createMessengerSender({
      tokenProvider,
      appSecret: APP_SECRET,
      now: () => NOW,
      fetch: (async () => {
        throw new Error(`lỗi chứa ${TOKEN}`);
      }) as unknown as typeof fetch,
    });
    const fail1 = await net
      .sendMessage(channel, conversation(HOUR), 'x', { humanAgent: false })
      .catch((e: unknown) => e);
    expect(isPlatformError(fail1) && fail1.code).toBe('UNKNOWN');
    expect(String((fail1 as Error).message)).not.toContain(TOKEN);
    for (const res of [
      () => json({ recipient_id: PSID }),
      () => new Response('<html>', { status: 200 }),
    ]) {
      const { sender } = setup(res);
      const error = await sender
        .sendMessage(channel, conversation(HOUR), 'x', { humanAgent: false })
        .catch((e: unknown) => e);
      expect(isPlatformError(error) && error.code).toBe('UNKNOWN');
    }
  });

  it('token hết hạn (PlatformError) từ provider được chuyển nguyên; đồng hồ mặc định dùng giờ thật', async () => {
    const expired = createMessengerSender({
      tokenProvider: {
        getAccessToken: async () => {
          throw new PlatformError('TOKEN_EXPIRED');
        },
      },
      appSecret: APP_SECRET,
    });
    const recent: ConversationRef = { ...conversation(0), lastUserMessageAt: new Date() };
    const error = await expired
      .sendMessage(channel, recent, 'x', { humanAgent: false })
      .catch((e: unknown) => e);
    expect(isPlatformError(error) && error.code).toBe('TOKEN_EXPIRED');
  });

  it('token hết hạn từ provider được chuyển nguyên; lỗi lạ → UNKNOWN; cấu hình sai → ném khi dựng', async () => {
    const sender = createMessengerSender({
      tokenProvider: {
        getAccessToken: async () => {
          throw new Error('db down');
        },
      },
      appSecret: APP_SECRET,
      now: () => NOW,
    });
    const error = await sender
      .sendMessage(channel, conversation(HOUR), 'x', { humanAgent: false })
      .catch((e: unknown) => e);
    expect(isPlatformError(error) && error.code).toBe('UNKNOWN');
    expect(sender.mapError('x').code).toBe('UNKNOWN');
    expect(() => createMessengerSender({ tokenProvider, appSecret: '' })).toThrow();
    expect(() =>
      createMessengerSender({ tokenProvider, appSecret: 'a', apiVersion: 'x' }),
    ).toThrow();
    expect(() => createMessengerSender({ tokenProvider, appSecret: 'a', timeoutMs: 0 })).toThrow();
  });
});
