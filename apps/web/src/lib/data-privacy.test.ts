import { describe, expect, it } from 'vitest';
import { isDeletionConfirmed } from './data-privacy';

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
