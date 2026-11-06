import { AppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { describeSeedError } from './describe-error';

describe('describeSeedError', () => {
  it('hiện lỗi Postgres gốc (cause), không hiện câu SQL', () => {
    const cause = Object.assign(new Error('permission denied for table products'), {
      code: '42501',
      table: 'products',
    });
    const error = new Error('Failed query: insert into cf.products ... params: secret', { cause });
    const text = describeSeedError(error);
    expect(text).toContain('permission denied for table products');
    expect(text).toContain('code=42501');
    expect(text).not.toContain('secret');
  });

  it('lỗi nghiệp vụ giữ mã', () => {
    expect(describeSeedError(new AppError('FORBIDDEN', 'Từ chối'))).toBe('[FORBIDDEN] Từ chối');
  });
});
