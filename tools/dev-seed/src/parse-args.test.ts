import { describe, expect, it } from 'vitest';
import { parseSeedArgs } from './parse-args';

describe('parseSeedArgs', () => {
  it('không tham số → tạo mới', () => {
    expect(parseSeedArgs([])).toEqual({ ok: true, options: {} });
  });
  it('--reset và --refresh', () => {
    expect(parseSeedArgs(['--reset'])).toEqual({ ok: true, options: { reset: true } });
    expect(parseSeedArgs(['--refresh'])).toEqual({ ok: true, options: { refresh: true } });
  });
  it('từ chối --reset kèm --refresh và tham số lạ', () => {
    for (const argv of [['--reset', '--refresh'], ['--xoa-het']]) {
      expect(parseSeedArgs(argv).ok, argv.join(' ')).toBe(false);
    }
  });
  it('--into đã BỎ: seed chỉ ghi vào workspace [MẪU], báo lỗi rõ và nêu lý do', () => {
    for (const argv of [['--into', 'a@b.test'], ['--into'], ['--refresh', '--into', 'a@b.test']]) {
      const parsed = parseSeedArgs(argv);
      expect(parsed.ok, argv.join(' ')).toBe(false);
      if (!parsed.ok) expect(parsed.error).toMatch(/--into.*bỏ|chỉ ghi vào workspace/);
    }
  });
});
