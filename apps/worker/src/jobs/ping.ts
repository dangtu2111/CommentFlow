import type { FlowDb } from '@flow/db';
import { z } from 'zod';
import type { Logger } from '../logger';
import { type BatchHandler, systemJob } from './run-job';

/** Job mẫu của hạ tầng: chứng minh hàng đợi → worker → ngữ cảnh DB hệ thống chạy thông suốt. */
export const pingPayloadSchema = z.object({ message: z.string().max(200).default('ping') });

export function createPingHandler(db: FlowDb, logger: Pick<Logger, 'info'>): BatchHandler {
  return systemJob({
    db,
    schema: pingPayloadSchema,
    handler: async ({ jobId }) => {
      logger.info({ jobId }, 'system.ping đã xử lý');
    },
  });
}
