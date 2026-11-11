/**
 * M3-2 (KB-DISTILL): quy tắc xếp hạng cho đoạn FAQ chắt lọc, áp SAU khi tìm kiếm đã xếp thứ tự (RRF).
 * Đoạn chắt lọc là bản viết lại của đoạn thô nên không được lấn đoạn thô (EVAL fs-m3: mixed 29/30 → 21/30 khi lấn):
 *  1. bỏ đoạn chắt lọc mà đoạn thô nguồn đã có trong kết quả — tránh nêu hai lần cùng một ý. So theo `chunk_key` (bền qua xuất bản;
 *     mã đoạn đổi khi xuất bản vì kb-publish chép đoạn nháp sang bản mới);
 *  2. đoạn chắt lọc chiếm tối đa `DISTILL_MAX_SHARE` trong `window` chỗ đầu; chỗ còn lại trả cho đoạn thô.
 * Hàm thuần, không I/O.
 */
export const DISTILL_MAX_SHARE = 3;

export type RankItem = {
  /** `chunk_key` của đoạn (bền qua xuất bản). */
  chunkKey: string;
  /** Đoạn FAQ chắt lọc? */
  distilled: boolean;
  /** `chunk_key` của đoạn thô nguồn (chỉ đoạn chắt lọc; null nếu không tra được). */
  sourceKey: string | null;
};

/**
 * Giữ thứ tự đầu vào. `window` (nếu có) = số chỗ tối đa của kết quả (vd. số đoạn đem rerank); thiếu = không giới hạn độ dài.
 */
export function applyDistillRank<T extends RankItem>(items: readonly T[], window?: number): T[] {
  const raw = items.filter((item) => !item.distilled);
  const rawInResult = new Set(
    (window === undefined ? raw : raw.slice(0, window)).map((item) => item.chunkKey),
  );
  const out: T[] = [];
  let distilled = 0;
  for (const item of items) {
    if (window !== undefined && out.length >= window) break;
    if (item.distilled) {
      if (
        (item.sourceKey !== null && rawInResult.has(item.sourceKey)) ||
        distilled >= DISTILL_MAX_SHARE
      )
        continue;
      distilled += 1;
    }
    out.push(item);
  }
  return out;
}
