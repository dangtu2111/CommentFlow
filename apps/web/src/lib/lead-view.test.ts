import { describe, expect, it } from 'vitest';
import { groupLeadsByStage, LEAD_STAGES, leadInitials, maskedPhone } from './lead-view';

describe('LEADS-KANBAN giao diện: gom thẻ theo cột', () => {
  it('luôn đủ 4 cột theo thứ tự cố định, cột trống là mảng rỗng, giữ thứ tự đầu vào', () => {
    expect(LEAD_STAGES).toEqual(['new', 'contacted', 'won', 'lost']);
    const rows = [
      { id: 'a', stage: 'won' as const },
      { id: 'b', stage: 'new' as const },
      { id: 'c', stage: 'won' as const },
    ];
    const grouped = groupLeadsByStage(rows);
    expect(Object.keys(grouped)).toEqual(['new', 'contacted', 'won', 'lost']);
    expect(grouped.won.map((r) => r.id)).toEqual(['a', 'c']);
    expect(grouped.contacted).toEqual([]);
    expect(grouped.lost).toEqual([]);
  });
});

describe('LEADS-KANBAN giao diện: che số điện thoại (nguyên tắc #6)', () => {
  it('chỉ hiện 4 số cuối; đầu vào không phải 4 chữ số → null', () => {
    expect(maskedPhone('1234')).toBe('•••• 1234');
    expect(maskedPhone(null)).toBeNull();
    expect(maskedPhone('12345')).toBeNull();
    expect(maskedPhone('09123456')).toBeNull();
    expect(maskedPhone('abcd')).toBeNull();
  });

  it('chữ viết tắt: tên trống/null → "?"', () => {
    expect(leadInitials('Trần Thu Thảo')).toBe('TT');
    expect(leadInitials(null)).toBe('?');
    expect(leadInitials('  ')).toBe('?');
  });
});
