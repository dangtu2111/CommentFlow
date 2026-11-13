import { describe, expect, it } from 'vitest';
import { facebookLayout, orientationOf } from './fb-media-layout';

const WIDE = 16 / 9;
const TALL = 2 / 3;
const SQUARE = 1;

describe('orientationOf', () => {
  it('phân loại rộng / vuông / dọc; giá trị lạ → vuông', () => {
    expect(orientationOf(WIDE)).toBe('wide');
    expect(orientationOf(TALL)).toBe('tall');
    expect(orientationOf(SQUARE)).toBe('square');
    expect(orientationOf(Number.NaN)).toBe('square');
    expect(orientationOf(0)).toBe('square');
  });
});

describe('facebookLayout', () => {
  it('1 ảnh: giữ tỉ lệ gốc; ảnh dọc quá cao cắt về 4:5; ảnh quá dài giữ tối đa 3:1', () => {
    expect(facebookLayout([WIDE]).aspect).toBeCloseTo(WIDE);
    expect(facebookLayout([0.3]).aspect).toBe(0.8);
    expect(facebookLayout([6]).aspect).toBe(3);
    expect(facebookLayout([SQUARE]).aspect).toBe(1);
  });

  it('2 ảnh: cả hai ngang → trên/dưới; còn lại → cạnh nhau (cả hai dọc cao hơn)', () => {
    expect(facebookLayout([WIDE, WIDE]).rows).toBe('1fr 1fr');
    expect(facebookLayout([WIDE, TALL]).columns).toBe('1fr 1fr');
    expect(facebookLayout([TALL, TALL]).aspect).toBeCloseTo(4 / 3);
    expect(facebookLayout([SQUARE, SQUARE]).aspect).toBe(2);
  });

  it('3 ảnh: ảnh đầu ngang → ô lớn phía trên; ảnh đầu dọc/vuông → ô lớn bên trái', () => {
    const wide = facebookLayout([WIDE, TALL, TALL]);
    expect(wide.cells[0]).toEqual({ index: 0, column: '1 / 3', row: '1' });
    const tall = facebookLayout([TALL, WIDE, WIDE]);
    expect(tall.cells[0]).toEqual({ index: 0, column: '1', row: '1 / 3' });
  });

  it('4 ảnh: ngang → 1 trên + 3 dưới; dọc → 1 trái + 3 phải; vuông → 2×2', () => {
    expect(facebookLayout([WIDE, SQUARE, SQUARE, SQUARE]).cells[0]?.column).toBe('1 / 4');
    expect(facebookLayout([TALL, SQUARE, SQUARE, SQUARE]).cells[0]?.row).toBe('1 / 4');
    expect(facebookLayout([SQUARE, SQUARE, SQUARE, SQUARE]).columns).toBe('1fr 1fr');
  });

  it('từ 5 ảnh: 5 ô (2 trên + 3 dưới), phần dư ghi "+N"', () => {
    const five = facebookLayout(Array.from({ length: 5 }, () => SQUARE));
    expect(five.cells).toHaveLength(5);
    expect(five.extra).toBe(0);
    expect(facebookLayout(Array.from({ length: 10 }, () => SQUARE)).extra).toBe(5);
  });

  it('không có ảnh nào vượt ngoài lưới; mọi ô có chỉ số riêng', () => {
    for (let n = 1; n <= 10; n++) {
      const layout = facebookLayout(Array.from({ length: n }, () => SQUARE));
      const indexes = layout.cells.map((c) => c.index);
      expect(new Set(indexes).size).toBe(indexes.length);
      expect(layout.cells.length).toBe(Math.min(n, 5));
    }
  });
});
