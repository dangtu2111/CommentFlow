import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ensureBootstrap,
  evaluateBootstrap,
  REQUIRED_EXTENSIONS,
  REQUIRED_ROLES,
  readBootstrapState,
} from '../src/bootstrap-check';
import { createAdminPool } from './helpers';

/** DB-BOOTSTRAP trên DB test thật (do `infra/postgres/init` dựng): đủ extension + role → kiểm qua, đọc catalog đúng. */
let admin: pg.Pool;

beforeAll(() => {
  admin = createAdminPool();
});
afterAll(async () => {
  await admin.end();
});

describe('bootstrap trên cf_test', () => {
  it('đọc được extension và role thật; không thiếu gì', async () => {
    const state = await readBootstrapState(admin);
    for (const name of REQUIRED_EXTENSIONS) expect(state.installedExtensions).toContain(name);
    for (const name of REQUIRED_ROLES) expect(state.roles).toContain(name);
    expect(evaluateBootstrap(state).ok).toBe(true);
  });

  it('ensureBootstrap không làm gì và không ném', async () => {
    await expect(ensureBootstrap(admin)).resolves.toBeUndefined();
  });
});
