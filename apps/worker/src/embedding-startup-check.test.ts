import { describe, expect, it, vi } from 'vitest';
import { checkEmbeddingAtStartup } from './embedding-startup-check';

/** Kiểm lệch model embedding khi khởi động worker (FR-133): chỉ LOG (không dừng worker); lệch → error rõ cách sửa; mỗi workspace một kiểm. */

const WS1 = '11111111-1111-4111-8111-111111111111';
const WS2 = '22222222-2222-4222-8222-222222222222';
const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe('checkEmbeddingAtStartup', () => {
  it('embedding tắt → không đọc DB, log cảnh báo nhánh vector tắt', async () => {
    const l = logger();
    const count = vi.fn();
    const out = await checkEmbeddingAtStartup({
      configuredModel: null,
      workspaceIds: [WS1],
      count,
      logger: l,
    });
    expect(count).not.toHaveBeenCalled();
    expect(out).toEqual([{ workspaceId: null, state: 'off' }]);
    expect(l.warn).toHaveBeenCalledTimes(1);
  });

  it('workspace lệch model → log ERROR kèm hướng dẫn kb:reembed (không lộ nội dung), workspace khớp → info', async () => {
    const l = logger();
    const count = async (ws: string) =>
      ws === WS1
        ? { chunks: [{ model: 'fixture-trigram-1024', count: 7 }], products: [] }
        : { chunks: [{ model: 'bge-m3', count: 5 }], products: [{ model: 'bge-m3', count: 40 }] };
    const out = await checkEmbeddingAtStartup({
      configuredModel: 'bge-m3',
      workspaceIds: [WS1, WS2],
      count,
      logger: l,
    });
    expect(out).toEqual([
      { workspaceId: WS1, state: 'mismatch' },
      { workspaceId: WS2, state: 'ok' },
    ]);
    expect(l.error).toHaveBeenCalledTimes(1);
    const [fields, message] = l.error.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields).toMatchObject({
      workspaceId: WS1,
      configuredModel: 'bge-m3',
      mismatches: [{ source: 'kb_chunks', model: 'fixture-trigram-1024', count: 7 }],
    });
    expect(message).toContain('kb:reembed');
    expect(l.info).toHaveBeenCalledTimes(1);
  });

  it('lỗi đọc DB của một workspace không làm sập worker: log error, bỏ qua workspace đó', async () => {
    const l = logger();
    const out = await checkEmbeddingAtStartup({
      configuredModel: 'bge-m3',
      workspaceIds: [WS1],
      count: async () => {
        throw new Error('db down');
      },
      logger: l,
    });
    expect(out).toEqual([{ workspaceId: WS1, state: 'unknown' }]);
    expect(l.error).toHaveBeenCalledTimes(1);
  });
});
