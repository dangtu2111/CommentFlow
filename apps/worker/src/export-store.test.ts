import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalExportStore } from './export-store';

const WS = '00000000-0000-4000-8000-000000000001';
const EX = '00000000-0000-4000-8000-000000000003';
const KEY = `exports/${WS}/${EX}.jsonl`;

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cf-export-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function* lines(...items: string[]) {
  for (const item of items) yield item;
}

describe('FR-094 kho tệp xuất cục bộ', () => {
  it('FR-094 ghi các dòng, trả số byte, xóa được và xóa lần hai không lỗi', async () => {
    const store = createLocalExportStore(dir);
    const result = await store.put(KEY, lines('a\n', 'bé\n'));
    expect(result.bytes).toBe(Buffer.byteLength('a\nbé\n'));
    expect(await readFile(join(dir, KEY), 'utf8')).toBe('a\nbé\n');
    await store.remove(KEY);
    await expect(stat(join(dir, KEY))).rejects.toThrow();
    await expect(store.remove(KEY)).resolves.toBeUndefined();
  });

  it('FR-094 từ chối khóa lạ (đi ra ngoài thư mục, sai dạng)', async () => {
    const store = createLocalExportStore(dir);
    for (const key of [
      '../x.jsonl',
      `exports/${WS}/../../x.jsonl`,
      '/etc/passwd',
      'exports/a/b.jsonl',
    ]) {
      await expect(store.put(key, lines('x'))).rejects.toThrow('export_key_invalid');
      await expect(store.remove(key)).rejects.toThrow('export_key_invalid');
    }
  });

  it('FR-094 nguồn dòng ném lỗi → không để lại tệp đích', async () => {
    const store = createLocalExportStore(dir);
    async function* broken(): AsyncGenerator<string> {
      yield 'a\n';
      throw new Error('boom');
    }
    await expect(store.put(KEY, broken())).rejects.toThrow('boom');
    await expect(stat(join(dir, KEY))).rejects.toThrow();
  });
});
