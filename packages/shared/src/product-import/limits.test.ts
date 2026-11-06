import { describe, expect, it } from 'vitest';
import {
  assertImportFileBytes,
  IMPORT_MAX_BYTES,
  ImportFileError,
  sniffImportFileKind,
} from './limits';

describe('FR-051 giới hạn file nhập', () => {
  it('từ chối file rỗng và file quá 10 MB, nhận đúng ngưỡng', () => {
    expect(() => assertImportFileBytes(0)).toThrowError(ImportFileError);
    expect(() => assertImportFileBytes(0)).toThrowError(/FILE_EMPTY/);
    expect(() => assertImportFileBytes(IMPORT_MAX_BYTES + 1)).toThrowError(/FILE_TOO_LARGE/);
    expect(() => assertImportFileBytes(IMPORT_MAX_BYTES)).not.toThrow();
    expect(() => assertImportFileBytes(1)).not.toThrow();
  });

  it('nhận loại file theo chữ ký nội dung + đuôi, không tin MIME khai báo', () => {
    const zip = new Uint8Array([0x50, 0x4b, 3, 4, 0]);
    const text = new TextEncoder().encode('a,b\n1,2');
    expect(sniffImportFileKind('hang.xlsx', zip)).toBe('xlsx');
    expect(sniffImportFileKind('HANG.XLSX', zip)).toBe('xlsx');
    expect(sniffImportFileKind('hang.csv', text)).toBe('csv');
    // đuôi xlsx nhưng nội dung không phải zip / đuôi csv nhưng là zip / đuôi lạ
    expect(sniffImportFileKind('hang.xlsx', text)).toBeNull();
    expect(sniffImportFileKind('hang.csv', zip)).toBeNull();
    expect(sniffImportFileKind('hang.xls', zip)).toBeNull();
    expect(sniffImportFileKind('hang', text)).toBeNull();
    // CSV có byte NUL = nhị phân
    expect(sniffImportFileKind('hang.csv', new Uint8Array([97, 0, 98]))).toBeNull();
  });
});
