import { describe, expect, it } from 'vitest';
import { HIDE_ERROR_KEYS, hideErrorKey } from './hide-errors';
import { deriveHideUi, type HideUiDetail } from './hide-state';

const base: HideUiDetail = {
  status: 'pending_review',
  isHidden: false,
  channelStatus: 'connected',
  supports: { hide: true, unhide: true },
  lock: null,
  latestHide: null,
};
const detail = (over: Partial<HideUiDetail> = {}): HideUiDetail => ({ ...base, ...over });
const hide = (status: string, over: Record<string, unknown> = {}) => ({
  action: 'hide' as const,
  status,
  errorCode: null as string | null,
  ...over,
});

describe('FR-044 deriveHideUi — nút Ẩn / Bỏ ẩn', () => {
  it('FR-044 bình luận bình thường → nút Ẩn; đã ẩn (nền tảng xác nhận) → nút Bỏ ẩn', () => {
    expect(deriveHideUi(detail())).toEqual({ mode: 'can', action: 'hide' });
    expect(deriveHideUi(detail({ status: 'hidden', isHidden: true }))).toEqual({
      mode: 'can',
      action: 'unhide',
    });
  });

  it('FR-044 yêu cầu đang chờ/đang gửi → "đang xử lý" đúng chiều của yêu cầu, chưa nói đã ẩn', () => {
    for (const status of ['queued', 'sending']) {
      expect(deriveHideUi(detail({ latestHide: hide(status) }))).toEqual({
        mode: 'pending',
        action: 'hide',
      });
    }
    expect(
      deriveHideUi(
        detail({
          status: 'hidden',
          isHidden: true,
          latestHide: hide('sending', { action: 'unhide' }),
        }),
      ),
    ).toEqual({ mode: 'pending', action: 'unhide' });
  });

  it('FR-044 lần gần nhất lỗi cùng chiều → hiện lỗi + Thử lại; lỗi của chiều khác/đã xong/đã hủy → bỏ qua', () => {
    expect(
      deriveHideUi(detail({ latestHide: hide('failed', { errorCode: 'RATE_LIMIT' }) })),
    ).toEqual({
      mode: 'failed',
      action: 'hide',
      errorCode: 'RATE_LIMIT',
      canRetry: true,
    });
    expect(deriveHideUi(detail({ latestHide: hide('failed', { action: 'unhide' }) }))).toEqual({
      mode: 'can',
      action: 'hide',
    });
    for (const status of ['done', 'cancelled']) {
      expect(deriveHideUi(detail({ latestHide: hide(status) }))).toEqual({
        mode: 'can',
        action: 'hide',
      });
    }
  });

  it('FR-044 không thử lại được khi kênh hỏng hoặc người khác giữ khóa', () => {
    expect(
      deriveHideUi(detail({ channelStatus: 'expired', latestHide: hide('failed') })),
    ).toMatchObject({ mode: 'failed', canRetry: false });
    expect(
      deriveHideUi(
        detail({ lock: { holderName: 'Lan', heldByMe: false }, latestHide: hide('failed') }),
      ),
    ).toMatchObject({ mode: 'failed', canRetry: false });
  });

  it('FR-044 bị chặn: người khác giữ khóa / kênh không kết nối / trạng thái không ẩn được', () => {
    expect(deriveHideUi(detail({ lock: { holderName: 'Lan', heldByMe: false } }))).toEqual({
      mode: 'blocked',
      action: 'hide',
      reason: 'locked_by_other',
      holderName: 'Lan',
    });
    expect(deriveHideUi(detail({ lock: { holderName: 'Tôi', heldByMe: true } }))).toEqual({
      mode: 'can',
      action: 'hide',
    });
    expect(deriveHideUi(detail({ channelStatus: 'revoked' }))).toMatchObject({
      mode: 'blocked',
      reason: 'channel_unavailable',
    });
    for (const status of ['processing', 'scheduled_auto', 'sending']) {
      expect(deriveHideUi(detail({ status }))).toMatchObject({
        mode: 'blocked',
        reason: 'not_hideable',
      });
    }
  });

  it('FR-044 không hiện nút khi bình luận bị khách xóa hoặc nền tảng không hỗ trợ hành động', () => {
    expect(deriveHideUi(detail({ deleted: true }))).toEqual({ mode: 'none' });
    expect(deriveHideUi(detail({ supports: { hide: false, unhide: false } }))).toEqual({
      mode: 'none',
    });
    // chỉ hỗ trợ ẩn, chưa hỗ trợ bỏ ẩn → đã ẩn thì không hiện nút Bỏ ẩn
    expect(
      deriveHideUi(
        detail({ status: 'hidden', isHidden: true, supports: { hide: true, unhide: false } }),
      ),
    ).toEqual({ mode: 'none' });
  });
});

describe('FR-044 hideErrorKey — lý do lỗi dễ hiểu', () => {
  it('FR-044 mã đã biết → khóa riêng; mã lạ/thiếu/prototype → generic; luôn nằm trong danh sách khóa', () => {
    expect(hideErrorKey('TOKEN_EXPIRED')).toBe('tokenExpired');
    expect(hideErrorKey('recheck:H3')).toBe('recheckH3');
    for (const code of [null, undefined, '', 'XYZ', '__proto__', 'constructor']) {
      expect(hideErrorKey(code)).toBe('generic');
    }
    for (const code of ['PERMISSION', 'RATE_LIMIT', 'UNKNOWN', 'connector_unavailable']) {
      expect(HIDE_ERROR_KEYS).toContain(hideErrorKey(code));
    }
  });
});
