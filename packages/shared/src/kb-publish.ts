import { z } from 'zod';

/**
 * Xuất bản / khôi phục phiên bản kiến thức (FR-054, UF-8, US-035, Q-KPV1). Thuần, không chạm DB.
 * Phiên bản bất biến: xuất bản và khôi phục đều TẠO phiên bản mới (số chỉ tăng), không sửa phiên bản cũ.
 */

export const KB_PUBLISH_QUEUE = 'kb-publish';
export const KB_PUBLISH_NOTE_MAX = 500;

export type KbChangeCategory = 'faq' | 'policy' | 'product' | 'manual' | 'url';
/** Nhóm cần chủ shop xác nhận trước khi xuất bản (UF-8: đổi Sản phẩm/Chính sách). */
const CONFIRM_CATEGORIES: readonly KbChangeCategory[] = ['product', 'policy'];

/** Dữ liệu job `kb-publish`: chỉ id/số phiên bản; nội dung kiến thức không đi qua hàng đợi. */
export const kbPublishJobSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('publish'),
    workspaceId: z.uuid(),
    requestedBy: z.uuid(),
    note: z.string().max(KB_PUBLISH_NOTE_MAX).nullish(),
  }),
  z.object({
    kind: z.literal('restore'),
    workspaceId: z.uuid(),
    requestedBy: z.uuid(),
    versionNumber: z.number().int().min(1),
    note: z.string().max(KB_PUBLISH_NOTE_MAX).nullish(),
  }),
]);
export type KbPublishJob = z.infer<typeof kbPublishJobSchema>;

/** Tóm tắt một đoạn để so sánh giữa nháp/phiên bản (không mang nội dung). */
export type PlanChunk = {
  sourceId: string;
  sourceType: string;
  chunkKey: string;
  contentHash: string;
  injectionSuspected: boolean;
};

export type KbVersionPlan =
  | { ok: false; reason: 'no_changes' }
  | {
      ok: true;
      added: number;
      changed: number;
      removed: number;
      /** Số đoạn nghi cài lệnh bị loại khỏi phiên bản (FR-164: chờ duyệt, không tự xuất bản). */
      blockedInjection: number;
      /** Đoạn sẽ nằm trong phiên bản mới. */
      publishKeys: { sourceId: string; chunkKey: string }[];
      changedCategories: KbChangeCategory[];
      needsConfirm: boolean;
    };

export function nextVersionNumber(currentMax: number | null): number {
  return (currentMax ?? 0) + 1;
}

export function categoryOfSource(sourceType: string): KbChangeCategory {
  switch (sourceType) {
    case 'faq':
      return 'faq';
    case 'policy':
      return 'policy';
    case 'shopify':
    case 'excel':
      return 'product';
    case 'url':
      return 'url';
    default:
      return 'manual';
  }
}

const keyOf = (c: Pick<PlanChunk, 'sourceId' | 'chunkKey'>) => `${c.sourceId}\u0000${c.chunkKey}`;

/**
 * So tập đoạn sẽ thành phiên bản mới (`next`: bản nháp, hoặc đoạn của phiên bản cần khôi phục) với tập của phiên bản
 * đang chạy (`current`). Đoạn nghi cài lệnh bị loại khỏi `next` trước khi so. Không khác gì → `no_changes`
 * (idempotent: bấm đúp / job chạy lại không tạo phiên bản thừa).
 */
export function planKbVersion(
  next: readonly PlanChunk[],
  current: readonly PlanChunk[],
): KbVersionPlan {
  const safe = next.filter((c) => !c.injectionSuspected);
  const blockedInjection = next.length - safe.length;
  const before = new Map(current.map((c) => [keyOf(c), c]));
  const after = new Map(safe.map((c) => [keyOf(c), c]));

  const touched: PlanChunk[] = [];
  let added = 0;
  let changed = 0;
  let removed = 0;
  for (const [key, chunk] of after) {
    const old = before.get(key);
    if (!old) {
      added += 1;
      touched.push(chunk);
    } else if (old.contentHash !== chunk.contentHash) {
      changed += 1;
      touched.push(chunk);
    }
  }
  for (const [key, chunk] of before) {
    if (!after.has(key)) {
      removed += 1;
      touched.push(chunk);
    }
  }
  if (added + changed + removed === 0) return { ok: false, reason: 'no_changes' };

  const changedCategories = [...new Set(touched.map((c) => categoryOfSource(c.sourceType)))].sort();
  return {
    ok: true,
    added,
    changed,
    removed,
    blockedInjection,
    publishKeys: [...after.values()]
      .map((c) => ({ sourceId: c.sourceId, chunkKey: c.chunkKey }))
      .sort((a, b) => keyOf(a).localeCompare(keyOf(b))),
    changedCategories,
    needsConfirm: changedCategories.some((c) => CONFIRM_CATEGORIES.includes(c)),
  };
}

/** Ghi chú xuất bản: cắt khoảng trắng; rỗng → null; quá `KB_PUBLISH_NOTE_MAX` → lỗi. */
export function parsePublishNote(raw: unknown): { ok: true; note: string | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, note: null };
  if (typeof raw !== 'string') return { ok: false };
  const note = raw.trim();
  if (note.length > KB_PUBLISH_NOTE_MAX) return { ok: false };
  return { ok: true, note: note === '' ? null : note };
}
