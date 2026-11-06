import type { Database } from '@flow/db';
import type { KbPublishJob, PlanChunk } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import { type KbPublishOps, runKbPublish } from './kb-publish';

const WS = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000002';
const tx = {} as Database;

const chunk = (key: string, hash = 'h', over: Partial<PlanChunk> = {}): PlanChunk => ({
  sourceId: 's1',
  sourceType: 'faq',
  chunkKey: key,
  contentHash: hash,
  injectionSuspected: false,
  ...over,
});

function ops(over: Partial<KbPublishOps> & { drafts?: PlanChunk[]; versions?: Record<string, PlanChunk[]> }) {
  const { drafts = [], versions = {}, ...rest } = over;
  const calls: string[] = [];
  const o: KbPublishOps = {
    isActiveOwner: vi.fn(async () => true),
    lock: vi.fn(async () => void calls.push('lock')),
    getCurrentVersion: vi.fn(async () => ({ id: 'v2', number: 2 })),
    getVersionByNumber: vi.fn(async (_t, _w, n) => (n === 1 ? { id: 'v1', number: 1 } : null)),
    listChunkSummaries: vi.fn(async (_t, _w, scope) =>
      scope.kind === 'draft' ? drafts : (versions[scope.versionId] ?? []),
    ),
    createVersion: vi.fn(async () => ({ versionId: 'new', copied: 1 })),
    ...rest,
  };
  return { o, calls };
}

const publish: KbPublishJob = { kind: 'publish', workspaceId: WS, requestedBy: USER, note: 'ghi' };

describe('FR-054 runKbPublish — xuất bản', () => {
  it('không phải Owner đang hoạt động → forbidden, không khóa/không tạo', async () => {
    const { o } = ops({ isActiveOwner: vi.fn(async () => false) });
    expect(await runKbPublish(tx, publish, o)).toEqual({ outcome: 'forbidden' });
    expect(o.createVersion).not.toHaveBeenCalled();
    expect(o.lock).not.toHaveBeenCalled();
  });

  it('nháp khác phiên bản đang chạy → tạo phiên bản max+1 từ nháp, ghi nhóm + ghi chú', async () => {
    const { o } = ops({
      drafts: [chunk('a', 'new'), chunk('b')],
      versions: { v2: [chunk('a', 'old'), chunk('b')] },
    });
    const out = await runKbPublish(tx, publish, o);
    expect(out).toEqual({ outcome: 'created', number: 3, copied: 1, blockedInjection: 0 });
    expect(o.createVersion).toHaveBeenCalledWith(tx, WS, {
      number: 3,
      publishedBy: USER,
      note: 'ghi',
      changedCategories: ['faq'],
      scope: { kind: 'draft' },
      keys: [
        { sourceId: 's1', chunkKey: 'a' },
        { sourceId: 's1', chunkKey: 'b' },
      ],
    });
  });

  it('khóa được lấy TRƯỚC khi đọc phiên bản hiện tại', async () => {
    const order: string[] = [];
    const { o } = ops({
      lock: vi.fn(async () => void order.push('lock')),
      getCurrentVersion: vi.fn(async () => {
        order.push('read');
        return null;
      }),
      drafts: [chunk('a')],
    });
    await runKbPublish(tx, publish, o);
    expect(order).toEqual(['lock', 'read']);
  });

  it('chưa có phiên bản → số 1', async () => {
    const { o } = ops({ getCurrentVersion: vi.fn(async () => null), drafts: [chunk('a')] });
    expect(await runKbPublish(tx, publish, o)).toMatchObject({ outcome: 'created', number: 1 });
  });

  it('chạy lại khi nháp đã trùng phiên bản đang chạy → no_changes (idempotent)', async () => {
    const same = [chunk('a')];
    const { o } = ops({ drafts: same, versions: { v2: same } });
    expect(await runKbPublish(tx, publish, o)).toEqual({ outcome: 'no_changes' });
    expect(o.createVersion).not.toHaveBeenCalled();
  });

  it('FR-164 đoạn nghi cài lệnh không được xuất bản; báo số bị chặn', async () => {
    const { o } = ops({
      drafts: [chunk('a'), chunk('x', 'h', { injectionSuspected: true })],
      versions: { v2: [] },
    });
    const out = await runKbPublish(tx, publish, o);
    expect(out).toMatchObject({ outcome: 'created', blockedInjection: 1 });
    expect(vi.mocked(o.createVersion).mock.calls[0]?.[2].keys).toEqual([{ sourceId: 's1', chunkKey: 'a' }]);
  });
});

describe('FR-054 UF-8 runKbPublish — khôi phục', () => {
  const restore: KbPublishJob = { kind: 'restore', workspaceId: WS, requestedBy: USER, versionNumber: 1 };

  it('phiên bản không tồn tại → version_not_found', async () => {
    const { o } = ops({});
    expect(await runKbPublish(tx, { ...restore, versionNumber: 9 }, o)).toEqual({ outcome: 'version_not_found' });
  });

  it('tạo phiên bản MỚI từ đoạn của bản cũ (không đụng bản cũ)', async () => {
    const { o } = ops({ versions: { v1: [chunk('a', 'old')], v2: [chunk('a', 'new')] } });
    const out = await runKbPublish(tx, restore, o);
    expect(out).toMatchObject({ outcome: 'created', number: 3 });
    expect(o.createVersion).toHaveBeenCalledWith(
      tx,
      WS,
      expect.objectContaining({ scope: { kind: 'version', versionId: 'v1' }, number: 3 }),
    );
  });

  it('khôi phục đúng phiên bản đang chạy → no_changes', async () => {
    const { o } = ops({
      getVersionByNumber: vi.fn(async () => ({ id: 'v2', number: 2 })),
      versions: { v2: [chunk('a')] },
    });
    expect(await runKbPublish(tx, { ...restore, versionNumber: 2 }, o)).toEqual({ outcome: 'no_changes' });
  });

  it('không phải Owner → forbidden', async () => {
    const { o } = ops({ isActiveOwner: vi.fn(async () => false) });
    expect(await runKbPublish(tx, restore, o)).toEqual({ outcome: 'forbidden' });
  });
});
