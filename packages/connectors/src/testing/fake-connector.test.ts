import { describe, expect, it } from 'vitest';
import { isPlatformError, PlatformError } from '../errors';
import type { ChannelRef, ConversationRef } from '../types';
import { createFakeConnector } from './fake-connector';

const channel: ChannelRef = { id: 'c1', workspaceId: 'w1', platform: 'facebook', externalId: 'p1' };
const conversation: ConversationRef = {
  id: 'v1',
  channelId: 'c1',
  externalId: 'x1',
  lastUserMessageAt: new Date('2026-11-04T00:00:00Z'),
};

describe('FR-016 connector giả dùng cho test pipeline', () => {
  it('Facebook giả có đủ phương thức và ghi lại lệnh gọi theo thứ tự, id sinh tăng dần', async () => {
    const fb = createFakeConnector('facebook');
    expect(await fb.verifyWebhook(new Request('https://example.test/hook'))).toBe(true);
    expect(fb.parseWebhook({})).toEqual([]);
    expect(await fb.fetchComments(channel, new Date(0))).toEqual([]);
    const r1 = await fb.reply(channel, 'cm1', 'xin chào');
    const r2 = await fb.reply(channel, 'cm2', 'cảm ơn');
    expect(r1.externalId).not.toBe(r2.externalId);
    await fb.setHidden?.(channel, 'cm1', true);
    await fb.privateReply?.(channel, 'cm1', 'nhắn riêng');
    const sent = await fb.sendMessage?.(channel, conversation, 'tin nhắn', { humanAgent: false });
    expect(sent?.externalId).toMatch(/^facebook-fake-/);
    expect(fb.calls.map((c) => c.method)).toEqual([
      'fetchComments',
      'reply',
      'reply',
      'setHidden',
      'privateReply',
      'sendMessage',
    ]);
  });

  it('TikTok giả KHÔNG có setHidden/privateReply/sendMessage (khớp khai báo)', () => {
    const tt = createFakeConnector('tiktok');
    expect(tt.setHidden).toBeUndefined();
    expect(tt.privateReply).toBeUndefined();
    expect(tt.sendMessage).toBeUndefined();
    expect(typeof tt.reply).toBe('function');
  });

  it('mapError giữ nguyên PlatformError và gói lỗi lạ thành UNKNOWN (giữ nguyên nhân)', () => {
    const fb = createFakeConnector('facebook');
    const known = new PlatformError('RATE_LIMIT', { retryAfterSeconds: 30 });
    expect(fb.mapError(known)).toBe(known);
    const original = new Error('boom');
    const mapped = fb.mapError(original);
    expect(isPlatformError(mapped)).toBe(true);
    expect(mapped.code).toBe('UNKNOWN');
    expect(mapped.cause).toBe(original);
    expect(isPlatformError(new Error('x'))).toBe(false);
  });
});
