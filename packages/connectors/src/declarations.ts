import type { ActionCapability, ConnectorCapabilities } from './capabilities';
import type { Platform } from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const unsupported = (note: string, verified = true): ActionCapability => ({
  supported: false,
  verified,
  note,
});

/**
 * Khai báo khả năng mặc định của từng nền tảng, lấy NGUYÊN theo docs/12 §1–§3. Giá trị mà spec ghi "cần kiểm"/"bên
 * thứ ba ghi" mang `verified: false` — UI/`guard` vẫn dùng như spec nhưng biết còn phải đối chiếu tài liệu chính thức.
 * Connector thật có thể khai báo lại (ví dụ sau khi xác minh); registry ưu tiên khai báo của connector.
 */
export const DECLARED_CAPABILITIES: Record<Platform, ConnectorCapabilities> = {
  // docs/12 §1
  facebook: {
    reply: { supported: true, verified: true },
    hide: { supported: true, verified: true },
    unhide: { supported: true, verified: true },
    // "Nhắn riêng: 1 lần, trong 7 ngày"
    privateReply: {
      supported: true,
      verified: true,
      oncePerTarget: true,
      windows: [{ withinMs: 7 * DAY, humanOnly: false }],
    },
    // "Messenger: trong 24 giờ tự động được; 24 giờ–7 ngày chỉ người (HUMAN_AGENT); quá 7 ngày không gửi"
    sendMessage: {
      supported: true,
      verified: true,
      windows: [
        { withinMs: 24 * HOUR, humanOnly: false },
        { withinMs: 7 * DAY, humanOnly: true },
      ],
    },
  },
  // docs/12 §2
  instagram: {
    reply: {
      supported: true,
      verified: false,
      note: 'Không trả lời được bình luận trên quảng cáo dạng dark post theo một số trường hợp (docs/12 §2, cần kiểm).',
    },
    hide: { supported: true, verified: true },
    unhide: {
      supported: true,
      verified: false,
      note: 'Spec chỉ nêu hide: true; bỏ ẩn (hide: false) cần đối chiếu tài liệu.',
    },
    privateReply: unsupported('Chưa khai báo cho Instagram (docs/12 §2).', false),
    sendMessage: unsupported(
      'Tin nhắn Instagram làm ở GĐ5; chưa khai báo cửa sổ (docs/12 §2).',
      false,
    ),
  },
  // docs/12 §3
  tiktok: {
    reply: {
      supported: true,
      verified: false,
      maxTextLength: 150,
      windows: [{ withinMs: 48 * HOUR, humanOnly: false }],
      note: 'Chỉ bình luận cấp 1 trên video của chính tài khoản; 48 giờ, tối đa 150 ký tự (bên thứ ba ghi, cần đối chiếu).',
    },
    hide: unsupported('Chưa thấy trong API organic của TikTok (docs/12 §3, cần kiểm).', false),
    unhide: unsupported('Chưa thấy trong API organic của TikTok (docs/12 §3, cần kiểm).', false),
    privateReply: unsupported('TikTok không có nhắn riêng từ bình luận (chưa khai báo).', false),
    sendMessage: unsupported(
      'Business Messaging API làm ở GĐ5; chưa khai báo (docs/12 §3).',
      false,
    ),
  },
};
