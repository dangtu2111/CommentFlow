import type { PlanChunk } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import { createKbPublishService } from './kb-publish';

const WS = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const ctx = { workspaceId: WS, userId: USER };

const chunk = (key: string, hash = 'h', type = 'faq'): PlanChunk => ({
  sourceId: 's1',
  sourceType: type,
  chunkKey: key,
  contentHash: hash,
  injectionSuspected: false,
});

function setup(over: {
  drafts?: PlanChunk[];
  current?: PlanChunk[];
  currentVersion?: { id: string; number: number } | null;
  target?: { id: string; number: number } | null;
  targetChunks?: PlanChunk[];
}) {
  const tx = { tag: 'tx' };
  const { drafts = [], current = [], targetChunks = [] } = over;
  const currentVersion = 'currentVersion' in over ? over.currentVersion : { id: 'v2', number: 2 };
  const ops = {
    listKbVersions: vi.fn(async () => []),
    getCurrentVersion: vi.fn(async () => currentVersion ?? null),
    getVersionByNumber: vi.fn(async () => over.target ?? null),
    listChunkSummaries: vi.fn(
      async (_t: unknown, _w: string, scope: { kind: string; versionId?: string }) =>
        scope.kind === 'draft' ? drafts : scope.versionId === 'v2' ? current : targetChunks,
    ),
  };
  const withActor = vi.fn(async (_w: string, _u: string, fn: (t: typeof tx) => unknown) => fn(tx));
  const enqueue = vi.fn(async () => undefined);
  const service = createKbPublishService({
    db: { withActor } as never,
    ops: ops as never,
    enqueue,
  });
  return { service, ops, withActor, enqueue };
}

describe('FR-054 UF-8 createKbPublishService.publish', () => {
  it('không có thay đổi → no_changes, không xếp job', async () => {
    const same = [chunk('a')];
    const { service, enqueue } = setup({ drafts: same, current: same });
    expect(await service.publish(ctx, { note: null, confirmed: false })).toBe('no_changes');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('đổi FAQ → xếp job kb-publish, ghi chú + người yêu cầu từ phiên (không từ client)', async () => {
    const { service, enqueue, withActor } = setup({
      drafts: [chunk('a', 'n')],
      current: [chunk('a')],
    });
    expect(await service.publish(ctx, { note: 'ghi', confirmed: false })).toBe('queued');
    expect(withActor.mock.calls[0]?.slice(0, 2)).toEqual([WS, USER]);
    expect(enqueue).toHaveBeenCalledWith('kb-publish', {
      kind: 'publish',
      workspaceId: WS,
      requestedBy: USER,
      note: 'ghi',
    });
  });

  it('đổi Sản phẩm/Chính sách mà chưa xác nhận → confirm_required; xác nhận rồi → queued', async () => {
    const drafts = [chunk('p', 'n', 'policy')];
    const a = setup({ drafts, current: [] });
    expect(await a.service.publish(ctx, { note: null, confirmed: false })).toBe('confirm_required');
    expect(a.enqueue).not.toHaveBeenCalled();
    const b = setup({ drafts, current: [] });
    expect(await b.service.publish(ctx, { note: null, confirmed: true })).toBe('queued');
  });
});

describe('FR-054 UF-8 createKbPublishService.restore', () => {
  it('phiên bản lạ/workspace khác (không tra được) → not_found, không xếp job', async () => {
    const { service, enqueue } = setup({ target: null });
    expect(await service.restore(ctx, { versionNumber: 9, note: null, confirmed: true })).toBe(
      'not_found',
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('khôi phục luôn cần xác nhận', async () => {
    const { service, enqueue } = setup({
      target: { id: 'v1', number: 1 },
      targetChunks: [chunk('a', 'old')],
      current: [chunk('a', 'new')],
    });
    expect(await service.restore(ctx, { versionNumber: 1, note: null, confirmed: false })).toBe(
      'confirm_required',
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('khôi phục bản khác bản đang chạy → xếp job restore', async () => {
    const { service, enqueue } = setup({
      target: { id: 'v1', number: 1 },
      targetChunks: [chunk('a', 'old')],
      current: [chunk('a', 'new')],
    });
    expect(await service.restore(ctx, { versionNumber: 1, note: null, confirmed: true })).toBe(
      'queued',
    );
    expect(enqueue).toHaveBeenCalledWith('kb-publish', {
      kind: 'restore',
      workspaceId: WS,
      requestedBy: USER,
      versionNumber: 1,
      note: null,
    });
  });

  it('bản đích giống bản đang chạy → no_changes', async () => {
    const same = [chunk('a')];
    const { service } = setup({
      target: { id: 'v1', number: 1 },
      targetChunks: same,
      current: same,
    });
    expect(await service.restore(ctx, { versionNumber: 1, note: null, confirmed: true })).toBe(
      'no_changes',
    );
  });
});

describe('FR-054 createKbPublishService.overview', () => {
  it('trả danh sách phiên bản, số đang chạy và bản xem trước thay đổi trong một giao dịch', async () => {
    const { service, withActor } = setup({ drafts: [chunk('a', 'n')], current: [chunk('a')] });
    const o = await service.overview(ctx);
    expect(withActor).toHaveBeenCalledTimes(1);
    expect(o.currentNumber).toBe(2);
    expect(o.preview).toMatchObject({ ok: true, changed: 1 });
  });

  it('chưa có phiên bản: currentNumber null, nháp mới → preview ok', async () => {
    const { service } = setup({ currentVersion: null, drafts: [chunk('a')] });
    const o = await service.overview(ctx);
    expect(o.currentNumber).toBeNull();
    expect(o.preview).toMatchObject({ ok: true, added: 1 });
  });
});
