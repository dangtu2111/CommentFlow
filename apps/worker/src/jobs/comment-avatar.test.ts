import { PlatformError } from '@flow/connectors';
import { describe, expect, it, vi } from 'vitest';
import { type AvatarTarget, createCommentAvatarHydrator } from './comment-avatar';

const TARGET: AvatarTarget = {
  workspaceId: 'w1',
  channelId: 'c1',
  channelExternalId: '1000000000001',
  commentId: 'cm1',
  commentExternalId: '1000000000001_3000000000003_4000000000004',
};
const URL_OK = 'https://scontent.xx.fbcdn.net/v/avatar.jpg?oh=1';

const logger = () => ({ warn: vi.fn(), info: vi.fn() });

describe('createCommentAvatarHydrator', () => {
  it('lấy ảnh bằng ChannelRef đúng rồi lưu; ghi nhật ký kết quả "saved" (không kèm URL)', async () => {
    const fetchPicture = vi.fn().mockResolvedValue(URL_OK);
    const save = vi.fn().mockResolvedValue(true);
    const log = logger();
    await createCommentAvatarHydrator({ fetchPicture, save, logger: log })(TARGET);
    expect(fetchPicture).toHaveBeenCalledWith(
      { id: 'c1', workspaceId: 'w1', platform: 'facebook', externalId: '1000000000001' },
      TARGET.commentExternalId,
    );
    expect(save).toHaveBeenCalledWith(TARGET, URL_OK);
    expect(log.info).toHaveBeenCalledWith({ outcome: 'saved' }, expect.any(String));
    expect(JSON.stringify(log.info.mock.calls)).not.toContain('fbcdn');
  });

  it('Facebook không trả ảnh (null) → không lưu; nhật ký "none" để đếm khả thi', async () => {
    const save = vi.fn();
    const log = logger();
    await createCommentAvatarHydrator({ fetchPicture: async () => null, save, logger: log })(
      TARGET,
    );
    expect(save).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith({ outcome: 'none' }, expect.any(String));
  });

  it('lỗi nền tảng KHÔNG ném: chỉ cảnh báo kèm MÃ lỗi, không lưu, không log mã bình luận hay nội dung', async () => {
    const save = vi.fn();
    const log = logger();
    await createCommentAvatarHydrator({
      fetchPicture: async () => {
        throw new PlatformError('PERMISSION');
      },
      save,
      logger: log,
    })(TARGET);
    expect(save).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      { outcome: 'error', error: 'PERMISSION' },
      expect.any(String),
    );
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(TARGET.commentExternalId);
  });

  it('lưu DB lỗi (kể cả lỗi lạ) cũng KHÔNG ném', async () => {
    const log = logger();
    await expect(
      createCommentAvatarHydrator({
        fetchPicture: async () => URL_OK,
        save: async () => {
          throw new Error('db down');
        },
        logger: log,
      })(TARGET),
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      { outcome: 'error', error: 'unknown' },
      expect.any(String),
    );
  });
});
