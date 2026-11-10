import { maskPii } from '@flow/shared';
import type { Distiller } from './distiller';
import type { DistillItem } from './schema';
import { type DistillRejection, verifyDistillItem } from './verify';

/** Trần chi phí LLM của MỘT lần chắt lọc cho một workspace (USD). Vượt → dừng bước, phần còn lại để lần sau. */
export const DISTILL_COST_CAP_USD = 0.2;
/** Số đoạn tối đa gọi LLM trong một lần chạy (chặn chạy tràn dù chi phí mỗi đoạn nhỏ). */
export const DISTILL_MAX_CHUNKS_PER_RUN = 60;

export type DistillChunk = { id: string; content: string; contentHash: string };

export type DistillDraftInsert = DistillItem & { lang: 'vi' | 'en' | 'all'; sourceChunkId: string };

/** Thao tác DB của bước chắt lọc — tiêm vào để test đơn vị không cần DB (bản thật ở `@flow/db`). */
export type DistillOps = {
  /** Đoạn nháp chưa chắt lọc ở bản nội dung hiện tại (không nghi cài lệnh, không phải FAQ). */
  listChunks(limit: number): Promise<DistillChunk[]>;
  /** Ghi các mục đạt kiểm cứng thành nháp (`status='draft'`); trả số dòng thực sự chèn (bỏ trùng câu hỏi). */
  insertDrafts(items: DistillDraftInsert[]): Promise<number>;
  /** Đánh dấu đoạn đã chắt lọc ở bản nội dung này (chạy lại không gọi LLM nữa). */
  markDistilled(chunks: ReadonlyArray<{ id: string; contentHash: string }>): Promise<void>;
};

export type DistillStats = {
  considered: number;
  called: number;
  accepted: number;
  inserted: number;
  invalidOutput: number;
  malformed: number;
  rejected: Partial<Record<DistillRejection, number>>;
  costUsd: number;
  stoppedByCap: boolean;
};

const langOf = (text: string): 'vi' | 'en' | 'all' =>
  /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i.test(text) ? 'vi' : 'all';

/**
 * Chắt lọc đoạn thô thành FAQ/thuộc tính nháp. Mỗi đoạn tối đa MỘT lần gọi LLM (đoạn đã chắt lọc ở bản nội dung này được bỏ qua), nội dung che PII trước khi gửi,
 * mọi mục qua kiểm cứng bằng code, mục đạt chỉ vào `faq_items` ở `draft` (chưa vào tìm kiếm) tới khi Owner duyệt. Lỗi gọi LLM ném nguyên lên (đoạn đó chưa đánh dấu).
 */
export async function runKbDistill(deps: {
  workspaceId: string;
  distiller: Distiller;
  ops: DistillOps;
  costCapUsd?: number;
  maxChunks?: number;
}): Promise<DistillStats> {
  const cap = deps.costCapUsd ?? DISTILL_COST_CAP_USD;
  const chunks = await deps.ops.listChunks(deps.maxChunks ?? DISTILL_MAX_CHUNKS_PER_RUN);
  const stats: DistillStats = {
    considered: chunks.length,
    called: 0,
    accepted: 0,
    inserted: 0,
    invalidOutput: 0,
    malformed: 0,
    rejected: {},
    costUsd: 0,
    stoppedByCap: false,
  };
  const done: Array<{ id: string; contentHash: string }> = [];
  const drafts: DistillDraftInsert[] = [];
  for (const chunk of chunks) {
    if (stats.costUsd >= cap) {
      stats.stoppedByCap = true;
      break;
    }
    const masked = maskPii(chunk.content);
    const result = await deps.distiller.distill({ workspaceId: deps.workspaceId, text: masked });
    stats.called += 1;
    stats.costUsd += result.costUsd;
    stats.malformed += result.malformed;
    if (result.items === null) {
      stats.invalidOutput += 1;
      continue;
    }
    for (const item of result.items) {
      const reason = verifyDistillItem(item, masked);
      if (reason !== null) {
        stats.rejected[reason] = (stats.rejected[reason] ?? 0) + 1;
        continue;
      }
      stats.accepted += 1;
      drafts.push({
        ...item,
        lang: langOf(`${item.question} ${item.answer}`),
        sourceChunkId: chunk.id,
      });
    }
    done.push({ id: chunk.id, contentHash: chunk.contentHash });
  }
  if (drafts.length > 0) stats.inserted = await deps.ops.insertDrafts(drafts);
  if (done.length > 0) await deps.ops.markDistilled(done);
  return stats;
}
