import { createMockEmailProvider, createMockPushProvider } from '@flow/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFixtureExtractor } from './classify/fixture-extractor';
import { createFixtureDrafter } from './draft/fixture-drafter';
import { createFixtureRewriter } from './rewrite/fixture-rewriter';
import { createDemoDrafter, createDemoExtractor } from './try/demo-ai';
import { createDemoKnowledge } from './try/demo-knowledge';
import { createMockKeyAdmin } from './virtual-key/admin';

/**
 * Chốt chặn "không mock khi chạy" (chủ dự án chốt 08/11): MỌI bản giả còn lại báo lỗi ngay khi tiến trình không phải test nạp chúng
 * (web/worker). Trong test (vitest) nạp được; EVAL tự khai báo bằng `allowMockInThisProcess`.
 */
const factories: Array<[string, () => unknown]> = [
  ['createFixtureExtractor', () => createFixtureExtractor()],
  ['createFixtureDrafter', () => createFixtureDrafter()],
  ['createFixtureRewriter', () => createFixtureRewriter()],
  ['createDemoExtractor', () => createDemoExtractor()],
  ['createDemoDrafter', () => createDemoDrafter()],
  ['createDemoKnowledge', () => createDemoKnowledge()],
  ['createMockKeyAdmin', () => createMockKeyAdmin()],
  ['createMockPushProvider', () => createMockPushProvider()],
  ['createMockEmailProvider', () => createMockEmailProvider()],
];

afterEach(() => vi.unstubAllEnvs());

describe('mọi bản giả bị chốt chặn khi chạy thật', () => {
  it.each(factories)('%s: tiến trình không phải test → lỗi nêu tên bản giả', (name, make) => {
    vi.stubEnv('VITEST', undefined as never);
    vi.stubEnv('NODE_ENV', 'production');
    expect(make).toThrow(new RegExp(name));
  });

  it.each(factories)('%s: trong test (vitest) nạp được', (_name, make) => {
    expect(make).not.toThrow();
  });
});
