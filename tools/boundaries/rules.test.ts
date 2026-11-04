import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cruise } from 'dependency-cruiser';
import { beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('../../.dependency-cruiser.cjs');
const fixtures = fileURLToPath(new URL('./fixtures', import.meta.url));

type Violation = { rule: string; from: string; to: string };
let violations: Violation[] = [];

beforeAll(async () => {
  const result = await cruise(['packages', 'apps'], {
    ...config.options,
    baseDir: fixtures,
    validate: true,
    ruleSet: config,
  });
  const output = result.output as {
    summary: { violations: Array<{ rule: { name: string }; from: string; to: string }> };
  };
  violations = output.summary.violations.map((v) => ({
    rule: v.rule.name,
    from: v.from,
    to: v.to,
  }));
});

const has = (rule: string, fromContains: string) =>
  violations.some((v) => v.rule === rule && v.from.includes(fromContains));

describe('luật ranh giới dependency-cruiser', () => {
  it('saas-core không import ai', () => {
    expect(has('saas-core-khong-biet-san-pham', 'saas-core/src/imports-ai.ts')).toBe(true);
  });
  it('saas-core không import apps', () => {
    expect(has('saas-core-khong-biet-san-pham', 'saas-core/src/imports-app.ts')).toBe(true);
  });
  it('saas-core không import schema cf của db', () => {
    expect(has('saas-core-khong-biet-san-pham', 'saas-core/src/imports-cf-schema.ts')).toBe(true);
  });
  it('saas-core được import db (không phải schema cf)', () => {
    expect(violations.some((v) => v.from.includes('saas-core/src/ok-imports-db.ts'))).toBe(false);
  });
  it('auth-db (pool role cf_auth): saas-core/src/auth được import', () => {
    expect(
      violations.some((v) => v.from.includes('saas-core/src/auth/ok-imports-auth-db.ts')),
    ).toBe(false);
  });
  it('auth-db: saas-core ngoài thư mục auth KHÔNG được import', () => {
    expect(has('chi-auth-import-auth-db', 'saas-core/src/imports-auth-db-outside-auth.ts')).toBe(
      true,
    );
  });
  it('auth-db: gói ai KHÔNG được import', () => {
    expect(has('chi-auth-import-auth-db', 'ai/src/imports-auth-db.ts')).toBe(true);
  });
  it('auth-db: ứng dụng web KHÔNG được import', () => {
    expect(has('chi-auth-import-auth-db', 'web/src/imports-auth-db.ts')).toBe(true);
  });
  it('packages không import apps', () => {
    expect(has('packages-khong-import-apps', 'ai/src/imports-app.ts')).toBe(true);
  });
  it('shared là gói lá', () => {
    expect(has('shared-la-goi-la', 'shared/src/imports-package.ts')).toBe(true);
  });
  it('gói khác được import shared', () => {
    expect(violations.some((v) => v.from.includes('ok/src/imports-shared.ts'))).toBe(false);
  });
  it('db không import tầng trên', () => {
    expect(has('db-khong-import-tang-tren', 'db/src/imports-saas-core.ts')).toBe(true);
  });
  it('worker không import web', () => {
    expect(has('apps-khong-import-nhau', 'worker/src/imports-web.ts')).toBe(true);
  });
  it('connectors không import db', () => {
    expect(has('connectors-chi-phu-thuoc-shared', 'connectors/src/imports-db.ts')).toBe(true);
  });
  it('connectors không import ai', () => {
    expect(has('connectors-chi-phu-thuoc-shared', 'connectors/src/imports-ai.ts')).toBe(true);
  });
  it('connectors được import shared', () => {
    expect(violations.some((v) => v.from.includes('connectors/src/ok-imports-shared.ts'))).toBe(
      false,
    );
  });
  it('cấm vòng phụ thuộc', () => {
    expect(
      violations.some((v) => v.rule === 'no-circular' && v.from.includes('ai/src/cycle-')),
    ).toBe(true);
  });
});
