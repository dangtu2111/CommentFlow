import { isAppError } from '@flow/shared';

// Lỗi Postgres do drizzle bọc nằm ở `error.cause`; message ngoài chỉ là "Failed query: ..." (kèm cả câu SQL).
// Chỉ in các trường chẩn đoán an toàn (code/message/constraint/column/table) — KHÔNG in `detail` (chứa giá trị dòng),
// host, hay câu SQL/tham số.
const PG_FIELDS = ['code', 'constraint', 'schema', 'table', 'column'] as const;

function pgCause(error: unknown): string | null {
  let cur: unknown = error instanceof Error ? error.cause : undefined;
  for (let depth = 0; cur && depth < 5; depth += 1) {
    if (
      typeof cur === 'object' &&
      'code' in cur &&
      typeof (cur as { code: unknown }).code === 'string'
    ) {
      const pgErr = cur as Record<string, unknown>;
      const parts = PG_FIELDS.filter((f) => typeof pgErr[f] === 'string').map(
        (f) => `${f}=${pgErr[f]}`,
      );
      const message = typeof pgErr.message === 'string' ? pgErr.message : 'không rõ';
      return `${message} (${parts.join(', ')})`;
    }
    cur = cur instanceof Error ? cur.cause : undefined;
  }
  return null;
}

export function describeSeedError(error: unknown): string {
  if (isAppError(error)) return `[${error.code}] ${error.message}`;
  if (!(error instanceof Error)) return 'Lỗi: không rõ';
  const cause = pgCause(error);
  if (cause) return `Lỗi database: ${cause}`;
  // Không có cause Postgres: bỏ phần SQL kèm theo trong "Failed query: ...".
  return `Lỗi: ${error.message.split('\n')[0]?.slice(0, 200) ?? 'không rõ'}`;
}
