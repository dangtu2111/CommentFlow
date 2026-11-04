import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { REPLY_ERROR_KEYS, replyErrorKey } from './reply-errors';
import { MAX_REPLY_LENGTH, parseReplyText } from './reply-input';
import { deriveReplyUi, type ReplyUiDetail } from './reply-state';

const base: ReplyUiDetail = {
  status: 'pending_review',
  channelStatus: 'connected',
  lock: null,
  latestReply: null,
};
const detail = (over: Partial<ReplyUiDetail> = {}): ReplyUiDetail => ({ ...base, ...over });
const reply = (status: string, over: Record<string, unknown> = {}) => ({
  id: 'r1',
  status,
  text: 'Dạ còn size M ạ.',
  errorCode: null as string | null,
  sentAt: null as Date | null,
  ...over,
});

describe('FR-042 parseReplyText — nội dung câu trả lời', () => {
  it('FR-042 cắt khoảng trắng, chuẩn hóa xuống dòng; từ chối rỗng/chỉ khoảng trắng/không phải chuỗi/quá dài', () => {
    expect(parseReplyText('  Dạ còn ạ.\r\nCảm ơn bạn  ')).toEqual({
      ok: true,
      text: 'Dạ còn ạ.\nCảm ơn bạn',
    });
    for (const bad of ['', '   \n\t ', undefined, null, 42]) {
      expect(parseReplyText(bad)).toEqual({ ok: false, reason: 'empty' });
    }
    expect(parseReplyText('a'.repeat(MAX_REPLY_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    });
    expect(parseReplyText('a'.repeat(MAX_REPLY_LENGTH))).toMatchObject({ ok: true });
  });

  it('FR-042 độ dài tính theo KÝ TỰ (emoji = 1), khớp char_length của DB', () => {
    expect(parseReplyText('😀'.repeat(MAX_REPLY_LENGTH))).toMatchObject({ ok: true });
    expect(parseReplyText('😀'.repeat(MAX_REPLY_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    });
  });

  it('FR-042 thuộc tính: mọi đầu vào đều không ném lỗi; kết quả ok luôn có 1..8000 ký tự và không có khoảng trắng đầu/cuối', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const result = parseReplyText(value);
        if (result.ok) {
          expect([...result.text].length).toBeGreaterThanOrEqual(1);
          expect([...result.text].length).toBeLessThanOrEqual(MAX_REPLY_LENGTH);
          expect(result.text).toBe(result.text.trim());
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('FR-042 replyErrorKey — lý do lỗi dễ hiểu', () => {
  it('FR-042 ánh xạ mọi mã đã biết; mã lạ/null → khóa chung; không bao giờ trả chuỗi có nội dung người dùng', () => {
    const known: Array<[string, string]> = [
      ['TOKEN_EXPIRED', 'tokenExpired'],
      ['PERMISSION', 'permission'],
      ['BLOCKED', 'blocked'],
      ['RATE_LIMIT', 'rateLimit'],
      ['UNKNOWN', 'unknown'],
      ['recheck:R1', 'recheckR1'],
      ['recheck:R2', 'recheckR2'],
      ['recheck:R3', 'recheckR3'],
      ['connector_unavailable', 'connectorUnavailable'],
      ['ACTION_UNSUPPORTED', 'actionUnsupported'],
      ['WINDOW_EXPIRED', 'windowExpired'],
      ['TEXT_TOO_LONG', 'textTooLong'],
      ['retries_exhausted', 'retriesExhausted'],
    ];
    for (const [code, key] of known) expect(replyErrorKey(code), code).toBe(key);
    for (const odd of [
      null,
      undefined,
      '',
      'EAAG-token-bi-mat',
      'Khách Thử nói gì đó',
      'recheck:R9',
    ]) {
      expect(replyErrorKey(odd)).toBe('generic');
    }
    for (const key of REPLY_ERROR_KEYS) expect(key).toMatch(/^[a-zA-Z0-9]+$/);
  });
});

describe('FR-042 deriveReplyUi — chế độ hộp soạn', () => {
  it('FR-042 trả lời được: compose (chưa có yêu cầu); bình luận ở new/pending_review/needs_human', () => {
    for (const status of ['new', 'pending_review', 'needs_human']) {
      expect(deriveReplyUi(detail({ status }))).toEqual({ mode: 'compose', prefill: '' });
    }
  });

  it('FR-042 đang gửi: yêu cầu queued/sending → sending (không cho soạn lại)', () => {
    for (const status of ['queued', 'sending']) {
      expect(deriveReplyUi(detail({ status: 'sending', latestReply: reply(status) }))).toEqual({
        mode: 'sending',
        text: 'Dạ còn size M ạ.',
      });
    }
  });

  it('FR-042 đã trả lời: replied/auto_replied → sent (kèm nội dung đã gửi nếu có)', () => {
    expect(deriveReplyUi(detail({ status: 'replied', latestReply: reply('sent') }))).toEqual({
      mode: 'sent',
      text: 'Dạ còn size M ạ.',
    });
    expect(deriveReplyUi(detail({ status: 'auto_replied' }))).toEqual({ mode: 'sent', text: null });
  });

  it('FR-042 gửi lỗi: send_failed → failed (mã lỗi + câu cũ để Thử lại); kênh hỏng thì Thử lại bị chặn', () => {
    const failed = detail({
      status: 'send_failed',
      latestReply: reply('failed', { errorCode: 'RATE_LIMIT' }),
    });
    expect(deriveReplyUi(failed)).toEqual({
      mode: 'failed',
      errorCode: 'RATE_LIMIT',
      prefill: 'Dạ còn size M ạ.',
      canRetry: true,
    });
    expect(deriveReplyUi({ ...failed, channelStatus: 'expired' })).toMatchObject({
      mode: 'failed',
      canRetry: false,
    });
    expect(deriveReplyUi(detail({ status: 'send_failed' }))).toMatchObject({
      mode: 'failed',
      errorCode: null,
      prefill: '',
    });
  });

  it('FR-042 bị chặn: người khác giữ khóa / kênh không connected / trạng thái không trả lời được — theo đúng thứ tự ưu tiên', () => {
    const lockedByOther = { holderId: 'u2', holderName: 'An', until: new Date(), heldByMe: false };
    expect(deriveReplyUi(detail({ lock: lockedByOther }))).toEqual({
      mode: 'blocked',
      reason: 'locked_by_other',
      holderName: 'An',
    });
    expect(deriveReplyUi(detail({ lock: { ...lockedByOther, heldByMe: true } }))).toMatchObject({
      mode: 'compose',
    });
    for (const channelStatus of ['expired', 'revoked', 'error']) {
      expect(deriveReplyUi(detail({ channelStatus }))).toEqual({
        mode: 'blocked',
        reason: 'channel_unavailable',
      });
    }
    for (const status of ['processing', 'scheduled_auto', 'skipped', 'spam_suspected', 'hidden']) {
      expect(deriveReplyUi(detail({ status }))).toEqual({
        mode: 'blocked',
        reason: 'not_replyable',
      });
    }
    // khóa của người khác ưu tiên hơn kênh hỏng
    expect(deriveReplyUi(detail({ lock: lockedByOther, channelStatus: 'expired' }))).toMatchObject({
      reason: 'locked_by_other',
    });
  });
});

describe('FR-048 deriveReplyUi — bình luận đã bị khách xóa', () => {
  it('FR-048 deleted → blocked/deleted, ưu tiên cao nhất (kể cả khi đang gửi, đã trả lời, khóa của người khác, kênh hỏng)', () => {
    const overrides: Array<Partial<ReplyUiDetail>> = [
      {},
      { status: 'replied', latestReply: reply('sent') },
      { latestReply: reply('queued') },
      { status: 'send_failed', latestReply: reply('failed') },
      { channelStatus: 'expired' },
      { lock: { holderName: 'An', heldByMe: false } },
    ];
    for (const over of overrides) {
      expect(deriveReplyUi(detail({ ...over, deleted: true }))).toEqual({
        mode: 'blocked',
        reason: 'deleted',
      });
    }
    expect(deriveReplyUi(detail({ deleted: false }))).toMatchObject({ mode: 'compose' });
  });
});
