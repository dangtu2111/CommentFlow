import { describe, expect, it } from 'vitest';
import { userInitials } from './user-initials';

describe('FR-040 chữ viết tắt của thẻ người dùng ở khung ứng dụng', () => {
  it('FR-040 lấy chữ đầu của từ đầu và từ cuối, viết hoa (tiếng Việt có dấu giữ nguyên)', () => {
    expect(userInitials('Nguyễn Mai Linh')).toBe('NL');
    expect(userInitials('đặng anh tú')).toBe('ĐT');
  });

  it('FR-040 một từ → một chữ; rỗng/khoảng trắng → dấu hỏi chấm, không ném lỗi', () => {
    expect(userInitials('Linh')).toBe('L');
    expect(userInitials('   ')).toBe('?');
    expect(userInitials('')).toBe('?');
  });

  it('FR-040 bỏ khoảng trắng thừa và ký tự ghép (emoji) không bị cắt nửa', () => {
    expect(userInitials('  An   Bình ')).toBe('AB');
    expect(userInitials('😀 Bình')).toBe('😀B');
  });
});
