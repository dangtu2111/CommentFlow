import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_COLUMNS, IMPORT_MAX_ROWS, ImportFileError } from './limits';
import { readXlsx } from './xlsx';

// Fixture: file .xlsx dựng tay từ XML tối thiểu (không phải dữ liệu thật).
function buildXlsx(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, xml] of Object.entries(files)) entries[name] = strToU8(xml);
  return zipSync(entries);
}

const sheet = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`;

describe('FR-051 đọc XLSX an toàn', () => {
  it('đọc chuỗi dùng chung, chuỗi nội tuyến, số, boolean, ô trống và dòng bị thiếu', () => {
    const bytes = buildXlsx({
      'xl/sharedStrings.xml':
        '<sst><si><t>Tên</t></si><si><r><t>Áo </t></r><r><t>thun &amp; nón</t></r><rPh><t>x</t></rPh></si><si><t xml:space="preserve"> Giá </t></si></sst>',
      'xl/worksheets/sheet1.xml': sheet(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>2</v></c></row>' +
          '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3"><v>150000</v></c><c r="C3" t="inlineStr"><is><t>a&lt;b</t><t>&#65;&#x42;</t></is></c><c r="D3" t="b"><v>1</v></c><c r="E3" t="b"><v>0</v></c></row>' +
          '<row r="4"><c r="A4"/><c r="B4" t="e"><v>#N/A</v></c><c r="C4" t="str"><v>văn bản</v></c></row>',
      ),
    });
    expect(readXlsx(bytes)).toEqual([
      ['Tên', '', ' Giá '],
      [],
      ['Áo thun & nón', '150000', 'a<bAB', 'TRUE', 'FALSE'],
      ['', '', 'văn bản'],
    ]);
  });

  it('ô công thức bị đánh dấu bằng dấu "=" đầu, KHÔNG dùng giá trị đã tính', () => {
    const bytes = buildXlsx({
      'xl/worksheets/sheet1.xml': sheet(
        '<row r="1"><c r="A1"><f>SUM(B1:B2)</f><v>999</v></c><c r="B1"><f/><v>5</v></c></row>',
      ),
    });
    const [row] = readXlsx(bytes);
    expect(row?.[0]).toBe('=SUM(B1:B2)');
    expect(row?.[1]).toBe('=');
  });

  it('thiếu sharedStrings hoặc chỉ số hỏng → ô rỗng', () => {
    const bytes = buildXlsx({
      'xl/worksheets/sheet1.xml': sheet(
        '<row r="1"><c r="A1" t="s"><v>7</v></c><c r="B1" t="s"><v>abc</v></c><c r="C1" t="s"></c></row>',
      ),
    });
    expect(readXlsx(bytes)).toEqual([['', '', '']]);
  });

  it('chọn trang tính đầu theo tên khi không có sheet1', () => {
    const bytes = buildXlsx({
      'xl/worksheets/sheet3.xml': sheet(
        '<row r="1"><c r="A1" t="inlineStr"><is><t>ba</t></is></c></row>',
      ),
      'xl/worksheets/sheet2.xml': sheet(
        '<row r="1"><c r="A1" t="inlineStr"><is><t>hai</t></is></c></row>',
      ),
    });
    expect(readXlsx(bytes)).toEqual([['hai']]);
  });

  it('không có trang tính hoặc không phải zip → XLSX_INVALID', () => {
    expect(() => readXlsx(buildXlsx({ 'readme.txt': 'x' }))).toThrowError(/XLSX_INVALID/);
    expect(() => readXlsx(strToU8('không phải zip'))).toThrowError(ImportFileError);
  });

  it('zip khai báo giải nén quá lớn bị từ chối trước khi giải nén', () => {
    const big = new Uint8Array(51 * 1024 * 1024); // nén rất nhỏ nhưng khai báo 51 MB
    const bytes = zipSync({ 'xl/worksheets/sheet1.xml': big });
    expect(bytes.length).toBeLessThan(1024 * 1024);
    expect(() => readXlsx(bytes)).toThrowError(/XLSX_TOO_LARGE_UNZIPPED/);
    // Nén 51 MB chậm khi chạy kèm coverage trên CI (timeout mặc định 5s đã từng vượt) → nới riêng bài này.
  }, 30_000);

  it('quá nhiều dòng hoặc cột bị từ chối', () => {
    const manyRows = Array.from(
      { length: IMPORT_MAX_ROWS + 2 },
      (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>1</v></c></row>`,
    ).join('');
    expect(() => readXlsx(buildXlsx({ 'xl/worksheets/sheet1.xml': sheet(manyRows) }))).toThrowError(
      /TOO_MANY_ROWS/,
    );
    const wide = '<row r="1"><c r="A1"><v>1</v></c><c r="BA1"><v>1</v></c></row>';
    expect(() => readXlsx(buildXlsx({ 'xl/worksheets/sheet1.xml': sheet(wide) }))).toThrowError(
      /TOO_MANY_COLUMNS/,
    );
  });

  it('hồi quy ReDoS: thẻ mở lặp mà thiếu thẻ đóng bị từ chối nhanh (tuyến tính), không treo', () => {
    const started = Date.now();
    const rowsNoClose = '<row>'.repeat(300_000);
    expect(() =>
      readXlsx(buildXlsx({ 'xl/worksheets/sheet1.xml': sheet(rowsNoClose) })),
    ).toThrowError(/XLSX_INVALID/);
    const cellsNoClose = `<row r="1">${'<c>'.repeat(300_000)}</row>`;
    expect(() =>
      readXlsx(buildXlsx({ 'xl/worksheets/sheet1.xml': sheet(cellsNoClose) })),
    ).toThrowError(/XLSX_INVALID/);
    const textNoClose = `<sst><si>${'<t>'.repeat(300_000)}</si></sst>`;
    expect(() =>
      readXlsx(
        buildXlsx({
          'xl/sharedStrings.xml': textNoClose,
          'xl/worksheets/sheet1.xml': sheet('<row r="1"><c r="A1" t="s"><v>0</v></c></row>'),
        }),
      ),
    ).toThrowError(/XLSX_INVALID/);
    const phoneticNoClose = `<sst><si>${'<rPh>'.repeat(300_000)}</si></sst>`;
    expect(() =>
      readXlsx(
        buildXlsx({
          'xl/sharedStrings.xml': phoneticNoClose,
          'xl/worksheets/sheet1.xml': sheet('<row r="1"/>'),
        }),
      ),
    ).toThrowError(/XLSX_INVALID/);
    expect(() =>
      readXlsx(buildXlsx({ 'xl/worksheets/sheet1.xml': '<sheetData><row r="1" ' })),
    ).toThrowError(/XLSX_INVALID/);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('chặn số phần tử lạm phát: quá nhiều <row>, <c> lặp cùng ô, <si> rỗng', () => {
    const repeatedRows = '<row r="1"/>'.repeat(IMPORT_MAX_ROWS + 2);
    expect(() =>
      readXlsx(buildXlsx({ 'xl/worksheets/sheet1.xml': sheet(repeatedRows) })),
    ).toThrowError(/TOO_MANY_ROWS/);
    const repeatedCells = `<row r="1">${'<c r="A1"/>'.repeat(60)}</row>`;
    expect(() =>
      readXlsx(buildXlsx({ 'xl/worksheets/sheet1.xml': sheet(repeatedCells) })),
    ).toThrowError(/TOO_MANY_COLUMNS/);
    const manyStrings = `<sst>${'<si/>'.repeat((IMPORT_MAX_ROWS + 1) * IMPORT_MAX_COLUMNS + 1)}</sst>`;
    expect(() =>
      readXlsx(
        buildXlsx({
          'xl/sharedStrings.xml': manyStrings,
          'xl/worksheets/sheet1.xml': sheet('<row r="1"/>'),
        }),
      ),
    ).toThrowError(/XLSX_INVALID/);
  });

  it('một dòng khai báo số dòng quá lớn (r="99999") bị từ chối, không cấp phát mảng khổng lồ', () => {
    const sparse = '<row r="99999"><c r="A99999"><v>1</v></c></row>';
    expect(() => readXlsx(buildXlsx({ 'xl/worksheets/sheet1.xml': sheet(sparse) }))).toThrowError(
      /TOO_MANY_ROWS/,
    );
  });

  it('chỉ nhận đúng tên thẻ: <cx>, <rowBreaks> không bị nhầm với <c>, <row>', () => {
    const bytes = buildXlsx({
      'xl/worksheets/sheet1.xml': sheet(
        '<rowBreaks><brk/></rowBreaks><row r="1"><cx><v>9</v></cx><c r="A1"><v>1</v></c></row>',
      ),
    });
    expect(readXlsx(bytes)).toEqual([['1']]);
  });

  it('tổng kích thước giải nén khai báo của trang tính + chuỗi dùng chung được cộng dồn', () => {
    const half = new Uint8Array(26 * 1024 * 1024);
    const bytes = zipSync({ 'xl/worksheets/sheet1.xml': half, 'xl/sharedStrings.xml': half });
    expect(() => readXlsx(bytes)).toThrowError(/XLSX_TOO_LARGE_UNZIPPED/);
  }, 30_000);

  it('ô thiếu tham chiếu r dùng vị trí liền sau; dòng thiếu r dùng số dòng liền sau', () => {
    const bytes = buildXlsx({
      'xl/worksheets/sheet1.xml': sheet(
        '<row><c><v>1</v></c><c><v>2</v></c></row><row><c><v>3</v></c></row>',
      ),
    });
    expect(readXlsx(bytes)).toEqual([['1', '2'], ['3']]);
  });
});
