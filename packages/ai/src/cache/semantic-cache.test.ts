import { describe, expect, it } from 'vitest';
import {
  buildSemanticCacheControl,
  DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD,
  isSemanticCacheEnabled,
  SEMANTIC_CACHE_TTL_SECONDS,
} from './semantic-cache';

const WS = '11111111-1111-4111-8111-111111111111';
const WS2 = '22222222-2222-4222-8222-222222222222';

describe('isSemanticCacheEnabled', () => {
  it('chỉ đúng chữ "true" mới bật', () => {
    expect(isSemanticCacheEnabled('true')).toBe(true);
    for (const v of [undefined, '', 'TRUE', '1', 'yes', ' true']) {
      expect(isSemanticCacheEnabled(v)).toBe(false);
    }
  });
});

describe('buildSemanticCacheControl', () => {
  it('cờ tắt → no-cache + no-store (không đọc/ghi semantic cache)', () => {
    expect(buildSemanticCacheControl({ enabled: false, workspaceId: WS, kbVersion: 3 })).toEqual({
      'no-cache': true,
      'no-store': true,
    });
  });

  it('bật → namespace chứa workspace_id + kb_version, có TTL', () => {
    expect(buildSemanticCacheControl({ enabled: true, workspaceId: WS, kbVersion: 3 })).toEqual({
      namespace: `cf:${WS}:cache:semantic:3`,
      ttl: SEMANTIC_CACHE_TTL_SECONDS,
    });
  });

  it('hai workspace → namespace khác nhau; đổi kb_version → đổi namespace', () => {
    const a = buildSemanticCacheControl({ enabled: true, workspaceId: WS, kbVersion: 1 });
    const b = buildSemanticCacheControl({ enabled: true, workspaceId: WS2, kbVersion: 1 });
    const c = buildSemanticCacheControl({ enabled: true, workspaceId: WS, kbVersion: 2 });
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('workspace_id không phải uuid hoặc kb_version không hợp lệ → lỗi, kể cả khi tắt', () => {
    expect(() =>
      buildSemanticCacheControl({ enabled: true, workspaceId: 'x:*', kbVersion: 1 }),
    ).toThrow();
    expect(() =>
      buildSemanticCacheControl({ enabled: false, workspaceId: '', kbVersion: 1 }),
    ).toThrow();
    expect(() =>
      buildSemanticCacheControl({ enabled: true, workspaceId: WS, kbVersion: -1 }),
    ).toThrow();
    expect(() =>
      buildSemanticCacheControl({ enabled: true, workspaceId: WS, kbVersion: 1.5 }),
    ).toThrow();
  });

  it('ngưỡng tương đồng mặc định cao (thận trọng)', () => {
    expect(DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD).toBeGreaterThanOrEqual(0.9);
  });
});
