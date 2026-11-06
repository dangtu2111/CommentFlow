import { describe, expect, it } from 'vitest';
import { type KeyInfo, resolveBulkShortcut } from './bulk-shortcuts';

const key = (k: string, over: Partial<KeyInfo> = {}): KeyInfo => ({
  key: k,
  ctrl: false,
  meta: false,
  alt: false,
  typing: false,
  ...over,
});

describe('FR-045 phím tắt hành động hàng loạt (docs/08)', () => {
  it('FR-045 J/K đổi dòng, X chọn dòng đang trỏ (không phân biệt hoa/thường)', () => {
    expect(resolveBulkShortcut(key('j'), 0)).toBe('focus_next');
    expect(resolveBulkShortcut(key('K'), 0)).toBe('focus_prev');
    expect(resolveBulkShortcut(key('x'), 0)).toBe('toggle_focused');
  });

  it('FR-045 H chỉ MỞ hộp xác nhận ẩn và chỉ khi đã có chọn; không bao giờ ẩn trực tiếp', () => {
    expect(resolveBulkShortcut(key('h'), 2)).toBe('open_hide_confirm');
    expect(resolveBulkShortcut(key('h'), 0)).toBeNull();
  });

  it('FR-045 Esc bỏ chọn khi có chọn; không có chọn thì bỏ qua', () => {
    expect(resolveBulkShortcut(key('Escape'), 3)).toBe('clear');
    expect(resolveBulkShortcut(key('Escape'), 0)).toBeNull();
  });

  it('FR-045 đang gõ trong ô nhập hoặc có phím bổ trợ → không bắt phím', () => {
    expect(resolveBulkShortcut(key('h', { typing: true }), 2)).toBeNull();
    expect(resolveBulkShortcut(key('j', { typing: true }), 0)).toBeNull();
    for (const mod of [{ ctrl: true }, { meta: true }, { alt: true }]) {
      expect(resolveBulkShortcut(key('h', mod), 2)).toBeNull();
    }
  });

  it('FR-045 phím khác (kể cả E/M chưa rõ nghĩa) → null', () => {
    for (const k of ['e', 'm', 'Enter', 'a']) expect(resolveBulkShortcut(key(k), 2)).toBeNull();
  });
});
