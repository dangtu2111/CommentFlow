import type { Database, FlowDb } from '@flow/db';
import { AppError } from '@flow/shared';
import type { Job } from 'pg-boss';
import type { z } from 'zod';

/**
 * Bọc handler của pg-boss để mọi job chạy trong ngữ cảnh DB đúng (docs/13 §4):
 * - workspaceJob: bắt buộc `workspaceId` trong dữ liệu job → withWorkspace (RLS).
 * - systemJob: không có workspace → withSystem (chỉ chạm được bảng hệ thống).
 * Dữ liệu job luôn được kiểm bằng Zod trước khi mở giao dịch.
 */

export type WorkspaceJobContext<P> = {
  tx: Database;
  payload: P;
  workspaceId: string;
  jobId: string;
};

export type SystemJobContext<P> = { tx: Database; payload: P; jobId: string };

export type BatchHandler = (jobs: Job<unknown>[]) => Promise<void>;

function parsePayload<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    // Không đưa dữ liệu job vào thông báo (có thể chứa thông tin khách).
    throw new AppError('VALIDATION_FAILED', 'Dữ liệu job không hợp lệ.');
  }
  return result.data;
}

export function workspaceJob<S extends z.ZodType<{ workspaceId: string }>>(options: {
  db: FlowDb;
  schema: S;
  handler: (context: WorkspaceJobContext<z.output<S>>) => Promise<void>;
}): BatchHandler {
  return async (jobs) => {
    for (const job of jobs) {
      const payload = parsePayload(options.schema, job.data);
      // withJob: đường hệ thống của workspace (policy ghi kênh/bình luận/webhook đòi ngữ cảnh hệ thống, ADR 007).
      await options.db.withJob(payload.workspaceId, (tx) =>
        options.handler({ tx, payload, workspaceId: payload.workspaceId, jobId: job.id }),
      );
    }
  };
}

export function systemJob<S extends z.ZodType>(options: {
  db: FlowDb;
  schema: S;
  handler: (context: SystemJobContext<z.output<S>>) => Promise<void>;
}): BatchHandler {
  return async (jobs) => {
    for (const job of jobs) {
      const payload = parsePayload(options.schema, job.data);
      await options.db.withSystem((tx) => options.handler({ tx, payload, jobId: job.id }));
    }
  };
}
