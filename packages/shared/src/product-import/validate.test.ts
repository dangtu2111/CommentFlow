import { describe, expect, it } from 'vitest';
import type { ColumnTarget } from './mapping';
import { parseStock, parseVndAmount, validateImportTable } from './validate';

const MAP: ColumnTarget[] = ['productName', 'sku', 'price', 'stock', 'attribute', 'attribute'];
const HEAD = ['Tên', 'SKU', 'Giá', 'Tồn', 'Màu', 'Size'];

describe('FR-051 đọc số tiền', () => {
  it.each([
    ['150000', 150000],
    ['150.000', 150000],
    ['150,000', 150000],
    ['1.500.000', 1500000],
    ['150000đ', 150000],
    ['150.000 ₫', 150000],
    ['VND 150000', 150000],
    ['150000.00', 150000],
    ['0', 0],
    ['', null],
    ['   ', null],
  ])('%s → %s', (raw, expected) => {
    expect(parseVndAmount(raw)).toBe(expected);
  });

  it.each(['-5', 'abc', '12,5', '1.5', '1e5', '1.23.45', '9999999999999'])(
    '%s không hợp lệ',
    (raw) => {
      expect(parseVndAmount(raw)).toBe('invalid');
    },
  );

  it('tồn kho: số nguyên không âm; "12.0" chấp nhận; rỗng → null', () => {
    expect(parseStock('12')).toBe(12);
    expect(parseStock('12.0')).toBe(12);
    expect(parseStock('')).toBeNull();
    expect(parseStock('-1')).toBe('invalid');
    expect(parseStock('1.5')).toBe('invalid');
    expect(parseStock('abc')).toBe('invalid');
    expect(parseStock('99999999999')).toBe('invalid');
  });
});

