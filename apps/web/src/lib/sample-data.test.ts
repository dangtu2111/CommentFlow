import { describe, expect, it } from 'vitest';
import { showSampleData } from './sample-data';

describe('UI-first showSampleData', () => {
  it('chỉ bật khi APP_ENV=dev', () => {
    expect(showSampleData({ APP_ENV: 'dev' })).toBe(true);
  });
  it.each(['staging', 'production', 'test', 'ci', undefined, ''])('tắt khi APP_ENV=%s', (v) => {
    expect(showSampleData({ APP_ENV: v })).toBe(false);
  });
  it('bản dev chạy `next start` (NODE_ENV=production) vẫn bật, vì môi trường do APP_ENV quyết định', () => {
    expect(showSampleData({ APP_ENV: 'dev', NODE_ENV: 'production' })).toBe(true);
  });
});
