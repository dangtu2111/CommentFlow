import { isAppError } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import { assertMigrationAllowed } from './migration-guard';
import {
  assertStagingMigrateAllowed,
  expectedConfirmation,
  lastMigrationNumber,
  type MigrationEntry,
  parseMigrationJournal,
  planMigrations,
  verifyAppliedHashes,
} from './staging-migrate-guard';

const ENTRIES: MigrationEntry[] = [
  { idx: 0, when: 1000, tag: '0000_init' },
  { idx: 1, when: 2000, tag: '0001_rls' },
  { idx: 2, when: 3000, tag: '0002_more' },
];
const SECRET = 'matkhau-bi-mat-123';
const URL_OK = `postgresql://cf_owner:${SECRET}@db.staging.internal:5432/cf_staging`;

const base = {
  appEnv: 'staging' as string | undefined,
  adminUrl: URL_OK as string | undefined,
  allowedHosts: 'db.staging.internal:5432' as string | undefined,
  expectedDatabase: 'cf_staging' as string | undefined,
  githubActions: 'true' as string | undefined,
  workflowRef: 'dangtu2111/CommentFlow/.github/workflows/migrate-staging.yml@refs/heads/main' as
    | string
    | undefined,
  confirmation: 'cf_staging@0002' as string | undefined,
  entries: ENTRIES,
  requireConfirmation: true,
};

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return isAppError(error) ? error.code : 'KHÁC';
  }
  return undefined;
}

function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  return '';
}

describe('mã xác nhận', () => {
  it('có dạng <tên-db>@<số migration cuối>', () => {
    expect(lastMigrationNumber(ENTRIES)).toBe('0002');
    expect(expectedConfirmation('cf_staging', ENTRIES)).toBe('cf_staging@0002');
  });
});

describe('assertStagingMigrateAllowed — đường đúng', () => {
  it('cho phép khi đủ: staging + host trong danh sách + xác nhận đúng', () => {
    expect(assertStagingMigrateAllowed(base)).toEqual({
      databaseName: 'cf_staging',
      host: 'db.staging.internal',
    });
  });

  it('dry-run không cần mã xác nhận nhưng vẫn qua mọi cổng khác', () => {
    const dry = { ...base, confirmation: undefined, requireConfirmation: false };
    expect(assertStagingMigrateAllowed(dry).databaseName).toBe('cf_staging');
    expect(codeOf(() => assertStagingMigrateAllowed({ ...dry, appEnv: 'production' }))).toBe(
      'FORBIDDEN',
    );
    expect(
      codeOf(() => assertStagingMigrateAllowed({ ...dry, allowedHosts: 'khac.example:5432' })),
    ).toBe('FORBIDDEN');
  });

  it('danh sách host:cổng nhiều mục, không phân biệt hoa thường', () => {
    expect(
      assertStagingMigrateAllowed({
        ...base,
        allowedHosts: ' a.example:5432 , DB.Staging.Internal:5432 ',
      }),
    ).toMatchObject({ host: 'db.staging.internal' });
  });

  it('cổng khác với cổng được phép → FORBIDDEN', () => {
    expect(
      codeOf(() =>
        assertStagingMigrateAllowed({ ...base, allowedHosts: 'db.staging.internal:6543' }),
      ),
    ).toBe('FORBIDDEN');
  });

  it('mục thiếu cổng trong CF_STAGING_DB_HOSTS → CONFIG_INVALID', () => {
    for (const allowedHosts of ['db.staging.internal', 'a.example:5432,db.staging.internal']) {
      expect(codeOf(() => assertStagingMigrateAllowed({ ...base, allowedHosts }))).toBe(
        'CONFIG_INVALID',
      );
    }
  });

  it('URL không ghi cổng tường minh → CONFIG_INVALID (không dựa PGPORT)', () => {
    const adminUrl = `postgresql://u:${SECRET}@db.staging.internal/cf_staging`;
    expect(codeOf(() => assertStagingMigrateAllowed({ ...base, adminUrl }))).toBe('CONFIG_INVALID');
  });
});

