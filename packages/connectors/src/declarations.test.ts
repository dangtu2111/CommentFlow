import { describe, expect, it } from 'vitest';
import { connectorCapabilitiesSchema } from './capabilities';
import { DECLARED_CAPABILITIES } from './declarations';
import { PLATFORMS } from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('FR-016 khai báo khả năng từng nền tảng (docs/12 §1–§3)', () => {
  it('FR-016 có khai báo cho đủ nền tảng và đều hợp lệ theo schema', () => {
    for (const platform of PLATFORMS) {
      expect(() =>
        connectorCapabilitiesSchema.parse(DECLARED_CAPABILITIES[platform]),
      ).not.toThrow();
    }
  });

  it('FR-016 Facebook (docs/12 §1): trả lời, ẩn/bỏ ẩn; nhắn riêng 1 lần trong 7 ngày; Messenger 24 giờ tự động + 24 giờ–7 ngày chỉ người', () => {
    const fb = DECLARED_CAPABILITIES.facebook;
    expect(fb.reply).toMatchObject({ supported: true });
    expect(fb.hide).toMatchObject({ supported: true });
    expect(fb.unhide).toMatchObject({ supported: true });
    expect(fb.privateReply).toMatchObject({
      supported: true,
      oncePerTarget: true,
      windows: [{ withinMs: 7 * DAY, humanOnly: false }],
    });
    expect(fb.sendMessage).toMatchObject({
      supported: true,
      windows: [
        { withinMs: 24 * HOUR, humanOnly: false },
        { withinMs: 7 * DAY, humanOnly: true },
      ],
    });
  });

  it('FR-016 Instagram (docs/12 §2): trả lời và ẩn; chưa khai báo nhắn riêng/tin nhắn (GĐ5); dark post ghi chú cần kiểm', () => {
    const ig = DECLARED_CAPABILITIES.instagram;
    expect(ig.reply).toMatchObject({ supported: true });
    expect(ig.hide).toMatchObject({ supported: true });
    expect(ig.privateReply.supported).toBe(false);
    expect(ig.sendMessage.supported).toBe(false);
    const reply = ig.reply;
    expect(reply.supported && reply.verified === false && /dark post/i.test(reply.note ?? '')).toBe(
      true,
    );
  });

  it('FR-016 TikTok (docs/12 §3): chỉ trả lời, 48 giờ, 150 ký tự, KHÔNG có ẩn; số liệu chưa xác minh', () => {
    const tt = DECLARED_CAPABILITIES.tiktok;
    expect(tt.reply).toMatchObject({
      supported: true,
      maxTextLength: 150,
      windows: [{ withinMs: 48 * HOUR, humanOnly: false }],
      verified: false,
    });
    expect(tt.hide.supported).toBe(false);
    expect(tt.unhide.supported).toBe(false);
    expect(tt.privateReply.supported).toBe(false);
    expect(tt.sendMessage.supported).toBe(false);
  });

  it('FR-016 mọi giới hạn lấy từ spec "cần kiểm" đều mang verified=false (không giả vờ đã đối chiếu)', () => {
    const unverified = [
      DECLARED_CAPABILITIES.tiktok.reply,
      DECLARED_CAPABILITIES.tiktok.hide,
      DECLARED_CAPABILITIES.instagram.reply,
    ];
    for (const capability of unverified) expect(capability.verified).toBe(false);
  });
});
