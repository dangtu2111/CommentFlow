import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CI kiểm (FR-133, EMBED-ACTIVE-MODEL): MỌI đường ghi vector (`kb_chunks.embedding*`, `products.name_embedding*`) nằm trong danh sách file đã duyệt,
 * mỗi nơi ghi KÈM tên model; trigger DB (0079) từ chối ghi sai model từ cf_app/cf_worker. Thêm đường ghi mới = thêm vào danh sách này kèm lý do + test,
 * để không ai tự ghi vector bằng model riêng. (Bản giả embedder đã bị `assertMockAllowed` chặn khi chạy.)
 */
const ROOT = join(__dirname, '..', '..', '..');
const SCAN = ['apps', 'packages', 'tools', 'services'];
const ALLOWED = new Set(
  [
    'packages/db/src/queries/kb-chunks.ts', // lập chỉ mục bản nháp: ghi embedding + embedding_model của embedder đang hoạt động
    'packages/db/src/queries/kb-publish.ts', // xuất bản/khôi phục: sao embedding + embedding_model nguyên trạng
    'packages/db/src/queries/kb-search.ts', // setProductNameEmbedding: ghi kèm model
    'packages/db/src/queries/embedding-state.ts', // cột đệm của kb:switch-embedding (kèm model đệm)
  ].map((p) => p.split('/').join(sep)),
);
// Lệnh ghi SQL vào cột vector: INSERT INTO cf.kb_chunks (… embedding …), hoặc UPDATE cf.kb_chunks/cf.products SET … embedding …
const WRITE = [
  /INSERT\s+INTO\s+cf\.kb_chunks/i,
  /UPDATE\s+cf\.kb_chunks[\s\S]{0,400}?\bembedding/i,
  /UPDATE\s+cf\.products[\s\S]{0,400}?\bname_embedding/i,
];

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (
      name === 'node_modules' ||
      name === '.next' ||
      name === 'dist' ||
      name === '.venv' ||
      name === 'worktrees'
    )
      continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.(test|int\.test|spec)\.tsx?$/.test(name))
      out.push(full);
  }
}

describe('đường ghi vector được kiểm soát', () => {
  it('chỉ các file đã duyệt mới ghi cột vector (kèm model)', () => {
    const files: string[] = [];
    for (const dir of SCAN) walk(join(ROOT, dir), files);
    const offenders = files
      .filter((f) => !relative(ROOT, f).includes(`${sep}migrations${sep}`))
      .filter((f) => !ALLOWED.has(relative(ROOT, f)))
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return WRITE.some((re) => re.test(src));
      })
      .map((f) => relative(ROOT, f));
    expect(offenders, `đường ghi vector chưa được duyệt: ${offenders.join(', ')}`).toEqual([]);
  });

  it('mỗi file được duyệt đều có tên model đi cùng lệnh ghi', () => {
    for (const rel of ALLOWED) {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      expect(
        /embedding_model|name_embedding_model|embedding_next_model|name_embedding_next_model/.test(
          src,
        ),
        rel,
      ).toBe(true);
    }
  });
});
