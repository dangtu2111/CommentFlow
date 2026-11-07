import { describe, expect, it } from 'vitest';
import { TRY_AI_MAX_CHARS } from './try-ai-limits';
import { initialTryAiText } from './try-ai-prefill';

describe('initialTryAiText (câu hỏi điền sẵn từ ?q=)', () => {
  it('chuỗi bình thường → giữ nguyên, bỏ khoảng trắng hai đầu', () => {
    expect(initialTryAiText('  Shop có freeship không?  ')).toBe('Shop có freeship không?');
  });

  it('mảng (?q=a&q=b) → lấy phần tử đầu', () => {
    expect(initialTryAiText(['a', 'b'])).toBe('a');
  });

  it('thiếu/không phải chuỗi → rỗng', () => {
    expect(initialTryAiText(undefined)).toBe('');
    expect(initialTryAiText([])).toBe('');
  });

  it('cắt tối đa TRY_AI_MAX_CHARS ký tự (không để URL dài làm tràn ô nhập)', () => {
    expect(initialTryAiText('x'.repeat(TRY_AI_MAX_CHARS + 500))).toHaveLength(TRY_AI_MAX_CHARS);
  });

  it('bỏ ký tự điều khiển (xuống dòng giữ lại, các mã khác loại)', () => {
    expect(initialTryAiText('a\u0000b\u0007c\nd')).toBe('abc\nd');
  });
});
