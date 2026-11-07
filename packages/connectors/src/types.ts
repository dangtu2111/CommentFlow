import type { CommentAttachment } from './attachments';
import type { ConnectorCapabilities } from './capabilities';
import type { PlatformError } from './errors';

export const PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * Tham chiếu một kênh — KHÔNG chứa bí mật. Token lấy qua `TokenProvider` (tiêm lúc dựng connector) để token không
 * đi qua tham số hàm, log hay stack (nguyên tắc #6, docs/13 §5).
 */
export type ChannelRef = {
  id: string;
  workspaceId: string;
  platform: Platform;
  /** ID ngoài của Page/tài khoản (Page ID, IG business ID...). */
  externalId: string;
};

/** Cuộc hội thoại tin nhắn (GĐ5): `lastUserMessageAt` là mốc cửa sổ 24 giờ/7 ngày. */
export type ConversationRef = {
  id: string;
  channelId: string;
  externalId: string;
  lastUserMessageAt: Date;
};

export interface TokenProvider {
  /** Trả token đã giải mã của kênh; ném `PlatformError('TOKEN_EXPIRED')` nếu không còn dùng được. */
  getAccessToken(channel: ChannelRef): Promise<string>;
}

export type NormalizedComment = {
  externalId: string;
  postExternalId: string;
  /** Bình luận cha (trả lời lồng); null/undefined = cấp 1. */
  parentExternalId?: string | null;
  authorExternalId: string;
  authorName?: string;
  text: string;
  /** Ảnh/video/sticker/gif khách gửi kèm (FR-143); thiếu = không có. */
  attachments?: CommentAttachment[];
  createdAt: Date;
  /** Do chính Page/tài khoản viết (chống vòng lặp, nguyên tắc #5): pipeline bỏ qua. */
  isFromPage: boolean;
};

export type NormalizedEvent =
  | {
      kind: 'comment_created' | 'comment_edited';
      channelExternalId: string;
      comment: NormalizedComment;
      /** Thời điểm sự kiện theo nền tảng (FB: `entry.time`); có ở sửa/xóa để mỗi lần sửa là một sự kiện riêng. */
      occurredAt?: Date;
    }
  | {
      kind: 'comment_deleted';
      channelExternalId: string;
      commentExternalId: string;
      occurredAt?: Date;
    };

/**
 * Interface connector chung (docs/12 §9). Khác bản minh họa trong spec ở hai điểm có chủ đích:
 * (1) `channel` là `ChannelRef` không bí mật, token đi qua `TokenProvider`; (2) `setHidden`/`privateReply`/`sendMessage`
 * là tùy chọn — có hay không PHẢI khớp `capabilities` (kiểm bằng `checkConnectorContract`).
 */
/** Kết quả "kiểm tra kết nối" khi token còn sống: webhook đã đăng ký hay chưa (`null` = nền tảng không có khái niệm này). */
export type ConnectionHealth = { webhookSubscribed: boolean | null };

export interface PlatformConnector {
  readonly platform: Platform;
  /** Khai báo cửa sổ thời gian và hành động được phép (FR-016). */
  readonly capabilities: ConnectorCapabilities;
  /** Xác minh chữ ký/token webhook bằng so sánh thời gian hằng, TRƯỚC khi xử lý (docs/12 §1). */
  verifyWebhook(req: Request): Promise<boolean>;
  parseWebhook(body: unknown): NormalizedEvent[];
  fetchComments(channel: ChannelRef, since: Date): Promise<NormalizedComment[]>;
  /**
   * Đọc ĐỦ các trả lời trực tiếp của MỘT bình luận (đi hết các trang; chưa đọc đủ thì ném lỗi, không trả nửa chừng).
   * Dùng cho "kiểm trước khi gửi lại" (ADR 008): lọc theo cha, không quét cả kênh. Tùy chọn: connector không có thì thiếu.
   */
  fetchReplies?(
    channel: ChannelRef,
    parentCommentId: string,
    options?: { postExternalId?: string },
  ): Promise<NormalizedComment[]>;
  reply(channel: ChannelRef, commentId: string, text: string): Promise<{ externalId: string }>;
  setHidden?(channel: ChannelRef, commentId: string, hidden: boolean): Promise<void>;
  sendMessage?(
    channel: ChannelRef,
    conversation: ConversationRef,
    text: string,
    options: { humanAgent: boolean },
  ): Promise<{ externalId: string }>;
  privateReply?(channel: ChannelRef, commentId: string, text: string): Promise<void>;
  /**
   * Kiểm token Page còn hiệu lực (gọi nền tảng thật bằng token đã lưu) và webhook đã đăng ký chưa. Token hỏng → ném
   * `PlatformError` (`TOKEN_EXPIRED`). Tùy chọn: connector không có thì thiếu.
   */
  checkConnection?(channel: ChannelRef): Promise<ConnectionHealth>;
  /** Chuẩn hóa MỌI lỗi (kể cả giá trị không phải Error) về một trong 5 mã. */
  mapError(error: unknown): PlatformError;
}
