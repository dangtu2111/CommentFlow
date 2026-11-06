import type { ChannelRef, NormalizedComment, PlatformConnector } from '@flow/connectors';
import { describe, expect, it, vi } from 'vitest';
import { findExistingReply, notifyBlocked } from './send';

const channel: ChannelRef = {
  id: 'c1',
  workspaceId: 'w1',
  platform: 'facebook',
  externalId: 'page-1',
};
const row = {
  comment_external_id: 'cmt-1',
  reply_text: 'Dạ còn size M ạ.',
  comment_created_time: new Date('2026-11-01T00:00:00Z'),
};
const reply = (over: Partial<NormalizedComment> = {}): NormalizedComment => ({
  externalId: 'r1',
  postExternalId: 'p',
  parentExternalId: 'cmt-1',
  authorExternalId: 'page-1',
  text: '  Dạ còn size M ạ. ',
  createdAt: new Date(),
  isFromPage: true,
  ...over,
});
const connector = (parts: Partial<PlatformConnector>) => parts as PlatformConnector;
const ids = { channelId: 'c1', replyId: 'r1' };

describe('FR-042 findExistingReply theo bình luận cha (SEND-FIND-REPLY-BY-PARENT)', () => {
  it('connector có fetchReplies → gọi với mã bình luận cha, KHÔNG gọi fetchComments (connector thật ném UNKNOWN ở đó)', async () => {
    const fetchReplies = vi.fn(async () => [reply()]);
    const fetchComments = vi.fn(async (): Promise<NormalizedComment[]> => {
      throw new Error('UNKNOWN');
    });
    const id = await findExistingReply(connector({ fetchReplies, fetchComments }), channel, row);
    expect(id).toBe('r1');
    expect(fetchReplies).toHaveBeenCalledWith(channel, 'cmt-1');
    expect(fetchComments).not.toHaveBeenCalled();
  });

  it('chỉ nhận câu của Page, đúng cha, cùng nội dung (sau trim); không có → null', async () => {
    const others = async () => [
      reply({ externalId: 'khach', isFromPage: false }),
      reply({ externalId: 'khac-noi-dung', text: 'Hết hàng rồi ạ.' }),
      reply({ externalId: 'khac-cha', parentExternalId: 'cmt-2' }),
    ];
    expect(await findExistingReply(connector({ fetchReplies: others }), channel, row)).toBeNull();
    const withMatch = async () => [...(await others()), reply({ externalId: 'dung' })];
    expect(await findExistingReply(connector({ fetchReplies: withMatch }), channel, row)).toBe(
      'dung',
    );
  });

  it('connector không có fetchReplies (connector giả) → dùng fetchComments như cũ', async () => {
    const fetchComments = vi.fn(async () => [reply({ externalId: 'cu' })]);
    expect(await findExistingReply(connector({ fetchComments }), channel, row)).toBe('cu');
    expect(fetchComments).toHaveBeenCalledWith(channel, row.comment_created_time);
  });

  it('lỗi từ connector truyền ra (không nuốt) để nơi gọi ánh xạ và thử lại', async () => {
    const boom = new Error('x');
    const fetchReplies = async (): Promise<NormalizedComment[]> => {
      throw boom;
    };
    await expect(findExistingReply(connector({ fetchReplies }), channel, row)).rejects.toBe(boom);
  });
});

describe('FR-042 notifyBlocked (BLOCKED 368 — chỉ log; SEND-SUSPEND-ADMIN ghi cột sau)', () => {
  it('chỉ BLOCKED mới gọi hook, kèm đúng id kênh/yêu cầu (không nội dung/token)', () => {
    const onBlocked = vi.fn();
    notifyBlocked(onBlocked, 'TOKEN_EXPIRED', ids);
    notifyBlocked(onBlocked, 'PERMISSION', ids);
    expect(onBlocked).not.toHaveBeenCalled();
    notifyBlocked(onBlocked, 'BLOCKED', ids);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(onBlocked).toHaveBeenCalledWith(ids);
  });

  it('hook ném lỗi → bị nuốt (log không làm hỏng việc ghi kết quả); không có hook → không làm gì', () => {
    const boom = () => {
      throw new Error('x');
    };
    expect(() => notifyBlocked(boom, 'BLOCKED', ids)).not.toThrow();
    expect(() => notifyBlocked(undefined, 'BLOCKED', ids)).not.toThrow();
  });
});