describe('assertStagingMigrateAllowed — APP_ENV', () => {
  it('production bị từ chối cứng, kể cả khi host và xác nhận đều đúng', () => {
    expect(codeOf(() => assertStagingMigrateAllowed({ ...base, appEnv: 'production' }))).toBe(
      'FORBIDDEN',
    );
    expect(codeOf(() => assertStagingMigrateAllowed({ ...base, appEnv: 'Production' }))).toBe(
      'FORBIDDEN',
    );
  });

  it('chỉ đúng chữ "staging": dev/test/ci/prod/rỗng/thiếu đều bị từ chối', () => {
    for (const appEnv of ['dev', 'test', 'ci', 'prod', 'Staging', ' staging', '', undefined]) {
      expect(codeOf(() => assertStagingMigrateAllowed({ ...base, appEnv }))).toBe('FORBIDDEN');
    }
  });

  it('guard cũ cho pnpm db:migrate vẫn từ chối staging và production', () => {
    for (const appEnv of ['staging', 'production']) {
      expect(codeOf(() => assertMigrationAllowed({ appEnv, databaseUrl: URL_OK }))).toBe(
        'FORBIDDEN',
      );
    }
  });
});

describe('assertStagingMigrateAllowed — host', () => {
  it('thiếu hoặc rỗng danh sách host → CONFIG_INVALID (đóng kín)', () => {
    for (const allowedHosts of [undefined, '', '  ', ',,']) {
      expect(codeOf(() => assertStagingMigrateAllowed({ ...base, allowedHosts }))).toBe(
        'CONFIG_INVALID',
      );
    }
  });

  it('mục không hợp lệ (ký tự đại diện, đường dẫn) → CONFIG_INVALID', () => {
    for (const allowedHosts of ['*', '*.example.com', 'a/b', 'db.staging.internal,*']) {
      expect(codeOf(() => assertStagingMigrateAllowed({ ...base, allowedHosts }))).toBe(
        'CONFIG_INVALID',
      );
    }
  });

  it('host ngoài danh sách → FORBIDDEN, không đoán theo hậu tố/tiền tố', () => {
    for (const host of [
      'prod.example.com',
      'db.staging.internal.evil.com',
      'xdb.staging.internal',
      '127.0.0.1',
    ]) {
      const url = `postgresql://u:${SECRET}@${host}:5432/cf_staging`;
      expect(codeOf(() => assertStagingMigrateAllowed({ ...base, adminUrl: url }))).toBe(
        'FORBIDDEN',
      );
    }
  });

  it('URL không thể đánh lừa bằng @ thứ hai, nhiều host, hay tham số ghi đè host/db', () => {
    for (const url of [
      `postgresql://u:p@evil.example:5432@db.staging.internal/cf_staging`,
      'postgresql://u:p@db.staging.internal,evil.example/cf_staging',
      'postgresql://u:p@evil.example/cf_staging?host=db.staging.internal',
      'postgresql://u:p@db.staging.internal/cf_staging?dbname=commentflow',
      'postgresql://u:p@db.staging.internal/cf_staging?options=-c%20search_path%3Dx',
    ]) {
      const code = codeOf(() => assertStagingMigrateAllowed({ ...base, adminUrl: url }));
      expect(['FORBIDDEN', 'CONFIG_INVALID']).toContain(code);
    }
  });

  it('cho phép tham số an toàn (sslmode bắt buộc mã hóa, connect_timeout)', () => {
    const url = `${URL_OK}?sslmode=verify-full&connect_timeout=10`;
    expect(assertStagingMigrateAllowed({ ...base, adminUrl: url }).databaseName).toBe('cf_staging');
  });
});

describe('assertStagingMigrateAllowed — URL và tên DB', () => {
  it('thiếu hoặc sai định dạng URL → CONFIG_INVALID', () => {
    expect(codeOf(() => assertStagingMigrateAllowed({ ...base, adminUrl: undefined }))).toBe(
      'CONFIG_INVALID',
    );
    expect(codeOf(() => assertStagingMigrateAllowed({ ...base, adminUrl: 'khong-phai-url' }))).toBe(
      'CONFIG_INVALID',
    );
    expect(
      codeOf(() =>
        assertStagingMigrateAllowed({ ...base, adminUrl: 'postgresql://u:p@db.staging.internal' }),
      ),
    ).toBe('CONFIG_INVALID');
  });

  it('tên DB chứa "prod" bị từ chối cứng; tên hệ thống (postgres, template) cũng vậy', () => {
    for (const db of ['commentflow_production', 'cf_prod', 'PROD', 'postgres', 'template1']) {
      const url = `postgresql://u:p@db.staging.internal:5432/${db}`;
      expect(
        codeOf(() =>
          assertStagingMigrateAllowed({ ...base, adminUrl: url, confirmation: `${db}@0002` }),
        ),
      ).toBe('FORBIDDEN');
    }
  });

  it('tên DB có ký tự lạ → CONFIG_INVALID', () => {
    const url = 'postgresql://u:p@db.staging.internal:5432/cf%20staging';
    expect(codeOf(() => assertStagingMigrateAllowed({ ...base, adminUrl: url }))).toBe(
      'CONFIG_INVALID',
    );
  });
});

