import { sql } from 'drizzle-orm';
import type { Database } from '../client';

/**
 * Số liệu đầu vào cho "Độ sẵn sàng của AI" (FR-146). CHỈ ĐỌC, một giao dịch `withActor`/`withJob` (RLS theo workspace).
 * Chỉ trả số đếm và cờ có/không — không trả giá, tồn, nội dung chính sách (`left(content, 1)`) để nhẹ và không
 * mang dữ liệu thừa. Hình dạng khớp `ReadinessInput` (trừ `lang`) của `@flow/ai`.
 */
export type ReadinessSourceData = {
  products: {
    withPrice: number;
    withStock: number;
    variantsWithSize: number;
    variantsWithColor: number;
  };
  shopProfiles: Array<{
    lang: 'vi' | 'en' | 'all';
    contact: string | null;
    openingHours: string | null;
    address: string | null;
  }>;
  policies: Array<{
    kind: 'shipping' | 'return' | 'warranty' | 'payment' | 'other';
    lang: 'vi' | 'en' | 'all';
    content: string;
  }>;
  faqs: Array<{ lang: 'vi' | 'en' | 'all'; question: string; tags: string[] }>;
};

type Lang = 'vi' | 'en' | 'all';

export async function loadReadinessSource(
  tx: Database,
  workspaceId: string,
): Promise<ReadinessSourceData> {
  const ws = sql`${workspaceId}::uuid`;
  const [counts, profiles, policies, faqs] = await Promise.all([
    tx.execute<{
      with_price: string;
      with_stock: string;
      with_size: string;
      with_color: string;
    }>(sql`
      SELECT
        (SELECT count(*) FROM cf.products p
          WHERE p.workspace_id = ${ws} AND p.status = 'active'
            AND (p.price_vnd IS NOT NULL OR EXISTS (
              SELECT 1 FROM cf.product_variants v
               WHERE v.workspace_id = p.workspace_id AND v.product_id = p.id
                 AND v.status = 'active' AND v.price_vnd IS NOT NULL))) AS with_price,
        (SELECT count(*) FROM cf.products p
          WHERE p.workspace_id = ${ws} AND p.status = 'active'
            AND (p.stock IS NOT NULL OR EXISTS (
              SELECT 1 FROM cf.product_variants v
               WHERE v.workspace_id = p.workspace_id AND v.product_id = p.id
                 AND v.status = 'active' AND v.stock IS NOT NULL))) AS with_stock,
        (SELECT count(*) FROM cf.product_variants v
           JOIN cf.products p ON p.workspace_id = v.workspace_id AND p.id = v.product_id
          WHERE v.workspace_id = ${ws} AND v.status = 'active' AND p.status = 'active'
            AND jsonb_exists(v.attrs_norm, 'size')) AS with_size,
        (SELECT count(*) FROM cf.product_variants v
           JOIN cf.products p ON p.workspace_id = v.workspace_id AND p.id = v.product_id
          WHERE v.workspace_id = ${ws} AND v.status = 'active' AND p.status = 'active'
            AND jsonb_exists(v.attrs_norm, 'color')) AS with_color`),
    tx.execute<{
      lang: Lang;
      contact: string | null;
      opening_hours: string | null;
      address: string | null;
    }>(sql`
      SELECT lang, contact, opening_hours, address
        FROM cf.shop_profiles WHERE workspace_id = ${ws}`),
    tx.execute<{
      kind: ReadinessSourceData['policies'][number]['kind'];
      lang: Lang;
      content: string;
    }>(
      sql`SELECT kind, lang, left(content, 1) AS content
            FROM cf.policy_items WHERE workspace_id = ${ws}`,
    ),
    tx.execute<{ lang: Lang; question: string; tags: string[] }>(
      sql`SELECT lang, question, tags FROM cf.faq_items WHERE workspace_id = ${ws} AND status = 'published'`,
    ),
  ]);

  const c = counts.rows[0];
  return {
    products: {
      withPrice: Number(c?.with_price ?? 0),
      withStock: Number(c?.with_stock ?? 0),
      variantsWithSize: Number(c?.with_size ?? 0),
      variantsWithColor: Number(c?.with_color ?? 0),
    },
    shopProfiles: profiles.rows.map((r) => ({
      lang: r.lang,
      contact: r.contact,
      openingHours: r.opening_hours,
      address: r.address,
    })),
    policies: policies.rows,
    faqs: faqs.rows,
  };
}
