import { type ChannelRef, isPlatformError } from '@flow/connectors';
import type { Logger } from '../logger';

/**
 * COMMENT-AUTHOR-AVATAR: sau khi ingest lưu một bình luận MỚI của khách, lấy ảnh đại diện người viết từ nền tảng (`fetchCommentAuthorPicture`) và lưu URL
 * (hàm DB DEFINER chỉ hệ thống). LÀM TỐT NHẤT CÓ THỂ: không bao giờ ném (lỗi mạng/token/quyền chỉ ghi cảnh báo kèm MÃ lỗi); mỗi bình luận đúng MỘT lần thử.
 * Nhật ký chỉ có KẾT QUẢ (`saved` | `none` | `error`) để đếm Facebook có trả ảnh hay không — KHÔNG ghi URL, mã bình luận hay tên người (dữ liệu cá nhân).
 */
export type AvatarTarget = {
  workspaceId: string;
  channelId: string;
  /** ID ngoài của Page (để dựng `ChannelRef`). */
  channelExternalId: string;
  commentId: string;
  commentExternalId: string;
};

export function createCommentAvatarHydrator(deps: {
  fetchPicture: (channel: ChannelRef, commentExternalId: string) => Promise<string | null>;
  save: (target: AvatarTarget, url: string) => Promise<boolean>;
  logger: Pick<Logger, 'warn' | 'info'>;
}): (target: AvatarTarget) => Promise<void> {
  return async (target) => {
    try {
      const url = await deps.fetchPicture(
        {
          id: target.channelId,
          workspaceId: target.workspaceId,
          platform: 'facebook',
          externalId: target.channelExternalId,
        },
        target.commentExternalId,
      );
      if (!url) {
        deps.logger.info(
          { outcome: 'none' },
          'ảnh đại diện người bình luận: nền tảng không trả ảnh',
        );
        return;
      }
      await deps.save(target, url);
      deps.logger.info({ outcome: 'saved' }, 'ảnh đại diện người bình luận: đã lưu');
    } catch (error) {
      deps.logger.warn(
        { outcome: 'error', error: isPlatformError(error) ? error.code : 'unknown' },
        'không lấy/lưu được ảnh đại diện người bình luận',
      );
    }
  };
}
