import { describe, expect, it } from 'vitest';
import { diagnoseFbSystemToken, parseFbSystemToken } from './fb-system-token-form';

describe('parseFbSystemToken', () => {
  it('nhận token Meta hợp lệ (chữ/số/_/-), cắt khoảng trắng đầu cuối', () => {
    const token = `EAAB${'x'.repeat(60)}`;
    expect(parseFbSystemToken(`  ${token}\n`)).toBe(token);
  });

  it('nhận token DÀI (token nhiều quyền có thể vượt 400 ký tự) tới 2048 ký tự', () => {
    expect(parseFbSystemToken(`EAAB${'x'.repeat(600)}`)).not.toBeNull();
    expect(parseFbSystemToken(`EAAB${'x'.repeat(2044)}`)).not.toBeNull();
    expect(parseFbSystemToken(`EAAB${'x'.repeat(2045)}`)).toBeNull();
  });

  it('từ chối rỗng, quá ngắn, có khoảng trắng/ký tự lạ/xuống dòng giữa chừng, URL', () => {
    for (const bad of [
      '',
      '   ',
      'EAAB123',
      `EAAB${'x'.repeat(30)} ${'y'.repeat(30)}`,
      `EAAB${'x'.repeat(30)}\n${'y'.repeat(30)}`,
      `EAAB${'x'.repeat(30)}"; DROP TABLE x;--`,
      `https://graph.facebook.com/?access_token=EAAB${'x'.repeat(40)}`,
    ]) {
      expect(parseFbSystemToken(bad), bad.slice(0, 20)).toBeNull();
    }
  });
});

describe('diagnoseFbSystemToken — chỉ trả LOẠI lý do, không bao giờ trả giá trị', () => {
  it('phân loại: trống, quá ngắn, quá dài, ký tự lạ (kể cả khoảng trắng/xuống dòng giữa chừng), hợp lệ', () => {
    expect(diagnoseFbSystemToken('   ')).toBe('empty');
    expect(diagnoseFbSystemToken('EAAB123')).toBe('too_short');
    expect(diagnoseFbSystemToken(`EAAB${'x'.repeat(2100)}`)).toBe('too_long');
    expect(diagnoseFbSystemToken(`EAAB${'x'.repeat(40)} ${'y'.repeat(40)}`)).toBe('bad_chars');
    expect(diagnoseFbSystemToken(`EAAB${'x'.repeat(40)}\n${'y'.repeat(40)}`)).toBe('bad_chars');
    expect(diagnoseFbSystemToken(`EAAB${'x'.repeat(60)}`)).toBe('ok');
  });
});
