import { describe, expect, it } from 'vitest';
import { COMMENT_LABELS, isCommentLabel } from './comment-labels';

describe('isCommentLabel', () => {
  it.each(COMMENT_LABELS)('nhận khóa chuẩn %s', (label) => {
    expect(isCommentLabel(label)).toBe(true);
  });

  it.each(['', 'Price', 'unknown', 'price '])('từ chối chuỗi lạ %j', (value) => {
    expect(isCommentLabel(value)).toBe(false);
  });

  it.each([undefined, null, 1, {}, ['price']])('từ chối giá trị không phải chuỗi %j', (value) => {
    expect(isCommentLabel(value)).toBe(false);
  });
});
