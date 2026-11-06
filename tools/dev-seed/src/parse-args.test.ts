import { describe, expect, it } from 'vitest';
import { parseSeedArgs } from './parse-args';

describe('parseSeedArgs', () => {
  it('không tham số → tạo mới', () => {
    expect(parseSeedArgs([])).toEqual({ ok: true, options: {} });
  });
  it('--reset, --refresh, --into <email>', () => {
    expect(parseSeedArgs(['--reset'])).toEqual({ ok: true, options: { reset: true } });
    expect(parseSeedArgs(['--refresh'])).toEqual({ ok: true, options: { refresh: true } });
    expect(parseSeedArgs(['--into', 'a@b.test', '--refresh'])).toEqual({
      ok: true,
      options: { into: 'a@b.test', refresh: true },
    });
  });
  it('từ chối: thiếu/sai email, --reset kèm --refresh|--into, tham số lạ', () => {
    for (const argv of [
      ['--into'],
      ['--into', '--refresh'],
      ['--into', 'khong-phai-email'],
      ['--reset', '--refresh'],
      ['--reset', '--into', 'a@b.test'],
      ['--xoa-het'],
    ]) {
      expect(parseSeedArgs(argv).ok, argv.join(' ')).toBe(false);
    }
  });
});
