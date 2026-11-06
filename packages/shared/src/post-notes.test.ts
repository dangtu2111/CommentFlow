import { describe, expect, it } from 'vitest';
import {
  effectiveAutoMode,
  POST_NOTE_MAX,
  parsePostAutoOverride,
  parsePostNoteInput,
  postNoteStatus,
} from './post-notes';

const T = (s: string) => new Date(s);
const NOW = T('2026-11-06T10:00:00Z');

describe('FR-062 / US-033 parsePostNoteInput', () => {
  it('chuẩn hóa nội dung (NFC, gộp khoảng trắng) và nhận ngày dạng chuỗi hoặc Date', () => {
    const r = parsePostNoteInput({
      content: '  Giá   livestream\n 199k  ',
      validFrom: '2026-11-06T09:00:00Z',
      validTo: T('2026-11-07T00:00:00Z'),
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.content).toBe('Giá livestream 199k');
    expect(r.data.validFrom).toEqual(T('2026-11-06T09:00:00Z'));
    expect(r.data.validTo).toEqual(T('2026-11-07T00:00:00Z'));
  });

  it('không có ngày → null (DB lấy now() cho validFrom; không hạn cho validTo)', () => {
    const r = parsePostNoteInput({ content: 'x' });
    expect(r.success && r.data).toMatchObject({ validFrom: null, validTo: null });
  });

  it('từ chối: nội dung rỗng/toàn khoảng trắng, quá dài, ngày không hợp lệ', () => {
    expect(parsePostNoteInput({ content: '   ' }).success).toBe(false);
    expect(parsePostNoteInput({ content: 'a'.repeat(POST_NOTE_MAX + 1) }).success).toBe(false);
    expect(parsePostNoteInput({ content: 'a'.repeat(POST_NOTE_MAX) }).success).toBe(true);
    expect(parsePostNoteInput({ content: 'x', validTo: 'không phải ngày' }).success).toBe(false);
    expect(parsePostNoteInput({ content: 'x', validFrom: 'nope' }).success).toBe(false);
    expect(parsePostNoteInput({ content: 'x', validTo: new Date('nope') }).success).toBe(false);
  });

  it('hạn phải sau ngày bắt đầu (bằng nhau cũng từ chối: khoảng rỗng)', () => {
    const f = '2026-11-06T09:00:00Z';
    expect(parsePostNoteInput({ content: 'x', validFrom: f, validTo: f }).success).toBe(false);
    expect(
      parsePostNoteInput({ content: 'x', validFrom: f, validTo: '2026-11-06T08:59:59Z' }).success,
    ).toBe(false);
    expect(
      parsePostNoteInput({ content: 'x', validFrom: f, validTo: '2026-11-06T09:00:01Z' }).success,
    ).toBe(true);
  });
});

describe('FR-062 postNoteStatus (hết hạn thì không dùng)', () => {
  const note = (validFrom: string, validTo: string | null) => ({
    validFrom: T(validFrom),
    validTo: validTo ? T(validTo) : null,
  });
  it('đúng biên: bắt đầu tính (>=), kết thúc loại (<)', () => {
    const n = note('2026-11-06T10:00:00Z', '2026-11-06T12:00:00Z');
    expect(postNoteStatus(n, T('2026-11-06T09:59:59.999Z'))).toBe('scheduled');
    expect(postNoteStatus(n, T('2026-11-06T10:00:00Z'))).toBe('active');
    expect(postNoteStatus(n, T('2026-11-06T11:59:59.999Z'))).toBe('active');
    expect(postNoteStatus(n, T('2026-11-06T12:00:00Z'))).toBe('expired');
  });
  it('không hạn → luôn active sau validFrom', () => {
    expect(postNoteStatus(note('2026-01-01T00:00:00Z', null), NOW)).toBe('active');
  });
});

describe('FR-062 parsePostAutoOverride', () => {
  it('chỉ nhận off | shadow | null (không bao giờ nới thành auto)', () => {
    expect(parsePostAutoOverride('off')).toEqual({ success: true, data: 'off' });
    expect(parsePostAutoOverride('shadow')).toEqual({ success: true, data: 'shadow' });
    expect(parsePostAutoOverride(null)).toEqual({ success: true, data: null });
    expect(parsePostAutoOverride('auto').success).toBe(false);
    expect(parsePostAutoOverride('').success).toBe(false);
    expect(parsePostAutoOverride(undefined).success).toBe(false);
  });
});

describe('FR-062 effectiveAutoMode (ghi đè chỉ siết)', () => {
  it('không ghi đè → giữ chế độ nền', () => {
    for (const m of ['off', 'shadow', 'auto'] as const) expect(effectiveAutoMode(m, null)).toBe(m);
  });
  it('ghi đè off → luôn off; shadow → hạ auto xuống shadow, không nâng off lên', () => {
    expect(effectiveAutoMode('auto', 'off')).toBe('off');
    expect(effectiveAutoMode('shadow', 'off')).toBe('off');
    expect(effectiveAutoMode('off', 'off')).toBe('off');
    expect(effectiveAutoMode('auto', 'shadow')).toBe('shadow');
    expect(effectiveAutoMode('shadow', 'shadow')).toBe('shadow');
    expect(effectiveAutoMode('off', 'shadow')).toBe('off');
  });
});
