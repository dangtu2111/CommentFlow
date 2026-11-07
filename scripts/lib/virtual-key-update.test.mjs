import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildRemoteCommand,
  DEFAULT_MODELS,
  hashVirtualKey,
  VirtualKeyError,
} from './virtual-key-update.mjs';

const HASH = 'a'.repeat(64);

describe('hashVirtualKey', () => {
  it('SHA-256 hex, bỏ khoảng trắng, không lộ khóa', () => {
    expect(hashVirtualKey(' sk-abc ')).toBe(createHash('sha256').update('sk-abc').digest('hex'));
    expect(hashVirtualKey('sk-abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashVirtualKey('sk-abc').includes('sk-abc')).toBe(false);
  });

  it('thiếu khóa → lỗi rõ ràng', () => {
    for (const missing of [undefined, null, '', '   ']) {
      expect(() => hashVirtualKey(missing)).toThrow(VirtualKeyError);
    }
  });
});

describe('buildRemoteCommand', () => {
  it('mặc định cf-classify, cf-draft, mock-llm; 10 USD; 30d; chỉ chứa mã băm', () => {
    expect(buildRemoteCommand({ keyHash: HASH })).toBe(
      `docker exec -i cf-dev-litellm-1 python - ${HASH} cf-classify cf-draft mock-llm --max-budget 10 --duration 30d`,
    );
    expect(DEFAULT_MODELS).toEqual(['cf-classify', 'cf-draft', 'mock-llm']);
  });

  it('từ chối mã băm/model/ngân sách/chu kỳ không hợp lệ (chống chèn lệnh)', () => {
    const bad = [
      { keyHash: 'sk-thật' },
      { keyHash: HASH, models: [] },
      { keyHash: HASH, models: ['a; rm -rf /'] },
      { keyHash: HASH, models: ['a b'] },
      { keyHash: HASH, maxBudget: 0 },
      { keyHash: HASH, maxBudget: Number.NaN },
      { keyHash: HASH, duration: '30 days' },
      { keyHash: HASH, duration: '30d; id' },
    ];
    for (const input of bad) expect(() => buildRemoteCommand(input)).toThrow(VirtualKeyError);
  });

  it('tham số tùy chỉnh được', () => {
    expect(
      buildRemoteCommand({
        keyHash: HASH,
        models: ['cand-gpt-luna'],
        maxBudget: 2.5,
        duration: '12h',
      }),
    ).toBe(
      `docker exec -i cf-dev-litellm-1 python - ${HASH} cand-gpt-luna --max-budget 2.5 --duration 12h`,
    );
  });
});