describe('assertStagingMigrateAllowed — mã xác nhận', () => {
  it('thiếu mã → FORBIDDEN (đóng kín)', () => {
    for (const confirmation of [undefined, '']) {
      expect(codeOf(() => assertStagingMigrateAllowed({ ...base, confirmation }))).toBe(
        'FORBIDDEN',
      );
    }
  });

  it('sai tên DB, sai số migration, thừa/thiếu khoảng trắng, đổi hoa thường → FORBIDDEN', () => {
    for (const confirmation of [
      'khac_db@0002',
      'cf_staging@0001',
      'cf_staging@0003',
      'cf_staging',
      'cf_staging@',
      ' cf_staging@0002',
      'cf_staging@0002 ',
      'CF_STAGING@0002',
      'cf_staging@2',
      'staging',
    ]) {
      expect(codeOf(() => assertStagingMigrateAllowed({ ...base, confirmation }))).toBe(
        'FORBIDDEN',
      );
    }
  });

  it('thông báo thiếu/sai xác nhận nói rõ định dạng nhưng không in giá trị đúng', () => {
    const msg = messageOf(() => assertStagingMigrateAllowed({ ...base, confirmation: 'sai' }));
    expect(msg).toContain('<tên-db>@<số-migration-cuối>');
    expect(msg).not.toContain('cf_staging@0002');
  });
});

describe('không lộ bí mật', () => {
  it('mọi thông báo lỗi không chứa mật khẩu, người dùng hay host', () => {
    const cases = [
      { ...base, appEnv: 'production' },
      { ...base, appEnv: undefined },
      { ...base, allowedHosts: 'khac.example:5432' },
      { ...base, allowedHosts: undefined },
      { ...base, confirmation: 'sai' },
      { ...base, adminUrl: `postgresql://cf_owner:${SECRET}@db.staging.internal/commentflow_prod` },
      {
        ...base,
        adminUrl: `postgresql://cf_owner:${SECRET}@db.staging.internal/cf_staging?host=x`,
      },
    ];
    for (const input of cases) {
      const msg = messageOf(() => assertStagingMigrateAllowed(input));
      expect(msg).not.toBe('');
      for (const secret of [SECRET, 'cf_owner', 'db.staging.internal']) {
        expect(msg).not.toContain(secret);
      }
    }
  });
});

describe('parseMigrationJournal', () => {
  it('đọc journal hợp lệ, sắp theo idx', () => {
    const entries = parseMigrationJournal({
      entries: [
        { idx: 1, version: '7', when: 2000, tag: '0001_b', breakpoints: true },
        { idx: 0, version: '7', when: 1000, tag: '0000_a', breakpoints: true },
      ],
    });
    expect(entries.map((e) => e.tag)).toEqual(['0000_a', '0001_b']);
  });

  it('journal rỗng, sai hình dạng, thiếu số thứ tự trong tag → lỗi', () => {
    for (const raw of [
      null,
      {},
      { entries: [] },
      { entries: [{ idx: 0, when: 1, tag: 'init' }] },
    ]) {
      expect(codeOf(() => parseMigrationJournal(raw))).toBe('CONFIG_INVALID');
    }
  });
});

describe('planMigrations', () => {
  it('DB chưa có gì → tất cả đang chờ', () => {
    expect(planMigrations(ENTRIES, null).pending.map((e) => e.tag)).toEqual([
      '0000_init',
      '0001_rls',
      '0002_more',
    ]);
  });

  it('chỉ liệt kê migration mới hơn lần áp cuối', () => {
    expect(planMigrations(ENTRIES, 2000).pending.map((e) => e.tag)).toEqual(['0002_more']);
    expect(planMigrations(ENTRIES, 3000).pending).toEqual([]);
  });

  it('DB đã áp migration mới hơn mã → aheadOfCode', () => {
    expect(planMigrations(ENTRIES, 9999)).toEqual({ pending: [], aheadOfCode: true });
    expect(planMigrations(ENTRIES, 3000).aheadOfCode).toBe(false);
  });
});

