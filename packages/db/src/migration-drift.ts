import { createHash } from 'node:crypto';

/**
 * Phát hiện DB lệch với file migration. drizzle chỉ áp migration có mốc `when` LỚN HƠN bản đã áp mới nhất, nên một migration
 * từ nhánh song song (hoặc bị đổi mốc/đổi nội dung sau khi đã áp) có thể bị BỎ QUA âm thầm trên DB dài hạn như `cf_dev`
 * (đã xảy ra với 0055, 0025, 0026, 0058, 0062 — làm `db:check-rls` ở dev đỏ trong khi CI trên DB sạch vẫn xanh).
 * So theo MÃ BĂM (sha256 nội dung file — đúng cách drizzle ghi sổ), không theo mốc thời gian. Hàm thuần.
 */
export const hashMigrationSql = (sql: string): string =>
  createHash('sha256').update(sql).digest('hex');

export function unrecordedMigrationTags(
  journal: ReadonlyArray<{ tag: string }>,
  readSql: (tag: string) => string,
  recordedHashes: ReadonlySet<string>,
): string[] {
  return journal
    .filter((entry) => !recordedHashes.has(hashMigrationSql(readSql(entry.tag))))
    .map((entry) => entry.tag);
}
