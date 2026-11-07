import { describe, expect, it } from 'vitest';
import { decideJobs, mustRunAll } from './ci-changes.mjs';

const ALL = { database: true, e2e: true, python: true };
const NONE = { database: false, e2e: false, python: false };

describe('decideJobs', () => {
  it('chỉ docs/design/*.md → không job nặng nào', () => {
    expect(decideJobs(['docs/decisions/015-x.md', 'design/stitch/a.png', 'README.md'])).toEqual(
      NONE,
    );
    expect(decideJobs(['apps/web/README.md'])).toEqual(NONE);
  });

  it('chỉ DB (migrations/tests/src) → database, không e2e', () => {
    for (const p of [
      'packages/db/migrations/0001.sql',
      'packages/db/tests/a.test.ts',
      'packages/db/src/x.ts',
    ]) {
      expect(decideJobs([p])).toEqual({ ...NONE, database: true });
    }
  });

  it('chỉ apps/web hoặc e2e → e2e, không database', () => {
    expect(decideJobs(['apps/web/src/components/a.tsx'])).toEqual({ ...NONE, e2e: true });
    expect(decideJobs(['e2e/tests/a.spec.ts'])).toEqual({ ...NONE, e2e: true });
  });

  it('apps/web/src/server → cả database và e2e', () => {
    expect(decideJobs(['apps/web/src/server/db.ts'])).toEqual({
      ...NONE,
      database: true,
      e2e: true,
    });
  });

  it('saas-core, shared → database và e2e', () => {
    const both = { ...NONE, database: true, e2e: true };
    expect(decideJobs(['packages/saas-core/src/a.ts'])).toEqual(both);
    expect(decideJobs(['packages/shared/src/a.ts'])).toEqual(both);
  });

  it('services/ml → python; apps/worker → database', () => {
    expect(decideJobs(['services/ml/src/a.py'])).toEqual({ ...NONE, python: true });
    expect(decideJobs(['apps/worker/src/a.ts'])).toEqual({ ...NONE, database: true });
  });

  it('file chung → chạy hết', () => {
    for (const p of [
      '.github/workflows/ci.yml',
      'package.json',
      'pnpm-lock.yaml',
      'tsconfig.base.json',
      'apps/web/tsconfig.json',
      'biome.json',
      'scripts/precheck.mjs',
      'pnpm-workspace.yaml',
      'infra/postgres/init/x.sh',
      '.nvmrc',
    ]) {
      expect(decideJobs([p, 'docs/a.md'])).toEqual(ALL);
    }
  });

  it('package.json của gói con không phải file chung', () => {
    expect(decideJobs(['apps/web/package.json'])).toEqual({ ...NONE, e2e: true });
  });

  it('đường dẫn lạ → chạy hết', () => {
    expect(decideJobs(['packages/ai/src/a.ts'])).toEqual(ALL);
    expect(decideJobs(['docs/a.md', 'cai-gi-do/x.bin'])).toEqual(ALL);
  });

  it('danh sách rỗng hoặc force → chạy hết', () => {
    expect(decideJobs([])).toEqual(ALL);
    expect(decideJobs(['docs/a.md'], { force: true })).toEqual(ALL);
  });

  it('gộp nhiều file: hợp của các luật', () => {
    expect(
      decideJobs(['packages/db/migrations/1.sql', 'apps/web/src/app/p.tsx', 'docs/a.md']),
    ).toEqual({ database: true, e2e: true, python: false });
  });

  it('chấp nhận dấu \\ và dòng trống', () => {
    expect(decideJobs(['docs\\a.md', ''])).toEqual(NONE);
  });
});

describe('mustRunAll', () => {
  it('push (main) → luôn chạy đủ', () => {
    expect(mustRunAll({ eventName: 'push', labels: [] })).toBe(true);
  });
  it('PR có nhãn ci-full → chạy đủ; không nhãn → lọc', () => {
    expect(mustRunAll({ eventName: 'pull_request', labels: ['ci-full'] })).toBe(true);
    expect(mustRunAll({ eventName: 'pull_request', labels: ['x'] })).toBe(false);
  });
});
