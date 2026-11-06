import { describe, expect, it } from 'vitest';
import { exportNoticeOf, isDeletionConfirmed, parsePrivacyNotice } from './data-privacy';

describe('FR-094 thông báo trang Quyền riêng tư', () => {
  it('FR-094 kết quả xuất → đúng thông báo', () => {
    expect(exportNoticeOf({ ok: true })).toBe('export_queued');
    expect(exportNoticeOf({ ok: false, reason: 'already_active' })).toBe('already_active');
    expect(exportNoticeOf({ ok: false, reason: 'rate_limited' })).toBe('rate_limited');
    expect(exportNoticeOf({ ok: false, reason: 'unavailable' })).toBe('unavailable');
  });
  it('FR-094 chỉ nhận thông báo trong danh sách', () => {
    expect(parsePrivacyNotice('export_queued')).toBe('export_queued');
    expect(parsePrivacyNotice('<script>')).toBeNull();
    expect(parsePrivacyNotice(['mismatch'])).toBeNull();
    expect(parsePrivacyNotice(undefined)).toBeNull();
  });
});

describe('FR-094 US-071 xác nhận yêu cầu xóa workspace (chỉ giao diện/interface)', () => {
  it('đúng khi gõ đúng tên workspace (bỏ khoảng trắng đầu/cuối, không phân biệt hoa thường)', () => {
    expect(isDeletionConfirmed('  an nhien store ', 'An Nhien Store')).toBe(true);
  });
  it('sai khi khác tên hoặc rỗng', () => {
    expect(isDeletionConfirmed('An Nhien', 'An Nhien Store')).toBe(false);
    expect(isDeletionConfirmed('', '')).toBe(false);
    expect(isDeletionConfirmed('   ', '   ')).toBe(false);
  });
});
