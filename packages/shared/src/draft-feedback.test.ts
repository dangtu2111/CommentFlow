import { describe, expect, it } from 'vitest';
import {
  buildSourceChips,
  classifyDraftOutcome,
  editDistance,
  SOURCE_CHIP_MAX,
} from './draft-feedback';

describe('FR-043 editDistance — khoảng cách sửa (ký tự Unicode)', () => {
  it('FR-043 ca biên: rỗng, giống nhau, một ký tự, dấu tiếng Việt, emoji', () => {
    expect(editDistance('', '')).toBe(0);
    expect(editDistance('abc', '')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('còn hàng', 'còn hàng')).toBe(0);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('ạ', 'a')).toBe(1);
    expect(editDistance('a😀', 'a')).toBe(1);
  });

  it('FR-043 tính chất: d(x,x)=0, đối xứng, không vượt độ dài chuỗi dài hơn (mẫu cố định)', () => {
    const samples = [
      '',
      'a',
      'ạ',
      'Dạ còn size M ạ.',
      'còn hàng 😀',
      'x'.repeat(30),
      'Dạ hết rồi ạ',
    ];
    for (const a of samples) {
      for (const b of samples) {
        expect(editDistance(a, a)).toBe(0);
        expect(editDistance(a, b)).toBe(editDistance(b, a));
        expect(editDistance(a, b)).toBeLessThanOrEqual(Math.max([...a].length, [...b].length));
      }
    }
  });
});

describe('FR-043 classifyDraftOutcome — gửi nguyên văn hay đã sửa', () => {
  it('FR-043 trùng bản AI (bỏ khoảng trắng đầu/cuối, chuẩn hóa xuống dòng) → sent_as_is', () => {
    expect(
      classifyDraftOutcome('Dạ còn size M ạ.\nCảm ơn bạn', '  Dạ còn size M ạ.\r\nCảm ơn bạn \n'),
    ).toEqual({
      status: 'sent_as_is',
      finalText: 'Dạ còn size M ạ.\nCảm ơn bạn',
      editDistance: 0,
    });
  });

  it('FR-043 khác bản AI → edited kèm editDistance và bản gửi đã chuẩn hóa', () => {
    expect(classifyDraftOutcome('Dạ còn ạ', ' Dạ hết rồi ạ ')).toEqual({
      status: 'edited',
      finalText: 'Dạ hết rồi ạ',
      editDistance: editDistance('Dạ còn ạ', 'Dạ hết rồi ạ'),
    });
  });

  it('FR-043 chỉ đổi hoa/thường cũng tính là đã sửa', () => {
    expect(classifyDraftOutcome('Dạ còn ạ', 'dạ còn ạ').status).toBe('edited');
  });
});

describe('FR-043 buildSourceChips — chip nguồn của gợi ý', () => {
  const titles = { a: 'Bảng size áo', b: 'Chính sách đổi trả' };

  it('FR-043 giữ thứ tự, bỏ trùng, id → tên; id lạ → nhãn null (giao diện tự dịch)', () => {
    expect(buildSourceChips(['b', 'a', 'b', 'zzz'], titles)).toEqual({
      chips: [
        { id: 'b', label: 'Chính sách đổi trả' },
        { id: 'a', label: 'Bảng size áo' },
        { id: 'zzz', label: null },
      ],
      more: 0,
    });
  });

  it(`FR-043 tối đa ${SOURCE_CHIP_MAX} chip; phần còn lại đếm vào more`, () => {
    const ids = Array.from({ length: SOURCE_CHIP_MAX + 3 }, (_, i) => `s${i}`);
    const r = buildSourceChips(ids, {});
    expect(r.chips).toHaveLength(SOURCE_CHIP_MAX);
    expect(r.more).toBe(3);
  });

  it('FR-043 cắt nhãn quá dài, bỏ id rỗng, đầu vào không phải mảng → không chip', () => {
    const r = buildSourceChips(['l', ''], { l: 'x'.repeat(100) });
    expect(r.chips).toHaveLength(1);
    expect([...(r.chips[0]?.label ?? '')].length).toBeLessThanOrEqual(40);
    expect(r.chips[0]?.label?.endsWith('…')).toBe(true);
    expect(buildSourceChips(null, {})).toEqual({ chips: [], more: 0 });
    expect(buildSourceChips('a', {})).toEqual({ chips: [], more: 0 });
  });
});
