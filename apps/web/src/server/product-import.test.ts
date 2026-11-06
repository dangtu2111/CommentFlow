import { IMPORT_MAX_BYTES, type ImportProductPlan } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import { type ImportCommit, runProductImport } from './product-import';

// Fixture CSV (không phải dữ liệu thật).
const CSV = [
  'Tên sản phẩm,SKU,Giá bán,Tồn kho,Màu,Size',
  'Áo thun,AT-D-M,150.000,3,Đen,M',
  'Áo thun,AT-T-M,150.000,4,Trắng,M',
  ',X1,1,1,,',
  'Quần,Q1,=SUM(1+1),1,,',
].join('\n');

const file = (name: string, content: string | Uint8Array) => {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return new File([bytes as BlobPart], name);
};

const okCommit = (): ImportCommit =>
  vi.fn(async (_plan: readonly ImportProductPlan[]) => ({
    productsCreated: 1,
    productsUpdated: 0,
    variantsCreated: 2,
    variantsUpdated: 0,
  }));

describe('FR-051 nhập Excel/CSV: bước xem trước', () => {
  it('đọc CSV, gợi ý khớp cột, đếm dòng hợp lệ/lỗi, không ghi gì', async () => {
    const commit = okCommit();
    const result = await runProductImport(
      { mode: 'preview', file: file('a.csv', CSV) },
      { commit },
    );
    if (result.status !== 'preview') throw new Error(`expected preview, got ${result.status}`);
    expect(result.headers).toEqual(['Tên sản phẩm', 'SKU', 'Giá bán', 'Tồn kho', 'Màu', 'Size']);
    expect(result.mapping).toEqual([
      'productName',
      'sku',
      'price',
      'stock',
      'attribute',
      'attribute',
    ]);
    expect(result.totalRows).toBe(4);
    expect(result.validRows).toBe(2);
    expect(result.productCount).toBe(1);
    expect(result.variantCount).toBe(2);
    expect(result.errorCount).toBe(2);
    expect(result.errors).toEqual([
      { row: 4, column: 0, code: 'NAME_REQUIRED' },
      { row: 5, column: 2, code: 'FORMULA_BLOCKED' },
    ]);
    expect(result.sample).toHaveLength(4);
    expect(commit).not.toHaveBeenCalled();
  });

  it('dùng khớp cột người dùng chọn; chỉ hiện tối đa 50 lỗi nhưng đếm đủ', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => `,${i}`).join('\n');
    const result = await runProductImport(
      {
        mode: 'preview',
        file: file('a.csv', `Tên,Mã\n${rows}`),
        mapping: JSON.stringify(['productName', 'sku']),
      },
      { commit: okCommit() },
    );
    if (result.status !== 'preview') throw new Error('expected preview');
    expect(result.errorCount).toBe(60);
    expect(result.errors).toHaveLength(50);
    expect(result.validRows).toBe(0);
  });

  it('không có file / file rỗng / quá lớn / sai loại → lỗi có mã, không đọc nội dung', async () => {
    const deps = { commit: okCommit() };
    expect(await runProductImport({ mode: 'preview', file: null }, deps)).toEqual({
      status: 'error',
      error: 'NO_FILE',
    });
    expect(await runProductImport({ mode: 'preview', file: file('a.csv', '') }, deps)).toEqual({
      status: 'error',
      error: 'FILE_EMPTY',
    });
    const big = new File([new Uint8Array(IMPORT_MAX_BYTES + 1)], 'a.csv');
    expect(await runProductImport({ mode: 'preview', file: big }, deps)).toEqual({
      status: 'error',
      error: 'FILE_TOO_LARGE',
    });
    expect(await runProductImport({ mode: 'preview', file: file('a.xls', 'x') }, deps)).toEqual({
      status: 'error',
      error: 'UNSUPPORTED_FILE',
    });
    // đuôi .xlsx nhưng nội dung không phải zip (giả mạo)
    expect(await runProductImport({ mode: 'preview', file: file('a.xlsx', CSV) }, deps)).toEqual({
      status: 'error',
      error: 'UNSUPPORTED_FILE',
    });
  });

  it('xlsx hỏng (đúng chữ ký zip nhưng không đọc được) → XLSX_INVALID', async () => {
    const result = await runProductImport(
      { mode: 'preview', file: file('a.xlsx', new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3])) },
      { commit: okCommit() },
    );
    expect(result).toEqual({ status: 'error', error: 'XLSX_INVALID' });
  });

  it('không có hàng tiêu đề → NO_HEADER; khớp cột sai → MAPPING_INVALID', async () => {
    const deps = { commit: okCommit() };
    expect(await runProductImport({ mode: 'preview', file: file('a.csv', ',,\n') }, deps)).toEqual({
      status: 'error',
      error: 'NO_HEADER',
    });
    for (const mapping of ['không phải json', '["x"]', '["price","ignore"]', '["productName"]']) {
      const result = await runProductImport(
        { mode: 'preview', file: file('a.csv', 'A,B\n1,2'), mapping },
        deps,
      );
      expect(result).toEqual({ status: 'error', error: 'MAPPING_INVALID' });
    }
  });
});

describe('FR-051 nhập Excel/CSV: bước xác nhận', () => {
  it('ghi dòng hợp lệ (bỏ dòng lỗi), kế hoạch gom đúng sản phẩm + biến thể', async () => {
    const commit = okCommit();
    const result = await runProductImport({ mode: 'commit', file: file('a.csv', CSV) }, { commit });
    expect(result).toEqual({
      status: 'committed',
      productsCreated: 1,
      productsUpdated: 0,
      variantsCreated: 2,
      variantsUpdated: 0,
      skippedRows: 2,
    });
    const plan = vi.mocked(commit).mock.calls[0]?.[0] ?? [];
    expect(plan).toHaveLength(1);
    expect(plan[0]?.name).toBe('Áo thun');
    expect(plan[0]?.variants.map((v) => v.externalId)).toEqual(['sku:AT-D-M', 'sku:AT-T-M']);
  });

  it('không có dòng hợp lệ → NO_VALID_ROWS, không ghi', async () => {
    const commit = okCommit();
    const result = await runProductImport(
      { mode: 'commit', file: file('a.csv', 'Tên\n=1+1\n') },
      { commit },
    );
    expect(result).toEqual({ status: 'error', error: 'NO_VALID_ROWS' });
    expect(commit).not.toHaveBeenCalled();
  });

  it('lỗi ghi DB → UNAVAILABLE (không lộ chi tiết)', async () => {
    const commit: ImportCommit = vi.fn(async () => {
      throw new Error('connection to 10.0.0.1 refused');
    });
    const result = await runProductImport({ mode: 'commit', file: file('a.csv', CSV) }, { commit });
    expect(result).toEqual({ status: 'error', error: 'UNAVAILABLE' });
  });
});
