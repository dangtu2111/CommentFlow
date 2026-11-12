import { describe, expect, it } from 'vitest';
import { filterPages, rowState, selectionState } from './fb-page-select';

const pages = [
  { id: '111', name: 'An Nhiên Store', connected: false, usable: true },
  { id: '222', name: 'Tiệm Đồ Linen', connected: false, usable: true },
  { id: '333', name: 'An Nhiên Kids', connected: true, usable: true },
  { id: '444', name: 'Kho Gia Dụng', connected: false, usable: false },
];

describe('filterPages', () => {
  it('không từ khóa → giữ nguyên; tìm theo tên (không phân biệt hoa/thường/dấu) hoặc theo ID', () => {
    expect(filterPages(pages, '')).toHaveLength(4);
    expect(filterPages(pages, '  ')).toHaveLength(4);
    expect(filterPages(pages, 'an nhien').map((p) => p.id)).toEqual(['111', '333']);
    expect(filterPages(pages, 'LINEN').map((p) => p.id)).toEqual(['222']);
    expect(filterPages(pages, '444').map((p) => p.id)).toEqual(['444']);
    expect(filterPages(pages, 'không có').map((p) => p.id)).toEqual([]);
  });
});

describe('rowState', () => {
  it('đã kết nối → connected (khóa); không có quyền quản lý → blocked; còn lại → selectable', () => {
    expect(rowState(pages[0] as (typeof pages)[number])).toBe('selectable');
    expect(rowState(pages[2] as (typeof pages)[number])).toBe('connected');
    expect(rowState(pages[3] as (typeof pages)[number])).toBe('blocked');
  });
});

describe('selectionState — hạn mức kênh', () => {
  it('đếm số Page mới đã chọn, hạn mức còn lại, cho phép gửi khi có chọn và không vượt hạn mức', () => {
    expect(selectionState({ selected: [], used: 2, limit: 3 })).toEqual({
      count: 0,
      remaining: 1,
      overLimit: false,
      canSubmit: false,
    });
    expect(selectionState({ selected: ['111'], used: 2, limit: 3 })).toEqual({
      count: 1,
      remaining: 0,
      overLimit: false,
      canSubmit: true,
    });
  });

  it('vượt hạn mức → không gửi được, hạn mức còn lại không âm', () => {
    expect(selectionState({ selected: ['111', '222'], used: 2, limit: 3 })).toEqual({
      count: 2,
      remaining: 0,
      overLimit: true,
      canSubmit: false,
    });
  });

  it('loại trùng id và hạn mức vô hạn (Infinity) luôn đủ', () => {
    expect(selectionState({ selected: ['111', '111'], used: 0, limit: 5 }).count).toBe(1);
    expect(
      selectionState({ selected: ['1', '2', '3'], used: 10, limit: Number.POSITIVE_INFINITY })
        .canSubmit,
    ).toBe(true);
  });
});
