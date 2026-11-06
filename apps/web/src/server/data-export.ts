import {
  type DataExportRow,
  type FlowDb,
  listDataExports,
  requestDataExport,
} from '@flow/db/runtime';
import { DATA_EXPORT_QUEUE } from '@flow/shared';
import { getDb } from './db';
import { enqueueJob } from './queue';

/**
 * Yêu cầu xuất dữ liệu workspace (FR-094, Q-EXP1). Web chỉ tạo yêu cầu (một giao dịch `withActor`, RLS chỉ cho Owner) và
 * xếp job `data-export` (chỉ id); worker kiểm lại Owner, đọc/che PII/ghi tệp. Cờ `DATA_EXPORT_ENABLED` MẶC ĐỊNH TẮT
 * (chỉ đúng chữ `true` mới bật): tắt thì không chạm DB, không xếp job.
 */
export type DataExportRequestResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'already_active' | 'rate_limited' };

type Ctx = { workspaceId: string; userId: string };
type Deps = {
  db: Pick<FlowDb, 'withActor'>;
  ops: { requestDataExport: typeof requestDataExport; listDataExports: typeof listDataExports };
  enqueue: (queue: string, data: object) => Promise<void>;
  enabled: boolean;
};

export function isDataExportEnabled(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return source.DATA_EXPORT_ENABLED?.trim() === 'true';
}

export function createDataExportService({ db, ops, enqueue, enabled }: Deps) {
  return {
    request: async (ctx: Ctx): Promise<DataExportRequestResult> => {
      if (!enabled) return { ok: false, reason: 'unavailable' };
      const result = await db.withActor(ctx.workspaceId, ctx.userId, (tx) =>
        ops.requestDataExport(tx, ctx.workspaceId, ctx.userId),
      );
      if (result.outcome !== 'created') return { ok: false, reason: result.outcome };
      try {
        await enqueue(DATA_EXPORT_QUEUE, {
          workspaceId: ctx.workspaceId,
          exportId: result.id,
          requestedBy: ctx.userId,
        });
      } catch {
        // Yêu cầu đã ghi nhưng chưa xếp được job: job dọn của worker đánh dấu `failed` (timeout) để Owner yêu cầu lại.
        return { ok: false, reason: 'unavailable' };
      }
      return { ok: true };
    },

    recent: async (ctx: Ctx): Promise<DataExportRow[]> => {
      if (!enabled) return [];
      return db.withActor(ctx.workspaceId, ctx.userId, (tx) =>
        ops.listDataExports(tx, ctx.workspaceId),
      );
    },
  };
}

export const dataExports = () =>
  createDataExportService({
    db: getDb(),
    ops: { requestDataExport, listDataExports },
    enqueue: enqueueJob,
    enabled: isDataExportEnabled(),
  });
