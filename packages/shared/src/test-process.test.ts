import { afterEach, describe, expect, it } from 'vitest';
import {
  allowMockInThisProcess,
  assertMockAllowed,
  isTestProcess,
  mockAllowedReason,
  resetMockAllowanceForTests,
} from './test-process';

afterEach(() => resetMockAllowanceForTests());

describe('chốt chặn: bản giả chỉ cho test tự động', () => {
  it('nhận ra tiến trình test (VITEST hoặc NODE_ENV=test); web/worker thường thì không', () => {
    expect(isTestProcess({ VITEST: 'true' })).toBe(true);
    expect(isTestProcess({ NODE_ENV: 'test' })).toBe(true);
    for (const env of [
      {},
      { NODE_ENV: 'development' },
      { NODE_ENV: 'production' },
      { APP_ENV: 'dev' },
      { APP_ENV: 'staging' },
    ]) {
      expect(isTestProcess(env)).toBe(false);
    }
  });

  it('tiến trình KHÔNG phải test nạp bản giả → lỗi ngay, nêu tên bản giả', () => {
    expect(() => assertMockAllowed('createFixtureEmbedder', { NODE_ENV: 'production' })).toThrow(
      /createFixtureEmbedder/,
    );
    expect(() => assertMockAllowed('createFixtureEmbedder', { APP_ENV: 'dev' })).toThrow(/bản giả/);
  });

  it('tiến trình test được nạp bản giả; không có đường chọn bằng biến môi trường ngoài VITEST/NODE_ENV=test', () => {
    expect(() => assertMockAllowed('x', { VITEST: 'true' })).not.toThrow();
    // Các biến "cho phép mock" tự đặt KHÔNG có tác dụng.
    expect(() =>
      assertMockAllowed('x', { ALLOW_MOCK: 'true', MOCK: '1', USE_MOCK: 'true', APP_ENV: 'dev' }),
    ).toThrow();
  });

  it('công cụ đo tự khai báo bằng hàm (không bằng môi trường) thì được nạp, và lý do được ghi', () => {
    expect(() => assertMockAllowed('x', {})).toThrow();
    allowMockInThisProcess('EVAL --backend mock (CI): không phải số đo chất lượng');
    expect(() => assertMockAllowed('x', {})).not.toThrow();
    expect(mockAllowedReason()).toContain('không phải số đo');
  });
});
