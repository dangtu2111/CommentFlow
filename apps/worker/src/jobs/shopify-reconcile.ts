import { buildShopifyImportPlan, type ShopifyConnector } from '@flow/connectors';
import type { Database, FlowDb } from '@flow/db';
import {
  canRunManualReconcile,
  checkWebhookTopics,
  type InternalProductSnapshot,
  type ReconcileResult,
  reconcileCatalog,
} from '@flow/shared';
import { z } from 'zod';
import type { Logger } from '../logger';
import { type BatchHandler, workspaceJob } from './run-job';

/**
 * SHOPIFY-RECONCILE (FR-112/113, `docs/09` §7.3, Q-SRC1): đối soát hằng đêm + "Đối soát ngay", MỖI WORKSPACE một job
 * (`workspaceJob` → `withJob`). Lấy danh mục + chủ đề webhook từ Shopify (chỉ đọc) → so với kho nội bộ bằng
 * `reconcileCatalog` (thuần) → GHI NHẬN lệch để Owner duyệt. Job KHÔNG sửa giá/tồn/trạng thái sản phẩm — không có cổng
 * nào cho việc đó. Đăng ký lại webhook thiếu đi qua cổng riêng; thông báo chỉ log khi lỗi.
 *
 * Mọi cổng (`ports`) là interface: bản DB (bảng kết nối cửa hàng + token, `reconcile_runs`/`reconcile_diffs`) cần
 * migration → `SHOPIFY-CONNECT-STORE`/`SHOPIFY-RECONCILE-STORE` (làn b). Bản bộ nhớ ở đây dùng cho test/dev. Chưa đăng
 * ký ở `main.ts`; cờ `SHOPIFY_ENABLED` mặc định TẮT (truyền vào `enabled`).
 *
 * Lỗi lấy dữ liệu (kể cả `RATE_LIMIT`) được ném để pg-boss thử lại và KHÔNG ghi lần chạy dở.
 */

export const ReconcileJobPayloadSchema = z.object({
  workspaceId: z.uuid(),
  trigger: z.enum(['nightly', 'manual']).default('nightly'),
});
export type ReconcileTrigger = z.infer<typeof ReconcileJobPayloadSchema>['trigger'];

export type ReconcileRunRecord = {
  trigger: ReconcileTrigger;
  at: Date;
  result: ReconcileResult;
  webhookMissing: string[];
  webhookRegistered: string[];
  error: string | null;
};

export type ReconcileNotification =
  | { kind: 'price_diffs'; count: number }
  | { kind: 'admin_alert'; webhookMissing: string[]; diffRatioHigh: boolean };

export interface ShopifyReconcilePorts {
  /** Connector đọc của cửa hàng workspace (token lấy từ kho token); `null` = chưa kết nối. */
  connectorFor(tx: Database, workspaceId: string): Promise<ShopifyConnector | null>;
  /** Sản phẩm nguồn Shopify đang hoạt động của workspace (RLS giới hạn qua `tx`). */
  loadInternal(tx: Database, workspaceId: string): Promise<InternalProductSnapshot[]>;
  /** Lần "Đối soát ngay" gần nhất (để giới hạn 1 lần/giờ). */
  lastManualRunAt(tx: Database, workspaceId: string): Promise<Date | null>;
  recordRun(tx: Database, workspaceId: string, run: ReconcileRunRecord): Promise<void>;
  /** Đăng ký lại chủ đề webhook thiếu (ghi lên Shopify — cần scope; chỉ bản thật). */
  registerWebhooks(
    tx: Database,
    workspaceId: string,
    topics: readonly string[],
  ): Promise<{ registered: string[] }>;
  notify(workspaceId: string, notification: ReconcileNotification): Promise<void>;
}

export type ShopifyReconcileDeps = {
  db: FlowDb;
  enabled: boolean;
  ports: ShopifyReconcilePorts;
  now: () => Date;
  logger: Pick<Logger, 'info' | 'error'>;
};

/** Chỉ tên lỗi để log: KHÔNG lấy `message` (có thể chứa tên miền/PII). */
const safeName = (error: unknown) => (error instanceof Error ? error.name.slice(0, 60) : 'unknown');

