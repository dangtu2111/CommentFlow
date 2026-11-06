import type { CommentLabel } from '@flow/shared';

/** Câu mẫu của shop (FR-132; docs/10 bảng `kb_answer_examples`, chưa có migration). */
export type ExampleStatus = 'active' | 'disabled';

export interface AnswerExample {
  readonly id: string;
  readonly workspaceId: string;
  /** `null` = mọi kênh. */
  readonly channelId: string | null;
  readonly label: CommentLabel;
  readonly lang: 'vi' | 'en';
  /** Câu hỏi của khách ĐÃ che PII. */
  readonly questionMasked: string;
  /** Câu trả lời đã che PII, giá/tồn là placeholder. */
  readonly answerTemplate: string;
  readonly variantIds: readonly string[];
  readonly sourceDraftId: string | null;
  readonly approvedBy: string;
  readonly status: ExampleStatus;
  readonly usedCount: number;
  readonly createdAt: Date;
}

/**
 * Nơi lưu câu mẫu. Mọi thao tác nhận `workspaceId` (bản DB thật đi qua `withWorkspace`/`withActor`,
 * ghi theo Owner). Hiện chỉ có bản bộ nhớ; bản DB chờ migration (`KB-SAMPLES-PERSIST`).
 */
export interface ExampleStore {
  insert(example: AnswerExample): Promise<void>;
  list(workspaceId: string): Promise<readonly AnswerExample[]>;
  /** `false` khi không có mẫu đó trong workspace này (không lộ mẫu của workspace khác). */
  setStatus(workspaceId: string, id: string, status: ExampleStatus): Promise<boolean>;
  remove(workspaceId: string, ids: readonly string[]): Promise<void>;
  incrementUsed(workspaceId: string, ids: readonly string[]): Promise<void>;
}

/** Kho bộ nhớ dùng cho test/chạy thử (không phải dữ liệu khách). */
export function createInMemoryExampleStore(): ExampleStore {
  let rows: AnswerExample[] = [];
  const patch = (workspaceId: string, ids: readonly string[], change: Partial<AnswerExample>) => {
    rows = rows.map((r) =>
      r.workspaceId === workspaceId && ids.includes(r.id) ? { ...r, ...change } : r,
    );
  };
  return {
    async insert(example) {
      rows = [...rows, example];
    },
    async list(workspaceId) {
      return rows.filter((r) => r.workspaceId === workspaceId);
    },
    async setStatus(workspaceId, id, status) {
      if (!rows.some((r) => r.workspaceId === workspaceId && r.id === id)) return false;
      patch(workspaceId, [id], { status });
      return true;
    },
    async remove(workspaceId, ids) {
      rows = rows.filter((r) => !(r.workspaceId === workspaceId && ids.includes(r.id)));
    },
    async incrementUsed(workspaceId, ids) {
      rows = rows.map((r) =>
        r.workspaceId === workspaceId && ids.includes(r.id)
          ? { ...r, usedCount: r.usedCount + 1 }
          : r,
      );
    },
  };
}
