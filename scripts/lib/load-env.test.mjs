import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRepoEnv } from './load-env.mjs';

const KEYS = ['CF_T_ONLY_BASE', 'CF_T_BOTH', 'CF_T_ONLY_LOCAL', 'CF_T_OS'];
afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

function repoWith(files) {
  const dir = mkdtempSync(join(tmpdir(), 'cf-env-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return { dir, url: pathToFileURL(`${dir}/`) };
}

describe('loadRepoEnv', () => {
  it('.env.local thắng .env; biến chỉ có ở một file vẫn được nạp', () => {
    const { dir, url } = repoWith({
      '.env': 'CF_T_ONLY_BASE=a\nCF_T_BOTH=base\n',
      '.env.local': 'CF_T_BOTH=local\nCF_T_ONLY_LOCAL=b\n',
    });
    try {
      loadRepoEnv(url);
      expect(process.env.CF_T_BOTH).toBe('local');
      expect(process.env.CF_T_ONLY_BASE).toBe('a');
      expect(process.env.CF_T_ONLY_LOCAL).toBe('b');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('biến của hệ điều hành/CI thắng cả hai file', () => {
    process.env.CF_T_OS = 'os';
    const { dir, url } = repoWith({ '.env': 'CF_T_OS=base\n', '.env.local': 'CF_T_OS=local\n' });
    try {
      loadRepoEnv(url);
      expect(process.env.CF_T_OS).toBe('os');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('thiếu cả hai file (CI) không lỗi', () => {
    const { dir, url } = repoWith({});
    try {
      expect(() => loadRepoEnv(url)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