export function createShopifyReconcileHandler(deps: ShopifyReconcileDeps): BatchHandler {
  const { db, enabled, ports, now, logger } = deps;
  const handler = workspaceJob({
    db,
    schema: ReconcileJobPayloadSchema,
    handler: async ({ tx, workspaceId, payload }) => {
      const at = now();
      if (payload.trigger === 'manual') {
        const gate = canRunManualReconcile(await ports.lastManualRunAt(tx, workspaceId), at);
        if (!gate.allowed) {
          logger.info(
            { workspaceId, retryAfterSeconds: gate.retryAfterSeconds },
            'shopify-reconcile: đối soát thủ công quá sớm, bỏ qua',
          );
          return;
        }
      }
      const connector = await ports.connectorFor(tx, workspaceId);
      if (connector === null) {
        logger.info({ workspaceId }, 'shopify-reconcile: chưa kết nối cửa hàng, bỏ qua');
        return;
      }
      // Lỗi lấy dữ liệu → ném (chưa ghi gì), pg-boss thử lại.
      const [catalog, topics, mine] = await Promise.all([
        connector.fetchCatalog(),
        connector.listWebhookSubscriptions(),
        ports.loadInternal(tx, workspaceId),
      ]);
      const webhooks = checkWebhookTopics(topics);
      let webhookRegistered: string[] = [];
      if (!webhooks.ok) {
        try {
          webhookRegistered = (await ports.registerWebhooks(tx, workspaceId, webhooks.missing))
            .registered;
        } catch (error) {
          logger.error(
            { workspaceId, error: safeName(error) },
            'shopify-reconcile: đăng ký lại webhook thất bại',
          );
        }
      }
      const result = reconcileCatalog(buildShopifyImportPlan(catalog), mine, {
        webhookMissing: webhooks.missing,
      });
      await ports.recordRun(tx, workspaceId, {
        trigger: payload.trigger,
        at,
        result,
        webhookMissing: webhooks.missing,
        webhookRegistered,
        error: null,
      });

      const notifications: ReconcileNotification[] = [];
      if (result.alerts.notifyOwner) {
        notifications.push({ kind: 'price_diffs', count: result.summary.priceDiffs });
      }
      if (result.alerts.alertAdmin) {
        notifications.push({
          kind: 'admin_alert',
          webhookMissing: webhooks.missing,
          diffRatioHigh: result.alerts.diffRatioHigh,
        });
      }
      for (const notification of notifications) {
        try {
          await ports.notify(workspaceId, notification);
        } catch (error) {
          logger.error(
            { workspaceId, kind: notification.kind, error: safeName(error) },
            'shopify-reconcile: gửi thông báo thất bại',
          );
        }
      }
      logger.info(
        { workspaceId, trigger: payload.trigger, diffs: result.summary.diffs },
        'shopify-reconcile: xong',
      );
    },
  });
  return async (jobs) => {
    if (!enabled) {
      logger.info({}, 'shopify-reconcile: SHOPIFY_ENABLED tắt, bỏ qua');
      return;
    }
    await handler(jobs);
  };
}

/** Kho bộ nhớ cho test/dev (theo workspace) — bản DB là `SHOPIFY-RECONCILE-STORE` (cần migration). */
export function createInMemoryReconcileStore() {
  const byWorkspace = new Map<string, ReconcileRunRecord[]>();
  const list = (workspaceId: string) => {
    const existing = byWorkspace.get(workspaceId);
    if (existing) return existing;
    const created: ReconcileRunRecord[] = [];
    byWorkspace.set(workspaceId, created);
    return created;
  };
  const emptyResult = reconcileCatalog([], []);
  return {
    runs: (workspaceId: string): ReconcileRunRecord[] => [...(byWorkspace.get(workspaceId) ?? [])],
    /** Gieo một lần chạy cũ (chỉ test). */
    seedRun(workspaceId: string, run: Pick<ReconcileRunRecord, 'trigger' | 'at'>): void {
      list(workspaceId).push({
        ...run,
        result: emptyResult,
        webhookMissing: [],
        webhookRegistered: [],
        error: null,
      });
    },
    ports: {
      async lastManualRunAt(_tx: Database, workspaceId: string): Promise<Date | null> {
        const manual = list(workspaceId).filter((r) => r.trigger === 'manual');
        return manual.length === 0
          ? null
          : new Date(Math.max(...manual.map((r) => r.at.getTime())));
      },
      async recordRun(_tx: Database, workspaceId: string, run: ReconcileRunRecord): Promise<void> {
        list(workspaceId).push(run);
      },
    },
  };
}
