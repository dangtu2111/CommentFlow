import { type ChannelRef, type ConnectionHealth, isPlatformError } from '@flow/connectors';
import { type ChannelCheckResult, type FlowDb, setChannelAvatar, sql } from '@flow/db';
import { AppError, channelCheckJobSchema } from '@flow/shared';
import type { Logger } from '../logger';
import type { BatchHandler } from './run-job';

export type ChannelCheckSummary = { checked: number; ok: number; problems: number };

/** Trạng thái kênh được hạ xuống khi nền tảng báo token hỏng; `null` = không đổi (lỗi tạm). */
export type ChannelMark = 'expired' | 'revoked' | null;

export type ChannelCheckStore = {
  /** Kênh Facebook đang `connected` của workspace. */
  listConnected(workspaceId: string): Promise<ChannelRef[]>;
  /** Ghi kết quả + thời điểm kiểm; `mark` đặt thêm `status` (chỉ khi còn `connected`). */
  save(
    channel: ChannelRef,
    result: ChannelCheckResult,
    mark: ChannelMark,
    /** Quyền ĐÃ CẤP cho kênh (từ nền tảng); vắng = không đọc được lần này → giữ nguyên `scopes` cũ. */
    granted?: string[],
  ): Promise<void>;
  /** Ghi ảnh đại diện (https) của kênh. Tùy chọn: kho không có thì bỏ qua. */
  saveAvatar?(channel: ChannelRef, url: string): Promise<void>;
};

type Probe = {
  checkConnection: (channel: ChannelRef) => Promise<ConnectionHealth>;
  /** Ảnh đại diện của Page (tùy chọn); lỗi chỉ ghi cảnh báo, không đổi kết quả kiểm kết nối. */
  fetchPagePicture?: (channel: ChannelRef) => Promise<string | null>;
};

/**
 * Kiểm MỘT workspace: với từng kênh `connected`, gọi nền tảng bằng token Page đã lưu (connector `checkConnection`) rồi
 * ghi kết quả. Một kênh lỗi KHÔNG dừng kênh khác; không ném (kết quả nằm ở `last_check_result`). Chỉ `TOKEN_EXPIRED`/
 * `PERMISSION` mới hạ trạng thái kênh — lỗi tạm (mạng, giới hạn tốc độ) chỉ ghi `error`. Không log id kênh, id ngoài
 * hay nội dung lỗi (có thể chứa token).
 */
export async function checkChannels(options: {
  workspaceId: string;
  store: ChannelCheckStore;
  connectorFor: (channel: ChannelRef) => Probe | undefined;
  warn: (event: { event: string; reason: string }) => void;
}): Promise<ChannelCheckSummary> {
  const { store, connectorFor, warn } = options;
  const channels = await store.listConnected(options.workspaceId);
  const summary: ChannelCheckSummary = { checked: 0, ok: 0, problems: 0 };
  for (const channel of channels) {
    summary.checked += 1;
    const probe = connectorFor(channel);
    let result: ChannelCheckResult;
    let mark: ChannelMark = null;
    let granted: string[] | undefined;
    if (!probe) {
      result = 'unavailable';
    } else {
      try {
        const health = await probe.checkConnection(channel);
        result = health.webhookSubscribed === false ? 'webhook_missing' : 'ok';
        granted = health.grantedPermissions;
      } catch (error) {
        if (isPlatformError(error) && error.code === 'TOKEN_EXPIRED') {
          result = 'token_invalid';
          mark = 'expired';
        } else if (isPlatformError(error) && error.code === 'PERMISSION') {
          result = 'token_invalid';
          mark = 'revoked';
        } else {
          result = 'error';
          warn({
            event: 'channel_check_failed',
            reason: isPlatformError(error) ? error.code : 'unknown',
          });
        }
      }
    }
    if (result === 'ok') summary.ok += 1;
    else summary.problems += 1;
    await store.save(channel, result, mark, granted);
    // Làm mới ảnh đại diện khi kết nối còn dùng được (lỗi ở đây KHÔNG ảnh hưởng kết quả kiểm).
    if (
      probe?.fetchPagePicture &&
      store.saveAvatar &&
      (result === 'ok' || result === 'webhook_missing')
    ) {
      try {
        const url = await probe.fetchPagePicture(channel);
        if (url) await store.saveAvatar(channel, url);
      } catch (error) {
        warn({
          event: 'channel_avatar_failed',
          reason: isPlatformError(error) ? error.code : 'unknown',
        });
      }
    }
  }
  return summary;
}

/** Mảng text của Postgres từ danh sách (tham số hóa từng phần tử; rỗng → `'{}'`). */
function textArray(values: readonly string[]) {
  if (values.length === 0) return sql`'{}'::text[]`;
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

/** Nối kho với DB thật: đọc/ghi bằng `withJob` (đường hệ thống; cột kết quả chỉ hệ thống ghi được, migration 0063). */
export function createDbChannelCheckStore(db: Pick<FlowDb, 'withJob'>): ChannelCheckStore {
  return {
    listConnected: (workspaceId) =>
      db.withJob(workspaceId, async (tx) => {
        const result = await tx.execute<{ id: string; external_id: string }>(sql`
          SELECT id, external_id FROM cf.channels
           WHERE workspace_id = ${workspaceId}::uuid AND platform = 'facebook' AND status = 'connected'
           ORDER BY id`);
        return result.rows.map((row) => ({
          id: row.id,
          workspaceId,
          platform: 'facebook' as const,
          externalId: row.external_id,
        }));
      }),
    saveAvatar: (channel, url) =>
      db.withJob(channel.workspaceId, async (tx) => {
        await setChannelAvatar(tx, channel.id, url);
      }),
    save: (channel, result, mark, granted) =>
      db.withJob(channel.workspaceId, async (tx) => {
        await tx.execute(sql`
          UPDATE cf.channels
             SET last_checked_at = now(), last_check_result = ${result},
                 scopes = ${granted === undefined ? sql`scopes` : textArray(granted)},
                 status = CASE WHEN ${mark}::text IS NOT NULL AND status = 'connected' THEN ${mark}::text ELSE status END,
                 updated_at = now()
           WHERE id = ${channel.id}::uuid AND workspace_id = ${channel.workspaceId}::uuid`);
      }),
  };
}

export function createChannelCheckHandler(deps: {
  db: FlowDb;
  connectorFor: (channel: ChannelRef) => Probe | undefined;
  logger: Pick<Logger, 'info' | 'warn'>;
}): BatchHandler {
  const store = createDbChannelCheckStore(deps.db);
  return async (jobs) => {
    for (const job of jobs) {
      const parsed = channelCheckJobSchema.safeParse(job.data);
      // Không đưa dữ liệu job vào thông báo.
      if (!parsed.success) throw new AppError('VALIDATION_FAILED', 'Dữ liệu job không hợp lệ.');
      // Mỗi kênh dùng giao dịch riêng của kho: một kênh lỗi không làm hỏng việc đã ghi của kênh khác.
      const summary = await checkChannels({
        workspaceId: parsed.data.workspaceId,
        store,
        connectorFor: deps.connectorFor,
        warn: (event) => deps.logger.warn(event, 'kiểm tra kết nối kênh'),
      });
      deps.logger.info(summary, 'kiểm tra kết nối kênh xong');
    }
  };
}