describe('cổng bổ sung (verifier-security)', () => {
  it('sslmode yếu (disable/allow/prefer/rỗng) → CONFIG_INVALID; require/verify-* được', () => {
    for (const mode of ['disable', 'allow', 'prefer', '', 'REQUIRE']) {
      const adminUrl = `${URL_OK}?sslmode=${mode}`;
      expect(codeOf(() => assertStagingMigrateAllowed({ ...base, adminUrl }))).toBe(
        'CONFIG_INVALID',
      );
    }
    for (const mode of ['require', 'verify-ca', 'verify-full']) {
      const adminUrl = `${URL_OK}?sslmode=${mode}`;
      expect(assertStagingMigrateAllowed({ ...base, adminUrl }).databaseName).toBe('cf_staging');
    }
  });

  it('CF_STAGING_DB_NAME: thiếu/sai định dạng → CONFIG_INVALID; khác tên trong URL → FORBIDDEN', () => {
    for (const expectedDatabase of [undefined, '', 'cf staging']) {
      expect(codeOf(() => assertStagingMigrateAllowed({ ...base, expectedDatabase }))).toBe(
        'CONFIG_INVALID',
      );
    }
    expect(
      codeOf(() => assertStagingMigrateAllowed({ ...base, expectedDatabase: 'cf_staging2' })),
    ).toBe('FORBIDDEN');
    expect(
      codeOf(() => assertStagingMigrateAllowed({ ...base, expectedDatabase: 'CF_STAGING' })),
    ).toBe('FORBIDDEN');
  });

  it('tên khớp CF_STAGING_DB_NAME nhưng chứa "prod" vẫn bị từ chối', () => {
    const adminUrl = 'postgresql://u:p@db.staging.internal:5432/cf_prod_copy';
    expect(
      codeOf(() =>
        assertStagingMigrateAllowed({
          ...base,
          adminUrl,
          expectedDatabase: 'cf_prod_copy',
          confirmation: 'cf_prod_copy@0002',
        }),
      ),
    ).toBe('FORBIDDEN');
  });

  it('chỉ chạy trong GitHub Actions: thiếu/sai GITHUB_ACTIONS → FORBIDDEN (kể cả dry-run)', () => {
    for (const githubActions of [undefined, '', 'false', 'TRUE']) {
      for (const requireConfirmation of [true, false]) {
        expect(
          codeOf(() =>
            assertStagingMigrateAllowed({ ...base, githubActions, requireConfirmation }),
          ),
        ).toBe('FORBIDDEN');
      }
    }
  });

  it('GITHUB_WORKFLOW_REF phải là migrate-staging.yml@refs/heads/main', () => {
    for (const workflowRef of [
      undefined,
      '',
      'o/r/.github/workflows/deploy-staging.yml@refs/heads/main',
      'o/r/.github/workflows/migrate-staging.yml@refs/heads/feat/x',
      'o/r/.github/workflows/migrate-staging.yml@refs/heads/main2',
      'o/r/.github/workflows/migrate-staging.yml@refs/pull/1/merge',
      'o/r/x.github/workflows/migrate-staging.yml@refs/heads/main',
      'migrate-staging.yml@refs/heads/main',
    ]) {
      expect(codeOf(() => assertStagingMigrateAllowed({ ...base, workflowRef }))).toBe('FORBIDDEN');
    }
  });
});

describe('verifyAppliedHashes', () => {
  const hashed = ENTRIES.map((e) => ({ ...e, hash: `h${e.idx}` }));
  const row = (i: number) => ({ hash: `h${i}`, createdAt: ENTRIES[i]?.when ?? 0 });

  it('DB sạch hoặc áp đúng thứ tự (có thể còn chờ ở cuối) → không lệch', () => {
    expect(verifyAppliedHashes(hashed, [])).toEqual({ gaps: [], unknown: 0 });
    expect(verifyAppliedHashes(hashed, [row(0), row(1)])).toEqual({ gaps: [], unknown: 0 });
    expect(verifyAppliedHashes(hashed, [row(0), row(1), row(2)])).toEqual({ gaps: [], unknown: 0 });
  });

  it('mục chưa áp mà when ≤ lần áp cuối → gaps (drizzle sẽ bỏ qua vĩnh viễn)', () => {
    expect(verifyAppliedHashes(hashed, [row(0), row(2)])).toEqual({
      gaps: ['0001_rls'],
      unknown: 0,
    });
  });

  it('dòng đã áp có hash không có trong mã → unknown', () => {
    expect(verifyAppliedHashes(hashed, [row(0), { hash: 'la', createdAt: 1500 }]).unknown).toBe(1);
  });
});
