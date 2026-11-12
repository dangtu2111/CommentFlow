import { PlatformError } from '@flow/connectors';
import { describe, expect, it, vi } from 'vitest';
import { createPostHydrator, type HydrateTarget, MAX_POST_MESSAGE_CHARS } from './post-hydrate';

const TARGET: HydrateTarget = {
  workspaceId: 'w1',
  channelId: 'c1',
  channelExternalId: '1000000000001',
  postId: 'p1',
  postExternalId: '1000000000001_3000000000003',
};
const INFO = {
  message: 'Áo thun mới về',
  permalink: 'https://www.facebook.com/p/1',
  mediaUrl: null,
  createdTime: null,
};

describe('createPostHydrator', () => {
  it('lấy nội dung bài bằng ChannelRef đúng (nền tảng facebook, id kênh/Page) rồi lưu', async () => {
    const fetchPost = vi.fn().mockResolvedValue(INFO);
    const save = vi.fn().mockResolvedValue(true);
    await createPostHydrator({ fetchPost, save, logger: { warn: vi.fn() } })(TARGET);
    expect(fetchPost).toHaveBeenCalledWith(
      { id: 'c1', workspaceId: 'w1', platform: 'facebook', externalId: '1000000000001' },
      '1000000000001_3000000000003',
    );
    expect(save).toHaveBeenCalledWith(TARGET, INFO);
  });

  it('cắt nội dung quá dài trước khi lưu', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const long = 'a'.repeat(MAX_POST_MESSAGE_CHARS + 50);
    await createPostHydrator({
      fetchPost: async () => ({ ...INFO, message: long }),
      save,
      logger: { warn: vi.fn() },
    })(TARGET);
    expect(save.mock.calls[0]?.[1].message).toHaveLength(MAX_POST_MESSAGE_CHARS);
  });

  it('lỗi nền tảng (token hết hạn…) KHÔNG ném: chỉ cảnh báo kèm mã lỗi, không lưu', async () => {
    const warn = vi.fn();
    const save = vi.fn();
    await createPostHydrator({
      fetchPost: async () => {
        throw new PlatformError('TOKEN_EXPIRED');
      },
      save,
      logger: { warn },
    })(TARGET);
    expect(save).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith({ postId: 'p1', error: 'TOKEN_EXPIRED' }, expect.any(String));
  });

  it('lỗi lưu hoặc lỗi lạ KHÔNG ném và không lộ thông điệp (có thể chứa nội dung)', async () => {
    const warn = vi.fn();
    await createPostHydrator({
      fetchPost: async () => INFO,
      save: async () => {
        throw new Error('db down Áo thun mới về');
      },
      logger: { warn },
    })(TARGET);
    expect(warn).toHaveBeenCalledWith({ postId: 'p1', error: 'unknown' }, expect.any(String));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Áo thun');
  });
});