describe('FR-051 kiểm từng dòng', () => {
  it('dòng hợp lệ → bản ghi chuẩn hóa; dòng trống bị bỏ; số dòng tính theo bảng (tiêu đề = dòng 1)', () => {
    const table = [
      HEAD,
      ['Áo thun', 'AT-D-M', '150.000', '10', 'Đen', 'M'],
      ['', '', '', '', '', ''],
      ['Áo thun', 'AT-T-M', '150000đ', '', 'Trắng', ''],
    ];
    const result = validateImportTable(table, MAP);
    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(2);
    expect(result.records).toEqual([
      {
        row: 2,
        productKey: 'ao thun',
        productName: 'Áo thun',
        productCode: null,
        category: null,
        url: null,
        sku: 'AT-D-M',
        attrs: { Màu: 'Đen', Size: 'M' },
        priceVnd: 150000,
        compareAtVnd: null,
        stock: 10,
      },
      {
        row: 4,
        productKey: 'ao thun',
        productName: 'Áo thun',
        productCode: null,
        category: null,
        url: null,
        sku: 'AT-T-M',
        attrs: { Màu: 'Trắng' },
        priceVnd: 150000,
        compareAtVnd: null,
        stock: null,
      },
    ]);
  });

  it('mã sản phẩm, danh mục, link, giá gốc được đọc; khóa sản phẩm ưu tiên mã sản phẩm', () => {
    const map: ColumnTarget[] = [
      'productName',
      'productCode',
      'category',
      'url',
      'compareAtPrice',
      'price',
    ];
    const result = validateImportTable(
      [
        ['a', 'b', 'c', 'd', 'e', 'f'],
        ['Quần', ' QJ-01 ', 'Quần jean', 'https://shop.example/qj', '300.000', '250.000'],
      ],
      map,
    );
    expect(result.errors).toEqual([]);
    expect(result.records[0]).toMatchObject({
      productKey: 'qj-01',
      productCode: 'QJ-01',
      category: 'Quần jean',
      url: 'https://shop.example/qj',
      compareAtVnd: 300000,
      priceVnd: 250000,
    });
  });

  it('báo lỗi theo dòng + cột và bỏ dòng lỗi khỏi bản ghi', () => {
    const table = [
      HEAD,
      ['', 'A1', '1', '1', '', ''],
      ['Tên', 'A2', 'abc', '1', '', ''],
      ['Tên', 'A3', '1', '-2', '', ''],
      ['Tên', 'A4', '1', '2', '', ''],
    ];
    const result = validateImportTable(table, MAP);
    expect(result.records.map((r) => r.row)).toEqual([5]);
    expect(result.errors).toEqual([
      { row: 2, column: 0, code: 'NAME_REQUIRED' },
      { row: 3, column: 2, code: 'PRICE_INVALID' },
      { row: 4, column: 3, code: 'STOCK_INVALID' },
    ]);
  });

  it('chống công thức: "=", "@", "+" / "-" không phải số bị chặn ở mọi ô được khớp; ô bỏ qua thì không kiểm', () => {
    const map: ColumnTarget[] = ['productName', 'sku', 'price', 'ignore'];
    const table = [
      ['a', 'b', 'c', 'd'],
      ['=HYPERLINK("http://x")', 'A', '1', ''],
      ['Tên', '@SUM(1)', '1', ''],
      ['Tên', '+84 901 000 000', '1', ''],
      ['Tên', '-cmd|x', '1', ''],
      ['Tên', '-5x', '1', ''],
      ['Tên', 'OK-1', '1', '=bo qua'],
      ['Tên', '-', '1', ''],
    ];
    const result = validateImportTable(table, map);
    expect(result.errors).toEqual([
      { row: 2, column: 0, code: 'FORMULA_BLOCKED' },
      { row: 3, column: 1, code: 'FORMULA_BLOCKED' },
      { row: 4, column: 1, code: 'FORMULA_BLOCKED' },
      { row: 5, column: 1, code: 'FORMULA_BLOCKED' },
      { row: 6, column: 1, code: 'FORMULA_BLOCKED' },
    ]);
    expect(result.records.map((r) => r.row)).toEqual([7, 8]);
  });

  it('số âm hợp lệ trong ô văn bản vẫn là số (không phải công thức) nhưng giá âm bị chặn', () => {
    const map: ColumnTarget[] = ['productName', 'price'];
    const result = validateImportTable(
      [
        ['a', 'b'],
        ['Tên', '-5'],
      ],
      map,
    );
    expect(result.errors).toEqual([{ row: 2, column: 1, code: 'PRICE_INVALID' }]);
  });

  it('ô quá 600 ký tự bị chặn', () => {
    const map: ColumnTarget[] = ['productName'];
    const result = validateImportTable([['a'], ['x'.repeat(601)], ['y'.repeat(600)]], map);
    expect(result.errors).toEqual([{ row: 2, column: 0, code: 'CELL_TOO_LONG' }]);
    expect(result.records).toHaveLength(1);
  });

  it('trùng biến thể trong file (cùng SKU, hoặc cùng thuộc tính khi không có SKU) bị chặn từ lần thứ hai', () => {
    const table = [
      HEAD,
      ['Áo', 'S1', '1', '1', 'Đen', 'M'],
      ['Áo', 's1', '1', '1', 'Trắng', 'L'],
      ['Áo', '', '1', '1', 'Đỏ', 'M'],
      ['Áo', '', '1', '1', 'đỏ', 'm'],
      ['Quần', 'S1', '1', '1', '', ''],
    ];
    const result = validateImportTable(table, MAP);
    expect(result.errors).toEqual([
      { row: 3, column: 1, code: 'DUPLICATE_VARIANT' },
      { row: 5, column: null, code: 'DUPLICATE_VARIANT' },
    ]);
    expect(result.records.map((r) => r.row)).toEqual([2, 4, 6]);
  });

  it('chỉ có tiêu đề hoặc bảng rỗng → không bản ghi', () => {
    expect(validateImportTable([], MAP)).toEqual({ records: [], errors: [], totalRows: 0 });
    expect(validateImportTable([HEAD], MAP).totalRows).toBe(0);
  });

  it('dòng ngắn hơn tiêu đề được coi như ô trống', () => {
    const result = validateImportTable([HEAD, ['Áo']], MAP);
    expect(result.errors).toEqual([]);
    expect(result.records[0]).toMatchObject({ productName: 'Áo', sku: null, priceVnd: null });
  });
});
