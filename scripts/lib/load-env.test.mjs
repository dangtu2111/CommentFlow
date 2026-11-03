import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRepoEnv } from './load-env.mjs';

const KEYS = [
  'CF_T_ONLY_BASE',
  'CF_T_BOTH',
  'CF_T_ONLY_LOCAL',
  'CF_T_OS',
  'CF_LANE',
  'TEST_DATABASE_URL',
  'TEST_DATABASE_ADMIN_URL',
  'TEST_DATABASE_AUTH_URL',
  'DATABASE_URL',
];
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

describe('CF_LANE (DB test riêng cho mỗi làn)', () => {
  const urls = {
    TEST_DATABASE_URL: 'postgresql://cf_app:p@h:5433/cf_test',
    TEST_DATABASE_ADMIN_URL: 'postgresql://cf_owner:p@h:5433/cf_test',
    TEST_DATABASE_AUTH_URL: 'postgresql://cf_auth:p@h:5433/cf_test',
    DATABASE_URL: 'postgresql://cf_app:p@h:5433/cf_dev',
  };
  const envText = Object.entries(urls)
    .map(([k, v]) => `${k}=${v}
`)
    .join('');

  function load(lane) {
    if (lane !== undefined) process.env.CF_LANE = lane;
    const { dir, url } = repoWith({ '.env': envText });
    try {
      loadRepoEnv(url);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('CF_LANE=b đổi cả ba URL test sang cf_test_b, giữ DATABASE_URL (dev)', () => {
    load('b');
    expect(process.env.TEST_DATABASE_URL).toBe('postgresql://cf_app:p@h:5433/cf_test_b');
    expect(process.env.TEST_DATABASE_ADMIN_URL).toBe('postgresql://cf_owner:p@h:5433/cf_test_b');
    expect(process.env.TEST_DATABASE_AUTH_URL).toBe('postgresql://cf_auth:p@h:5433/cf_test_b');
    expect(process.env.DATABASE_URL).toBe(urls.DATABASE_URL);
  });

  it('không đặt CF_LANE (hoặc rỗng) thì giữ nguyên cf_test', () => {
    load(undefined);
    expect(process.env.TEST_DATABASE_URL).toBe(urls.TEST_DATABASE_URL);
    load('');
    expect(process.env.TEST_DATABASE_URL).toBe(urls.TEST_DATABASE_URL);
  });

  it('tên làn sai định dạng bị từ chối', () => {
    for (const lane of ['B', 'a b', 'a;b', '../x', 'toolonglane', 'a-b']) {
      process.env.CF_LANE = lane;
      expect(() => load(lane)).toThrow(/CF_LANE/);
    }
  });

  it('không đổi URL không trỏ tới cf_test (ví dụ cf_ci)', () => {
    const { dir, url } = repoWith({ '.env': 'TEST_DATABASE_URL=postgresql://u:p@h:1/cf_ci\n' });
    process.env.CF_LANE = 'a';
    try {
      loadRepoEnv(url);
      expect(process.env.TEST_DATABASE_URL).toBe('postgresql://u:p@h:1/cf_ci');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
