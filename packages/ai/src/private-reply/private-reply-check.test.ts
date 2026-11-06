import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  PRIVATE_REPLY_MAX_TEXT_LENGTH,
  PRIVATE_REPLY_REASON_LABELS,
  PRIVATE_REPLY_REASONS,
  PRIVATE_REPLY_WINDOW_MS,
  type PrivateReplyInput,
  privateReplyCheck,
  privateReplyDeadline,
} from './private-reply-check';

const DAY = 24 * 3_600_000;
const CREATED = '2026-11-01T00:00:00.000Z';
const createdMs = Date.parse(CREATED);
const at = (offsetMs: number) => new Date(createdMs + offsetMs).toISOString();

const base = (over: Partial<PrivateReplyInput> = {}): PrivateReplyInput => ({
  platform: 'facebook',
  mode: 'human',
  now: at(DAY),
  comment: {
    createdAt: CREATED,
    deletedAt: null,
    isHidden: false,
    mergedIntoId: null,
    privateReplySentAt: null,
  },
  channel: { status: 'connected', sendSuspended: false },
  text: 'Chào bạn, shop nhắn riêng nhé!',
  rate: { remaining: 5 },
  ...over,
});

const withComment = (c: Partial<PrivateReplyInput['comment']>): PrivateReplyInput => {
  const b = base();
  return { ...b, comment: { ...b.comment, ...c } };
};

