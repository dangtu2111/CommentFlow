/**
 * Giới hạn cứng khi nhập Excel/CSV (FR-051, docs/13: file không tin cậy, Q-KBIX1). Một nơi duy nhất cho mọi tầng
 * (đọc file, kiểm dòng, giao diện) để không lệch nhau.
 */
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_COLUMNS = 50;
export const IMPORT_MAX_CELL_CHARS = 600;
/** Tổng dung lượng giải nén tối đa của .xlsx (chống zip bomb). */
export const IMPORT_MAX_UNZIPPED_BYTES = 50 * 1024 * 1024;

export type ImportFileReason =
  | 'FILE_EMPTY'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE'
  | 'TOO_MANY_ROWS'
  | 'TOO_MANY_COLUMNS'
  | 'XLSX_INVALID'
  | 'XLSX_TOO_LARGE_UNZIPPED';

/** Lỗi file nhập: `reason` là mã để giao diện dịch; thông điệp chỉ là mã (không lộ nội dung file). */
export class ImportFileError extends Error {
  readonly reason: ImportFileReason;

  constructor(reason: ImportFileReason) {
    super(reason);
    this.name = 'ImportFileError';
    this.reason = reason;
  }
}

export function assertImportFileBytes(size: number): void {
  if (size <= 0) throw new ImportFileError('FILE_EMPTY');
  if (size > IMPORT_MAX_BYTES) throw new ImportFileError('FILE_TOO_LARGE');
}

export type ImportFileKind = 'xlsx' | 'csv';

const SNIFF_BYTES = 8192;

/**
 * Loại file theo ĐUÔI và CHỮ KÝ nội dung (không tin MIME do trình duyệt khai báo): `.xlsx` phải bắt đầu bằng `PK`
 * (zip); `.csv` không được là zip và không có byte NUL (nhị phân). Khác → `null` (từ chối). `.xls` cũ không hỗ trợ.
 */
export function sniffImportFileKind(fileName: string, bytes: Uint8Array): ImportFileKind | null {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (extension === 'xlsx') return isZip ? 'xlsx' : null;
  if (extension === 'csv') {
    if (isZip || bytes.subarray(0, SNIFF_BYTES).includes(0)) return null;
    return 'csv';
  }
  return null;
}
