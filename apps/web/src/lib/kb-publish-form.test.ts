import { describe, expect, it } from 'vitest';
import { parseKbPublishForm } from './kb-publish-form';

const form = (entries: Record<string, string>) => ({
  get: (k: string) => (k in entries ? entries[k] : null),
});

describe('FR-054 UF-8 parseKbPublishForm', () => {
  it('xuất bản: ghi chú cắt khoảng trắng, chưa tick xác nhận', () => {
    expect(parseKbPublishForm(form({ intent: 'publish', note: '  đổi giá ship ' }))).toEqual({
      ok: true,
      action: { intent: 'publish', note: 'đổi giá ship', confirmed: false },
    });
  });

  it('tick xác nhận → confirmed', () => {
    expect(parseKbPublishForm(form({ intent: 'publish', confirm: 'on' }))).toMatchObject({
      ok: true,
      action: { confirmed: true, note: null },
    });
  });

  it('khôi phục cần số phiên bản nguyên dương', () => {
    expect(
      parseKbPublishForm(form({ intent: 'restore', versionNumber: '3', confirm: 'on' })),
    ).toEqual({
      ok: true,
      action: { intent: 'restore', versionNumber: 3, note: null, confirmed: true },
    });
    for (const bad of ['0', '-1', '1.5', 'abc', '', '99999999999']) {
      expect(parseKbPublishForm(form({ intent: 'restore', versionNumber: bad }))).toEqual({
        ok: false,
        code: 'bad_request',
      });
    }
  });

  it('ý định lạ hoặc thiếu → bad_request', () => {
    expect(parseKbPublishForm(form({ intent: 'delete' }))).toEqual({
      ok: false,
      code: 'bad_request',
    });
    expect(parseKbPublishForm(form({}))).toEqual({ ok: false, code: 'bad_request' });
  });

  it('ghi chú quá 500 ký tự → invalid_note', () => {
    expect(parseKbPublishForm(form({ intent: 'publish', note: 'x'.repeat(501) }))).toEqual({
      ok: false,
      code: 'invalid_note',
    });
  });
});
