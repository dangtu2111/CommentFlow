import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Test QUÉT (AUTH-HARDEN-4): mọi điểm vào của khu `/app` phải gọi `requireAppUser(`.
 *  - file `page.tsx`, `layout.tsx`, `route.ts(x)` dưới `app/app/**`: có lời gọi;
 *  - file `'use server'` dưới `app/app/**`: MỖI hàm export async có lời gọi trong thân hàm;
 *  - không có `'use server'` nội tuyến (hàm action khai báo trong file khác) — vì không quét được thân hàm.
 * Muốn miễn một file phải thêm vào EXEMPT kèm lý do (hiện không có).
 */
const APP_DIR = join(__dirname, '..', 'app', 'app');
const EXEMPT: Record<string, string> = {};
const CALL = 'requireAppUser(';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const isEntry = (file: string) => /(^|[\\/])(page|layout)\.tsx$|(^|[\\/])route\.tsx?$/.test(file);
/** Bỏ chú thích để một dòng comment nhắc tới requireAppUser( không đánh lừa bộ quét. */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const startsWithUseServer = (text: string) => /^\s*(['"])use server\1/.test(text);

/** Tách thân từng `export async function` thành [tên, thân] (đến hàm export kế tiếp hoặc hết file). */
function exportedActionBodies(text: string): Array<[string, string]> {
  const re = /export\s+async\s+function\s+(\w+)/g;
  const marks = [...text.matchAll(re)];
  return marks.map((m, i) => [
    m[1] as string,
    text.slice(m.index, marks[i + 1]?.index ?? text.length),
  ]);
}

function violationsOf(file: string, source: string): string[] {
  const text = stripComments(source);
  const out: string[] = [];
  if (startsWithUseServer(text)) {
    const bodies = exportedActionBodies(text);
    if (bodies.length === 0) out.push(`${file}: file 'use server' không có hàm export nào`);
    for (const [name, body] of bodies)
      if (!body.includes(CALL)) out.push(`${file}: action ${name} thiếu ${CALL})`);
    if (/export\s+(?!async\s+function)/.test(text.replace(/export\s+type\b[^;]*;?/g, '')))
      out.push(`${file}: 'use server' chỉ được export hàm async`);
  } else if (isEntry(file)) {
    if (!text.includes(CALL)) out.push(`${file}: thiếu ${CALL})`);
    if (/['"]use server['"]/.test(text))
      out.push(`${file}: 'use server' nội tuyến không được quét`);
  } else if (/['"]use server['"]/.test(text)) {
    out.push(`${file}: 'use server' nội tuyến không được quét`);
  }
  return out;
}

describe('requireAppUser bao phủ khu /app', () => {
  const files = listFiles(APP_DIR)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => ({ rel: relative(APP_DIR, f).split(sep).join('/'), full: f }))
    .filter((f) => !(f.rel in EXEMPT));

  it('quét thấy các điểm vào đã biết (chống quét rỗng)', () => {
    const rels = files.map((f) => f.rel);
    expect(rels).toContain('security/page.tsx');
    expect(rels).toContain('security/actions.ts');
    expect(rels).toContain('(guarded)/layout.tsx');
  });

  it('không file nào thiếu requireAppUser', () => {
    const violations = files.flatMap((f) => violationsOf(f.rel, readFileSync(f.full, 'utf8')));
    expect(violations).toEqual([]);
  });
});

describe('violationsOf (ca âm tính — bộ quét thật sự bắt được lỗi)', () => {
  it('page thiếu helper → báo', () => {
    expect(violationsOf('x/page.tsx', 'export default function P() { return null; }')).toHaveLength(
      1,
    );
  });

  it('action thiếu helper → báo đúng tên hàm', () => {
    const text = `'use server';
export async function good() {
  await requireAppUser({});
}
export async function bad() {
  return 1;
}`;
    const v = violationsOf('x/actions.ts', text);
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('bad');
  });

  it('action có helper ở mọi hàm → sạch', () => {
    const text = `'use server';
export async function a() { await requireAppUser({}); }
export async function b() { await requireAppUser({}); }`;
    expect(violationsOf('x/actions.ts', text)).toEqual([]);
  });

  it("'use server' nội tuyến trong page → báo (không quét được)", () => {
    const text = `export default async function P() {
  await requireAppUser({});
  async function act() { 'use server'; }
  return null;
}`;
    expect(violationsOf('x/page.tsx', text)).toHaveLength(1);
  });

  it('route.ts thiếu helper → báo; có helper → sạch', () => {
    expect(violationsOf('x/route.ts', 'export async function GET() {}')).toHaveLength(1);
    expect(
      violationsOf('x/route.ts', 'export async function GET() { await requireAppUser({}); }'),
    ).toEqual([]);
  });

  it('file use server export hằng số → báo', () => {
    const text = `'use server';
export const X = 1;
export async function a() { await requireAppUser({}); }`;
    expect(violationsOf('x/actions.ts', text).length).toBeGreaterThan(0);
  });
});

describe('violationsOf: chú thích không đánh lừa bộ quét', () => {
  it('requireAppUser( chỉ nằm trong comment → vẫn báo thiếu', () => {
    const page = `// TODO: gọi requireAppUser() sau\nexport default function P() { return null; }`;
    expect(violationsOf('x/page.tsx', page)).toHaveLength(1);
    const action = `'use server';\nexport async function a() {\n  /* await requireAppUser({}); */\n  return 1;\n}`;
    expect(violationsOf('x/actions.ts', action)).toHaveLength(1);
  });
});
