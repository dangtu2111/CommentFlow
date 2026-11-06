/**
 * Gộp bình luận liên tiếp (docs/05 FR-148, docs/09 §7.1a, US-109): cùng khách + cùng bài, mỗi cặp liền kề cách nhau
 * < cửa sổ (mặc định 30 giây, Owner chỉnh 10–60) → một lượt; trả lời vào bình luận cuối, các bình luận trước
 * "đã gộp" (`merged_into_id` = bình luận cuối). Hàm thuần: không DB, không hẹn giờ. Q-PMB1.
 *
 * Việc ghi `merged_into_id` phải qua hàm DB riêng (COMMENT-HIDE-MERGE-GUARD) — chưa nối ở đây.
 */

export const DEFAULT_MERGE_WINDOW_SECONDS = 30;
export const MIN_MERGE_WINDOW_SECONDS = 10;
export const MAX_MERGE_WINDOW_SECONDS = 60;
/** Một lượt gộp tối đa chừng này bình luận (chống nhồi văn bản vào LLM); phần dư thành lượt mới. */
export const MAX_BURST_SIZE = 10;

export interface BurstComment {
  id: string;
  postId: string;
  authorExternalId: string;
  createdAt: Date | number;
  text: string;
}

export interface BurstGroup {
  postId: string;
  authorExternalId: string;
  /** Mọi id, theo thứ tự thời gian. */
  ids: string[];
  /** Id được trả lời = bình luận cuối. */
  targetId: string;
  /** Các id còn lại (đánh dấu "đã gộp"). */
  mergedIds: string[];
  firstAt: Date;
  lastAt: Date;
  texts: string[];
}

export function clampMergeWindowSeconds(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MERGE_WINDOW_SECONDS;
  return Math.min(MAX_MERGE_WINDOW_SECONDS, Math.max(MIN_MERGE_WINDOW_SECONDS, Math.floor(value)));
}

interface Timed extends BurstComment {
  ms: number;
}

function toTimed(comment: BurstComment): Timed {
  const ms = comment.createdAt instanceof Date ? comment.createdAt.getTime() : comment.createdAt;
  return { ...comment, ms };
}

function toGroup(members: Timed[]): BurstGroup {
  const first = members[0] as Timed;
  const last = members[members.length - 1] as Timed;
  return {
    postId: first.postId,
    authorExternalId: first.authorExternalId,
    ids: members.map((m) => m.id),
    targetId: last.id,
    mergedIds: members.slice(0, -1).map((m) => m.id),
    firstAt: new Date(first.ms),
    lastAt: new Date(last.ms),
    texts: members.map((m) => m.text),
  };
}

/** Khóa gom (pg-boss `singletonKey`): luôn chứa `workspace_id`; mã hóa từng phần để không nhập nhằng. */
export function burstKey(workspaceId: string, postId: string, authorExternalId: string): string {
  return `burst:${[workspaceId, postId, authorExternalId].map(encodeURIComponent).join(':')}`;
}

/** Chia bình luận chưa xử lý thành các lượt gộp. Kết quả không phụ thuộc thứ tự đầu vào. */
export function planMergeBurst(
  comments: readonly BurstComment[],
  windowSeconds?: number | null,
): BurstGroup[] {
  const windowMs = clampMergeWindowSeconds(windowSeconds) * 1000;
  const sorted = comments
    .map(toTimed)
    .filter((c) => Number.isFinite(c.ms))
    .sort((a, b) => a.ms - b.ms || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const seen = new Set<string>();
  const open = new Map<string, Timed[]>();
  const groups: Timed[][] = [];
  for (const comment of sorted) {
    if (seen.has(comment.id)) continue;
    seen.add(comment.id);
    // Không biết khách là ai → không gộp (an toàn: mỗi bình luận một lượt).
    const key =
      comment.authorExternalId === ''
        ? null
        : JSON.stringify([comment.postId, comment.authorExternalId]);
    const current = key === null ? undefined : open.get(key);
    const last = current?.[current.length - 1];
    if (current && last && current.length < MAX_BURST_SIZE && comment.ms - last.ms < windowMs) {
      current.push(comment);
      continue;
    }
    const fresh = [comment];
    groups.push(fresh);
    if (key !== null) open.set(key, fresh);
  }
  return groups.map(toGroup);
}

/** Lượt gộp chỉ được xử lý khi đã hết khoảng chờ kể từ bình luận cuối. */
export function isBurstReady(
  group: BurstGroup,
  now: Date | number,
  windowSeconds?: number | null,
): boolean {
  const nowMs = now instanceof Date ? now.getTime() : now;
  return nowMs >= group.lastAt.getTime() + clampMergeWindowSeconds(windowSeconds) * 1000;
}

/** Văn bản của lượt gộp: ghép theo thứ tự thời gian, bỏ phần rỗng. */
export function mergeBurstText(group: BurstGroup): string {
  return group.texts
    .map((t) => t.trim())
    .filter((t) => t !== '')
    .join('\n');
}
