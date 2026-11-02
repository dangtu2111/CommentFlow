import { describe, expect, it } from 'vitest';
import { getMessages } from './messages';

describe('getMessages', () => {
  it('trả đúng bản dịch theo ngôn ngữ', () => {
    expect(getMessages('vi').home.title).toBe('Quản lý bình luận bằng AI');
    expect(getMessages('en').home.title).toBe('AI-powered comment management');
  });
});
