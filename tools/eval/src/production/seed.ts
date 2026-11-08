import { createHash } from 'node:crypto';
import { normalizeAttrs, normalizeSearchText, productSearchText } from '@flow/shared';
import type pg from 'pg';
import { EVAL_WORKSPACE } from '../eval-workspace';
import type { ShopFixture } from '../shop';

/**
 * Nạp shop file vào workspace `[EVAL]` CỐ ĐỊNH (cf_dev) bằng SQL của quản trị (bỏ qua RLS — chỉ cf_dev/cf_test): sản phẩm, biến thể, bí danh,
 * chính sách, FAQ. Sau đó `runKbSync` + `runKbPublish` (đúng đường production) biến chúng thành đoạn kiến thức + vector. Mỗi lần nạp làm
 * workspace KHỚP shop file (xóa nội dung cũ rồi chép lại), nên chạy lại cùng shop file là idempotent về nội dung.
 */
export const EVAL_USER = {
  id: '00000000-0000-4000-8000-00000000e7a2',
  email: 'eval-runner@example.invalid',
  name: '[EVAL] bộ chạy đánh giá',
} as const;

const POLICY_KINDS = ['shipping', 'return', 'warranty', 'payment', 'other'] as const;
type PolicyKindDb = (typeof POLICY_KINDS)[number];

/** UUID ỔN ĐỊNH theo (cửa hàng, loại, mã mục): chạy lại cùng shop file ra cùng id → cùng `chunk_key`/`content_hash` → KHÔNG tạo phiên bản kiến thức thừa. */
export function stableId(shopId: string, kind: string, itemId: string): string {
  const h = createHash('sha1').update(`${shopId}:${kind}:${itemId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const policyKindOf = (value: string | null): PolicyKindDb =>
  (POLICY_KINDS as readonly string[]).includes(value ?? '') ? (value as PolicyKindDb) : 'other';

/** Chỉ cho cf_dev / cf_test*: tên DB trong chuỗi kết nối quản trị. */
export function assertDevDatabase(adminUrl: string): void {
  let name = '';
  try {
    name = new URL(adminUrl).pathname.replace(/^\//, '');
  } catch {}
  if (!/^(cf_dev|cf_test(_[a-z0-9]{1,8})?)$/.test(name)) {
    throw new Error('Nạp [EVAL] chỉ chạy trên cf_dev/cf_test (DATABASE_ADMIN_URL).');
  }
}

export type SeedSummary = {
  workspaceId: string;
  products: number;
  variants: number;
  aliases: number;
  policies: number;
  faqs: number;
};

export async function seedEvalWorkspace(pool: pg.Pool, shop: ShopFixture): Promise<SeedSummary> {
  const ws = EVAL_WORKSPACE.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO core.users (id, email, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [EVAL_USER.id, EVAL_USER.email, EVAL_USER.name],
    );
    await client.query(
      'INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [ws, EVAL_WORKSPACE.name, EVAL_WORKSPACE.slug],
    );
    for (const table of [
      'product_aliases',
      'product_variants',
      'products',
      'policy_items',
      'faq_items',
    ]) {
      await client.query(`DELETE FROM cf.${table} WHERE workspace_id = $1`, [ws]);
    }
    let variants = 0;
    let aliases = 0;
    for (const product of shop.products) {
      const searchText = productSearchText({
        name: product.name,
        sku: null,
        variants: product.variants.map((v) => ({ attrs: v.attrs })),
        aliases: product.aliases,
      });
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO cf.products (id, workspace_id, source, name, price_vnd, currency_code, price_minor, stock, variants, search_text)
         VALUES ($9, $1, 'manual', $2, $3, $4, $5, $6, $7::jsonb, $8) RETURNING id`,
        [
          ws,
          product.name,
          product.priceVnd,
          product.currencyCode,
          product.priceMinor,
          product.stock,
          JSON.stringify(product.variants.map((v) => ({ attrs: v.attrs }))),
          searchText,
          stableId(shop.id, 'product', product.id),
        ],
      );
      const productId = inserted.rows[0]?.id as string;
      for (const variant of product.variants) {
        await client.query(
          `INSERT INTO cf.product_variants (workspace_id, product_id, attrs, attrs_norm, price_vnd, currency_code, price_minor, stock)
           VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8)`,
          [
            ws,
            productId,
            JSON.stringify(variant.attrs),
            JSON.stringify(normalizeAttrs(variant.attrs)),
            variant.priceVnd,
            product.currencyCode,
            variant.priceMinor,
            variant.stock,
          ],
        );
        variants += 1;
      }
      for (const alias of new Set(product.aliases)) {
        const norm = normalizeSearchText(alias);
        if (norm === '') continue;
        await client.query(
          `INSERT INTO cf.product_aliases (workspace_id, product_id, alias, alias_norm, source)
           VALUES ($1, $2, $3, $4, 'staff') ON CONFLICT DO NOTHING`,
          [ws, productId, alias, norm],
        );
        aliases += 1;
      }
    }
    let policies = 0;
    let faqs = 0;
    for (const text of shop.texts) {
      if (text.kind === 'policy') {
        await client.query(
          'INSERT INTO cf.policy_items (id, workspace_id, kind, lang, title, content) VALUES ($6, $1, $2, $3, $4, $5)',
          [
            ws,
            policyKindOf(text.policyKind),
            text.lang,
            text.title,
            text.text,
            stableId(shop.id, 'policy', text.id),
          ],
        );
        policies += 1;
      } else {
        await client.query(
          'INSERT INTO cf.faq_items (id, workspace_id, question, answer, lang, tags) VALUES ($6, $1, $2, $3, $4, $5)',
          [ws, text.title, text.text, text.lang, [], stableId(shop.id, 'faq', text.id)],
        );
        faqs += 1;
      }
    }
    await client.query('COMMIT');
    return { workspaceId: ws, products: shop.products.length, variants, aliases, policies, faqs };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
