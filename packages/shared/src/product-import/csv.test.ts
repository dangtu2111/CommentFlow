import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';
import { IMPORT_MAX_COLUMNS, IMPORT_MAX_ROWS, ImportFileError } from './limits';

describe('FR-051 đọc CSV', () => {
  it('đọc dấu phẩy, ngoặc kép, dấu phẩy và xuống dòng trong ô, ngoặc kép lồng', () => {
    const text = 'name,note\r\n"A, B","dòng 1\ndòng 2"\n"say ""hi""",x\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'note'],
      ['A, B', 'dòng 1\ndòng 2'],
      ['say "hi"', 'x'],
    ]);
  });

  it('bỏ BOM và tự nhận dấu chấm phẩy / tab', () => {
    expect(parseCsv('﻿a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('dấu phân cách nằm trong ngoặc kép của dòng đầu không tính', () => {
    expect(parseCsv('"a;b;c",d\n1,2')).toEqual([
      ['a;b;c', 'd'],
      ['1', '2'],
    ]);
  });

  it('bỏ dòng cuối rỗng, giữ dòng rỗng ở giữa để số dòng đúng', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([['a', 'b'], [''], ['1', '2']]);
  });

  it('chuỗi rỗng → không có dòng nào', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('quá nhiều dòng hoặc cột bị từ chối với mã lỗi', () => {
    const rows = `h\n${'x\n'.repeat(IMPORT_MAX_ROWS + 1)}`;
    expect(() => parseCsv(rows)).toThrowError(ImportFileError);
    expect(() => parseCsv(rows)).toThrowError(/TOO_MANY_ROWS/);
    const wide = Array.from({ length: IMPORT_MAX_COLUMNS + 1 }, (_, i) => `c${i}`).join(',');
    expect(() => parseCsv(wide)).toThrowError(/TOO_MANY_COLUMNS/);
  });

  it('ngoặc kép không đóng: lấy hết phần còn lại thay vì treo', () => {
    expect(parseCsv('a,"b\nc')).toEqual([['a', 'b\nc']]);
  });
});
