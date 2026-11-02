import { describe, expect, it } from 'vitest';
import { AppError, isAppError } from './errors';

describe('AppError', () => {
  it('mang mã lỗi, thông báo dễ hiểu và mã HTTP tương ứng', () => {
    const error = new AppError('NOT_FOUND', 'Không tìm thấy bình luận');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Không tìm thấy bình luận');
    expect(error.httpStatus).toBe(404);
    expect(error).toBeInstanceOf(Error);
  });

  it('giữ nguyên nguyên nhân gốc để truy vết', () => {
    const cause = new Error('connection refused');
    const error = new AppError('LLM_UNAVAILABLE', 'Dịch vụ AI tạm thời không dùng được', { cause });
    expect(error.cause).toBe(cause);
    expect(error.httpStatus).toBe(503);
  });

  it('isAppError nhận đúng lỗi của hệ thống, loại lỗi thường', () => {
    expect(isAppError(new AppError('INTERNAL', 'Lỗi hệ thống'))).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
    expect(isAppError({ code: 'INTERNAL' })).toBe(false);
  });

  it('toJSON chỉ lộ mã và thông báo, không lộ nguyên nhân gốc', () => {
    const error = new AppError('INTERNAL', 'Lỗi hệ thống', { cause: new Error('password=abc') });
    expect(JSON.stringify(error)).toBe('{"code":"INTERNAL","message":"Lỗi hệ thống"}');
  });
});
