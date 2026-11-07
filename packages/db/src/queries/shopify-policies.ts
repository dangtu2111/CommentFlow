import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Chính sách cửa hàng Shopify (Cài đặt › Chính sách) nạp vào `cf.policy_items` (migration 0067). Mục nạp từ Shopify mang
 * `external_key = shopify:<loại>`: lần sau cập nhật đúng mục đó, mục biến mất thì xóa; mục Owner nhập tay (external_key NULL)
 * KHÔNG bao giờ bị đụng. PHẢI gọi trong một giao dịch có ngữ cảnh workspace (`withJob`/`withActor`); đầu vào `content` đã là
 * văn bản thuần (qua `htmlToPlainText`).
 */
export type ShopifyPolicyInput = { type: string; title: string; content: string };
export type ShopifyPolicyApplyResult = { policiesUpdated: number; policiesRemoved: number };

const TITLE_MAX = 200;
const CONTENT_MAX = 8000;
const TYPE_KEY = /^[A-Za-z0-9_]{1,60}$/;

export function shopifyPolicyKind(type: string): 'shipping' | 'return' | 'other' {
  if (type === 'SHIPPING_POLICY') return 'shipping';
  if (type === 'REFUND_POLICY') return 'return';
  return 'other';
}

export async function applyShopifyPolicies(
  tx: Database,
  workspaceId: string,
  policies: readonly ShopifyPolicyInput[],
): Promise<ShopifyPolicyApplyResult> {
  const valid = policies.flatMap((policy) => {
    const content = policy.content.trim().slice(0, CONTENT_MAX);
    const title = policy.title.trim().slice(0, TITLE_MAX);
    if (!TYPE_KEY.test(policy.type) || content === '' || title === '') return [];
    return [
      {
        key: `shopify:${policy.type.toLowerCase()}`,
        kind: shopifyPolicyKind(policy.type),
        title,
        content,
      },
    ];
  });
  // Chốt an toàn: không có gì hợp lệ (lỗi/rỗng) thì KHÔNG cập nhật và KHÔNG dọn.
  if (valid.length === 0) return { policiesUpdated: 0, policiesRemoved: 0 };

  for (const policy of valid) {
    await tx.execute(sql`
      INSERT INTO cf.policy_items (workspace_id, kind, lang, title, content, external_key)
      VALUES (${workspaceId}::uuid, ${policy.kind}, 'all', ${policy.title}, ${policy.content}, ${policy.key})
      ON CONFLICT (workspace_id, external_key) WHERE external_key IS NOT NULL DO UPDATE SET
        title = EXCLUDED.title, content = EXCLUDED.content, updated_at = now()`);
  }
  const keep = sql`ARRAY[${sql.join(
    valid.map((policy) => sql`${policy.key}`),
    sql`, `,
  )}]::text[]`;
  const removed = await tx.execute(sql`
    DELETE FROM cf.policy_items
     WHERE workspace_id = ${workspaceId}::uuid AND external_key LIKE 'shopify:%' AND NOT (external_key = ANY(${keep}))`);
  return { policiesUpdated: valid.length, policiesRemoved: removed.rowCount ?? 0 };
}
