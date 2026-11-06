import {
  assertImportFileBytes,
  buildImportPlan,
  type ColumnTarget,
  checkMapping,
  columnMappingSchema,
  ImportFileError,
  type ImportFileReason,
  type ImportProductPlan,
  type ImportRowError,
  parseCsv,
  sniffImportFileKind,
  suggestMapping,
  validateImportTable,
} from '@flow/shared';
import { readXlsx } from '@flow/shared/xlsx';

/** Số lỗi tối đa gửi về giao diện (đếm vẫn đủ). */
export const IMPORT_ERRORS_SHOWN = 50;
const SAMPLE_ROWS = 5;

export type ImportErrorKey =
  | ImportFileReason
  | 'NO_FILE'
  | 'NO_HEADER'
  | 'MAPPING_INVALID'
  | 'NO_VALID_ROWS'
  | 'UNAVAILABLE';

export type ImportActionResult =
  | { status: 'error'; error: ImportErrorKey }
  | {
      status: 'preview';
      headers: string[];
      mapping: ColumnTarget[];
      sample: string[][];
      totalRows: number;
      validRows: number;
      productCount: number;
      variantCount: number;
      errorCount: number;
      errors: ImportRowError[];
    }
  | {
      status: 'committed';
      productsCreated: number;
      productsUpdated: number;
      variantsCreated: number;
      variantsUpdated: number;
      skippedRows: number;
    };

export type ImportCommitResult = Omit<
  Extract<ImportActionResult, { status: 'committed' }>,
  'status' | 'skippedRows'
>;
/** Ghi kế hoạch vào DB (nối `withActor` + `applyProductImport` ở Server Action); tiêm vào để test không cần DB. */
export type ImportCommit = (plan: readonly ImportProductPlan[]) => Promise<ImportCommitResult>;

export type ProductImportInput = {
  mode: 'preview' | 'commit';
  file: File | null;
  /** JSON của `ColumnTarget[]`; vắng khi xem trước lần đầu → dùng gợi ý. */
  mapping?: string | null;
};

const fail = (error: ImportErrorKey): ImportActionResult => ({ status: 'error', error });

function readTable(name: string, bytes: Uint8Array): string[][] {
  const kind = sniffImportFileKind(name, bytes);
  if (kind === null) throw new ImportFileError('UNSUPPORTED_FILE');
  return kind === 'xlsx' ? readXlsx(bytes) : parseCsv(new TextDecoder('utf-8').decode(bytes));
}

function resolveMapping(raw: string | null | undefined, headers: string[]): ColumnTarget[] | null {
  if (raw === undefined || raw === null || raw === '') return suggestMapping(headers);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const mapping = columnMappingSchema.safeParse(parsed);
  if (!mapping.success) return null;
  return checkMapping(mapping.data, headers.length).ok ? mapping.data : null;
}

/**
 * Nhập sản phẩm từ Excel/CSV (FR-051): kiểm file (kích thước, đuôi + chữ ký) → đọc bảng (không công thức) → khớp cột
 * → kiểm từng dòng → [xem trước | ghi]. Không trạng thái phía server: cả hai chế độ nhận lại file + khớp cột (Q-KBIX1 g).
 * `workspaceId`/người dùng nằm trong `commit` (đã gắn từ `requireAppUser`), không đi qua đầu vào. Mọi lỗi → mã
 * `ImportErrorKey` (giao diện dịch); không lộ nội dung file hay lỗi DB.
 */
export async function runProductImport(
  input: ProductImportInput,
  deps: { commit: ImportCommit },
): Promise<ImportActionResult> {
  if (input.file === null) return fail('NO_FILE');
  let table: string[][];
  try {
    assertImportFileBytes(input.file.size);
    table = readTable(input.file.name, new Uint8Array(await input.file.arrayBuffer()));
  } catch (error) {
    if (error instanceof ImportFileError) return fail(error.reason);
    return fail('UNSUPPORTED_FILE');
  }

  const headers = (table[0] ?? []).map((cell) => cell.trim());
  if (headers.every((header) => header === '')) return fail('NO_HEADER');
  const mapping = resolveMapping(input.mapping, headers);
  if (mapping === null) return fail('MAPPING_INVALID');

  const validation = validateImportTable(table, mapping);
  const plan = buildImportPlan(validation.records);
  const skippedRows = validation.totalRows - validation.records.length;

  if (input.mode === 'preview') {
    return {
      status: 'preview',
      headers,
      mapping,
      sample: table.slice(1, 1 + SAMPLE_ROWS).map((row) => row.slice(0, headers.length)),
      totalRows: validation.totalRows,
      validRows: validation.records.length,
      productCount: plan.length,
      variantCount: validation.records.length,
      errorCount: validation.errors.length,
      errors: validation.errors.slice(0, IMPORT_ERRORS_SHOWN),
    };
  }
  if (plan.length === 0) return fail('NO_VALID_ROWS');
  try {
    return { status: 'committed', ...(await deps.commit(plan)), skippedRows };
  } catch {
    return fail('UNAVAILABLE');
  }
}
