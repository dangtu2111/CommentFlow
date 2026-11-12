import { describe, expect, it } from 'vitest';
import { parseFbSystemToken } from './fb-system-token-form';

describe('parseFbSystemToken', () => {
  it('nhận token Meta hợp lệ (chữ/số/_/-), cắt khoảng trắng đầu cuối', () => {
    const token = `EAAB${'x'.repeat(60)}`;
    expect(parseFbSystemToken(`  ${token}\n`)).toBe(token);
  });

  it('từ chối rỗng, quá ngắn, quá dài, có khoảng trắng/ký tự lạ/xuống dòng giữa chừng', () => {
    for (const bad of [
      '',
      '   ',
      'EAAB123',
      `EAAB${'x'.repeat(2000)}`,
      `EAAB${'x'.repeat(30)} ${'y'.repeat(30)}`,
      `EAAB${'x'.repeat(30)}\n${'y'.repeat(30)}`,
      `EAAB${'x'.repeat(30)}"; DROP TABLE x;--`,
      `https://graph.facebook.com/?access_token=EAAB${'x'.repeat(40)}`,
    ]) {
      expect(parseFbSystemToken(bad), bad.slice(0, 20)).toBeNull();
    }
  });
});