describe('FR-046 nhắn riêng từ bình luận — kiểm tra trước khi gửi', () => {
  it('FR-046 hằng số: 7 ngày, mọi mã lý do có nhãn tiếng Việt', () => {
    expect(PRIVATE_REPLY_WINDOW_MS).toBe(7 * DAY);
    for (const r of PRIVATE_REPLY_REASONS) {
      expect(PRIVATE_REPLY_REASON_LABELS[r].length).toBeGreaterThan(5);
    }
  });

  it('FR-046 đủ điều kiện → cho phép', () => {
    expect(privateReplyCheck(base())).toEqual({ ok: true, rulesPassed: 8 });
  });

  it('FR-046 biên 7 ngày: đúng 7 ngày được, +1 ms bị chặn', () => {
    expect(privateReplyCheck(base({ now: at(7 * DAY) })).ok).toBe(true);
    expect(privateReplyCheck(base({ now: at(7 * DAY + 1) }))).toMatchObject({
      ok: false,
      reason: 'window_expired',
      rule: 'private_reply:P5',
    });
  });

  it('FR-046 đồng hồ lệch: mốc bình luận ở tương lai quá 5 phút → chặn, trong 5 phút → được', () => {
    expect(privateReplyCheck(base({ now: at(-6 * 60_000) }))).toMatchObject({
      reason: 'window_expired',
    });
    expect(privateReplyCheck(base({ now: at(-60_000) })).ok).toBe(true);
  });

  it('FR-046 chỉ Facebook: Instagram/TikTok bị chặn P1', () => {
    for (const platform of ['instagram', 'tiktok', 'zalo']) {
      expect(privateReplyCheck(base({ platform }))).toMatchObject({
        ok: false,
        rule: 'private_reply:P1',
        reason: 'platform_unsupported',
        action: 'cancel',
      });
    }
  });

  it('FR-046 đã nhắn riêng một lần → chặn P2 (đúng 1 tin)', () => {
    expect(privateReplyCheck(withComment({ privateReplySentAt: at(1000) }))).toMatchObject({
      rule: 'private_reply:P2',
      reason: 'already_sent',
    });
  });

  it('FR-046 bình luận xóa / gộp / ẩn → chặn P3', () => {
    expect(privateReplyCheck(withComment({ deletedAt: at(1) }))).toMatchObject({
      rule: 'private_reply:P3',
      reason: 'comment_deleted',
    });
    expect(privateReplyCheck(withComment({ mergedIntoId: 'c9' }))).toMatchObject({
      reason: 'comment_merged',
    });
    expect(privateReplyCheck(withComment({ isHidden: true }))).toMatchObject({
      reason: 'comment_hidden',
    });
  });

  it('FR-046 kênh mất kết nối / tạm khóa → chặn P4, xử lý channel_error', () => {
    expect(
      privateReplyCheck(base({ channel: { status: 'disconnected', sendSuspended: false } })),
    ).toMatchObject({
      rule: 'private_reply:P4',
      reason: 'channel_disconnected',
      action: 'channel_error',
    });
    expect(
      privateReplyCheck(base({ channel: { status: 'connected', sendSuspended: true } })),
    ).toMatchObject({ reason: 'channel_send_suspended', action: 'channel_error' });
  });

  it('FR-046 AI tự gửi bị chặn P6 (chỉ nhân viên bấm Gửi) — Q-PRP1', () => {
    expect(privateReplyCheck(base({ mode: 'auto' }))).toMatchObject({
      rule: 'private_reply:P6',
      reason: 'auto_not_allowed',
    });
  });

  it('FR-046 nội dung: rỗng/khoảng trắng, quá dài (đếm điểm mã Unicode)', () => {
    expect(privateReplyCheck(base({ text: '   \n ' }))).toMatchObject({
      rule: 'private_reply:P7',
      reason: 'text_empty',
    });
    // ký tự rộng 0 không phải nội dung
    expect(privateReplyCheck(base({ text: '​‍ ⁠' }))).toMatchObject({
      reason: 'text_empty',
    });
    expect(privateReplyCheck(base({ text: 'a'.repeat(PRIVATE_REPLY_MAX_TEXT_LENGTH) })).ok).toBe(
      true,
    );
    expect(
      privateReplyCheck(base({ text: 'a'.repeat(PRIVATE_REPLY_MAX_TEXT_LENGTH + 1) })),
    ).toMatchObject({ reason: 'text_too_long' });
    // emoji = 1 điểm mã dù 2 đơn vị UTF-16
    expect(privateReplyCheck(base({ text: '😀'.repeat(PRIVATE_REPLY_MAX_TEXT_LENGTH) })).ok).toBe(
      true,
    );
  });

  it('FR-046 hết hạn mức tốc độ → hoãn (defer), không tính là lỗi; rate null → qua', () => {
    expect(privateReplyCheck(base({ rate: { remaining: 0 } }))).toMatchObject({
      rule: 'private_reply:P8',
      reason: 'rate_limited',
      action: 'defer',
    });
    expect(privateReplyCheck(base({ rate: null })).ok).toBe(true);
  });

  it('FR-046 thứ tự cố định: nhiều lỗi cùng lúc → báo lỗi đầu tiên theo P1–P8', () => {
    const r = privateReplyCheck(
      base({
        platform: 'tiktok',
        mode: 'auto',
        text: '',
        now: at(30 * DAY),
        comment: { ...base().comment, privateReplySentAt: at(1) },
      }),
    );
    expect(r).toMatchObject({ rule: 'private_reply:P1', rulesPassed: 0 });
  });

  it('FR-046 kết quả bị chặn luôn có nhãn tiếng Việt để hiển thị', () => {
    const r = privateReplyCheck(base({ now: at(8 * DAY) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.label).toBe(PRIVATE_REPLY_REASON_LABELS.window_expired);
  });

  it('FR-046 đầu vào hỏng không ném, trả chặn input_unreadable', () => {
    for (const bad of [null, undefined, 42, 'x', {}, { ...base(), now: 'hôm qua' }]) {
      expect(privateReplyCheck(bad)).toMatchObject({
        ok: false,
        rule: 'private_reply:input',
        reason: 'input_unreadable',
      });
    }
  });

  it('FR-046 privateReplyDeadline = lúc bình luận + 7 ngày; hỏng → null', () => {
    expect(privateReplyDeadline(CREATED)?.toISOString()).toBe(at(7 * DAY));
    expect(privateReplyDeadline('không phải ngày')).toBeNull();
  });
});

describe('FR-046 property-based', () => {
  const elapsed = fc.integer({ min: 0, max: 30 * DAY });

  it('FR-046 trong ≤ 7 ngày (mọi thứ khác ổn) → cho phép; > 7 ngày → window_expired', () => {
    fc.assert(
      fc.property(elapsed, (ms) => {
        const r = privateReplyCheck(base({ now: at(ms) }));
        if (ms <= 7 * DAY) expect(r.ok).toBe(true);
        else expect(r).toMatchObject({ ok: false, reason: 'window_expired' });
      }),
    );
  });

  it('FR-046 đã nhắn riêng thì luôn bị chặn, dù thời điểm/nội dung thế nào (đúng 1 tin)', () => {
    fc.assert(
      fc.property(elapsed, fc.string({ minLength: 1, maxLength: 50 }), (ms, text) => {
        const r = privateReplyCheck({
          ...withComment({ privateReplySentAt: at(0) }),
          now: at(ms),
          text: 'x' + text,
        });
        expect(r.ok).toBe(false);
      }),
    );
  });

  it('FR-046 không bao giờ ném với đầu vào bất kỳ', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const r = privateReplyCheck(raw);
        expect(typeof r.ok).toBe('boolean');
      }),
    );
  });

  it('FR-046 chế độ auto không bao giờ được phép gửi', () => {
    fc.assert(
      fc.property(elapsed, fc.string(), (ms, text) => {
        expect(privateReplyCheck(base({ mode: 'auto', now: at(ms), text })).ok).toBe(false);
      }),
    );
  });
});
