import { normalizeSearchText } from '@flow/shared';
import type pg from 'pg';

/**
 * Điểm giống tên sản phẩm ĐÚNG như production (`findProductMatch`, packages/db/src/queries/kb-search.ts + product-aliases.ts) nhưng trên
 * cửa hàng mẫu (không bảng): dùng chính hàm `similarity`/`word_similarity` của pg_trgm qua một truy vấn thuần (không ghi, không đọc bảng).
 * Ngưỡng giữ y như production: toàn chuỗi 0,3 (`%`), từ trong chuỗi 0,4 (`<%`), bí danh 0,6; chọn/mơ hồ do `pickProductMatch` (0,45/0,05).
 */
export const SIMILARITY_THRESHOLD = 0.3;
export const WORD_SIMILARITY_THRESHOLD = 0.4;

export type ScoreRow = { id: string; searchText: string; aliasNorms: readonly string[] };
export type ScoredProduct = {
  id: string;
  /** `GREATEST(similarity, word_similarity)` — null khi không qua toán tử `%`/`<%` của production. */
  trigram: number | null;
  /** Điểm tốt nhất qua bí danh (`similarity` ≥ 0,6 mới tính); null nếu không có. */
  alias: number | null;
};
export type TrigramScorer = (query: string, rows: readonly ScoreRow[]) => Promise<ScoredProduct[]>;

export function createPgTrigramScorer(pool: pg.Pool): TrigramScorer {
  return async (query, rows) => {
    const q = normalizeSearchText(query);
    if (q === '' || rows.length === 0) return [];
    const aliasIds: string[] = [];
    const aliasNorms: string[] = [];
    for (const row of rows) {
      for (const alias of row.aliasNorms) {
        aliasIds.push(row.id);
        aliasNorms.push(alias);
      }
    }
    const res = await pool.query<{ id: string; sim: number; wsim: number; alias: number | null }>(
      `WITH p(id, st) AS (SELECT * FROM unnest($1::text[], $2::text[])),
            a(id, an) AS (SELECT * FROM unnest($3::text[], $4::text[]))
       SELECT p.id, similarity(p.st, $5) AS sim, word_similarity($5, p.st) AS wsim,
              (SELECT max(similarity(a.an, $5)) FROM a WHERE a.id = p.id) AS alias
         FROM p`,
      [rows.map((r) => r.id), rows.map((r) => r.searchText), aliasIds, aliasNorms, q],
    );
    return res.rows.map((r) => {
      const sim = Number(r.sim);
      const wsim = Number(r.wsim);
      const passes = sim >= SIMILARITY_THRESHOLD || wsim >= WORD_SIMILARITY_THRESHOLD;
      return {
        id: r.id,
        trigram: passes ? Math.max(sim, wsim) : null,
        alias: r.alias !== null && Number(r.alias) >= 0.6 ? Number(r.alias) : null,
      };
    });
  };
}
