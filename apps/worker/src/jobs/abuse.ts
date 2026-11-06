import {
  type AbuseDecision,
  type AbuseInput,
  type AbuseNotification,
  type AbuseSink,
  type AutoPauseService,
  evaluateAbuse,
} from '@flow/ai';
import type { Database, FlowDb } from '@flow/db';
import { AppError } from '@flow/shared';
import { z } from 'zod';
import type { Logger } from '../logger';
import { type BatchHandler, workspaceJob } from './run-job';

/**
 * ABUSE-JOB (FR-115, `docs/09` §11.2): job `abuse` chạy 15 phút/lần, MỖI WORKSPACE một job (`workspaceJob` → `withJob`).
 * Gom số liệu (qua `AbuseMetricsSource`) → `evaluateAbuse` (thuần) → áp: dừng tự gửi (`AutoPauseService.apply`),
 * khóa kênh, hàng xem xét + chặn tự gửi, ghi tín hiệu, thông báo Owner/Admin. KHÔNG có đường ẩn bình luận.
 *
 * Mọi hiệu ứng idempotent nên job được thử lại an toàn. Thông báo lỗi chỉ log (cờ đã đặt rồi — không làm job lỗi để
 * tránh thử lại vô ích); các lỗi khác ném sau khi đã cố làm hết các bước còn lại để pg-boss thử lại.
 * Bản DB của nguồn số liệu/sink + lịch 15 phút phát từng workspace: `ABUSE-JOB-WIRE` (cần migration — làn b).
 */

/** Hàng đợi `abuse` khai ở `queue/definitions.ts` (`ABUSE_QUEUE`). */
export const ABUSE_INTERVAL_MS = 15 * 60 * 1000;

export const AbuseJobPayloadSchema = z.object({ workspaceId: z.uuid() });
export type AbuseJobPayload = z.infer<typeof AbuseJobPayloadSchema>;

/** Đọc số liệu của MỘT workspace (RLS đã giới hạn qua `tx`). Bản DB làm ở `ABUSE-JOB-WIRE`. */
export interface AbuseMetricsSource {
  load(tx: Database, workspaceId: string, now: Date): Promise<AbuseInput>;
}

export type AbuseJobDeps = {
  db: FlowDb;
  source: AbuseMetricsSource;
  autoPause: AutoPauseService;
  sink: AbuseSink;
  now: () => Date;
  logger: Pick<Logger, 'info' | 'error'>;
};

/** Mã lỗi an toàn để log: KHÔNG lấy `message` (có thể chứa PII). */
const safeName = (error: unknown) => (error instanceof Error ? error.name.slice(0, 60) : 'unknown');

function notificationsFor(
  decision: AbuseDecision,
  newlyPaused: boolean,
  newChannels: readonly string[],
): AbuseNotification[] {
  const list: AbuseNotification[] = [];
  const paused = decision.autoPause.pauseWorkspace;
  if (newlyPaused && paused) list.push({ kind: 'workspace_paused', reason: paused.reason });
  for (const s of decision.autoPause.suspendChannels) {
    if (newChannels.includes(s.channelId)) {
      list.push({ kind: 'channel_suspended', channelId: s.channelId, reason: s.reason });
    }
  }
  for (const warning of decision.warnAdmin) list.push({ kind: 'admin_warning', warning });
  return list;
}

export function createAbuseHandler(deps: AbuseJobDeps): BatchHandler {
  const { db, source, autoPause, sink, now, logger } = deps;
  return workspaceJob({
    db,
    schema: AbuseJobPayloadSchema,
    handler: async ({ tx, workspaceId }) => {
      const at = now();
      // Lỗi đọc số liệu → ném ngay (chưa đặt cờ nào), pg-boss thử lại.
      const input = await source.load(tx, workspaceId, at);
      // Nguồn trả số liệu của workspace khác → không áp hiệu ứng (tránh dừng/khóa nhầm).
      if (input.workspaceId !== workspaceId) {
        throw new AppError('INTERNAL', 'Nguồn số liệu abuse trả sai workspace.');
      }
      const decision = evaluateAbuse(input, at);
      let failed = false;
      const attempt = async <T>(step: string, run: () => Promise<T>): Promise<T | undefined> => {
        try {
          return await run();
        } catch (error) {
          failed = true;
          logger.error({ workspaceId, step, error: safeName(error) }, 'abuse: bước thất bại');
          return undefined;
        }
      };

      // Cờ dừng trước nhất: đó là hiệu ứng an toàn quan trọng nhất.
      const applied = await attempt('apply', () =>
        autoPause.apply(workspaceId, decision.autoPause),
      );
      if (applied?.error || applied?.cancelFailed) failed = true;
      const newChannels =
        (await attempt('suspend_channels', () =>
          sink.suspendChannels(workspaceId, decision.autoPause.suspendChannels),
        )) ?? [];
      if (decision.reviewItems.length > 0) {
        await attempt('review', () =>
          sink.enqueueReview(workspaceId, {
            blockAutoSend: decision.blockAutoSend,
            items: decision.reviewItems,
          }),
        );
      }
      if (decision.signals.length > 0) {
        await attempt('signals', () => sink.recordSignals(workspaceId, decision.signals));
      }

      for (const notification of notificationsFor(
        decision,
        applied?.newlyPaused === true,
        newChannels,
      )) {
        try {
          await sink.notify(workspaceId, notification);
        } catch (error) {
          logger.error(
            { workspaceId, kind: notification.kind, error: safeName(error) },
            'abuse: gửi thông báo thất bại',
          );
        }
      }

      logger.info(
        { workspaceId, signals: decision.signals.length, paused: applied?.paused === true },
        'abuse: xong',
      );
      if (failed) throw new AppError('INTERNAL', 'Job abuse chưa áp hết hiệu ứng, sẽ thử lại.');
    },
  });
}
