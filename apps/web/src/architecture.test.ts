import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname);
const IMPORT_RE = /(?:from|import)\s+['"]([^'"]+)['"]/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(IMPORT_RE)].map((match) => match[1] as string);
}

const rel = (file: string) => relative(SRC, file).split(sep).join('/');
const inKit = (file: string) => /^components\/(ui|patterns)\//.test(rel(file));

describe('UI-KIT quy tắc kiến trúc giao diện', () => {
  it('components/ui và components/patterns không import ngược từ app/', () => {
    const violations = walk(SRC)
      .filter(inKit)
      .flatMap((file) =>
        importsOf(file)
          .filter((spec) => spec.startsWith('.'))
          .filter((spec) => rel(resolve(dirname(file), spec)).startsWith('app/'))
          .map((spec) => `${rel(file)} → ${spec}`),
      );
    expect(violations).toEqual([]);
  });

  it('thành phần kit chỉ import CSS cùng thư mục của chính nó', () => {
    const violations = walk(SRC)
      .filter(inKit)
      .flatMap((file) =>
        importsOf(file)
          .filter((spec) => spec.endsWith('.css'))
          .filter((spec) => !/^\.\/[\w-]+\.css$/.test(spec))
          .map((spec) => `${rel(file)} → ${spec}`),
      );
    expect(violations).toEqual([]);
  });

  it('trang trong app/ không import CSS (CSS nằm ở kit/styles, nạp ở layout gốc)', () => {
    const violations = walk(join(SRC, 'app'))
      .filter((file) => rel(file) !== 'app/layout.tsx')
      .flatMap((file) =>
        importsOf(file)
          .filter((spec) => spec.endsWith('.css'))
          .map((spec) => `${rel(file)} → ${spec}`),
      );
    expect(violations).toEqual([]);
  });

  it('mỗi *.css của kit đi cùng một thành phần cùng tên (trừ ui.css)', () => {
    const names = readdirSync(join(SRC, 'components/ui'));
    const orphans = names.filter(
      (name) =>
        name.endsWith('.css') && name !== 'ui.css' && !names.includes(name.replace('.css', '.tsx')),
    );
    expect(orphans).toEqual([]);
  });
});
