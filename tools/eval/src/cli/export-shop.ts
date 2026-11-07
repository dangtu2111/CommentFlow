// EVAL-RUNNER: xuất cửa hàng THẬT đã đồng bộ (sản phẩm + biến thể + giá + chính sách) từ DB dev ra tệp cửa hàng mẫu (`datasets/shops/<tên>.json`).
//   pnpm --filter @flow/eval run export-shop --workspace e8f9e1e3-a805-491a-81d5-0612fec8d6a2 --id sswiftly --out datasets/shops/sswiftly.json
// CHỈ ĐỌC, CHỈ `cf_dev` (APP_ENV=dev). Không xuất dữ liệu khách; chỉ danh mục sản phẩm/chính sách của cửa hàng. Không in khóa.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import pg from 'pg';
import type { ShopFixture } from '../shop';
import { shopFixtureSchema } from '../shop';

const { values } = parseArgs({
  options: {
    workspace: { type: 'string' },
    id: { type: 'string' },
    out: { type: 'string' },
    pronoun: { type: 'string', default: 'shop' },
    address: { type: 'string', default: 'you' },
  },
});
if (!values.workspace || !values.id || !values.out) {
  console.error(
    'Cách dùng: export-shop --workspace <uuid> --id <mã> --out <tệp.json> [--pronoun shop] [--address you]',
  );
  process.exit(2);
}
const adminUrl = process.env.DATABASE_ADMIN_URL;
if (process.env.APP_ENV !== 'dev' || !adminUrl || new URL(adminUrl).pathname !== '/cf_dev') {
  console.error('Chỉ chạy được khi APP_ENV=dev và DATABASE_ADMIN_URL trỏ cf_dev.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
try {
  const ws = values.workspace;
  const products = await pool.query<{
    id: string;
    name: string;
    price_vnd: string | null;
    price_minor: string | null;
    currency_code: string;
    stock: number | null;
  }>(
    "SELECT id, name, price_vnd, price_minor, currency_code, stock FROM cf.products WHERE workspace_id = $1 AND status = 'active' ORDER BY name, id",
    [ws],
  );
  const variants = await pool.query<{
    product_id: string;
    attrs: Record<string, string>;
    price_vnd: string | null;
    price_minor: string | null;
    stock: number | null;
  }>(
    "SELECT product_id, attrs, price_vnd, price_minor, stock FROM cf.product_variants WHERE workspace_id = $1 AND status = 'active' ORDER BY product_id, id",
    [ws],
  );
  const aliases = await pool.query<{ product_id: string; alias: string }>(
    'SELECT product_id, alias FROM cf.product_aliases WHERE workspace_id = $1 ORDER BY product_id, alias',
    [ws],
  );
  const policies = await pool.query<{
    id: string;
    lang: string;
    kind: string;
    title: string;
    content: string;
  }>(
    'SELECT id, lang, kind, title, content FROM cf.policy_items WHERE workspace_id = $1 ORDER BY title, id',
    [ws],
  );
  const faqs = await pool.query<{ id: string; lang: string; question: string; answer: string }>(
    'SELECT id, lang, question, answer FROM cf.faq_items WHERE workspace_id = $1 ORDER BY question, id',
    [ws],
  );
  const num = (v: string | null) => (v === null ? null : Number(v));
  const fixture: ShopFixture = shopFixtureSchema.parse({
    id: values.id,
    voice: { shopPronoun: values.pronoun, customerAddress: values.address, do: [], dont: [] },
    products: products.rows.map((p) => ({
      id: p.id,
      name: p.name,
      aliases: aliases.rows.filter((a) => a.product_id === p.id).map((a) => a.alias),
      priceVnd: num(p.price_vnd),
      currencyCode: p.currency_code,
      priceMinor: num(p.price_minor),
      stock: p.stock,
      variants: variants.rows
        .filter((v) => v.product_id === p.id)
        .map((v) => ({
          attrs: v.attrs,
          priceVnd: num(v.price_vnd),
          priceMinor: num(v.price_minor),
          stock: v.stock,
        })),
    })),
    texts: [
      ...policies.rows.map((p) => ({
        id: `policy:${p.id}`,
        kind: 'policy',
        policyKind: p.kind,
        lang: ['vi', 'en', 'all'].includes(p.lang) ? p.lang : 'all',
        title: p.title,
        text: p.content,
      })),
      ...faqs.rows.map((f) => ({
        id: `faq:${f.id}`,
        kind: 'faq',
        policyKind: null,
        lang: ['vi', 'en', 'all'].includes(f.lang) ? f.lang : 'all',
        title: f.question,
        text: f.answer,
      })),
    ],
  });
  writeFileSync(values.out, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  console.log(
    `Đã xuất ${fixture.products.length} sản phẩm, ${fixture.products.reduce((n, p) => n + p.variants.length, 0)} biến thể, ${fixture.texts.length} đoạn chính sách/FAQ → ${values.out}`,
  );
} finally {
  await pool.end();
}
