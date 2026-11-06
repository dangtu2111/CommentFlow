import { describe, expect, it, vi } from 'vitest';
import { createDataExportService, isDataExportEnabled } from './data-export';

const WS = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const EX = '33333333-3333-4333-8333-333333333333';
const ctx = { workspaceId: WS, userId: USER };

function setup(
  outcome:
    | { outcome: 'created'; id: string }
    | { outcome: 'already_active' }
    | { outcome: 'rate_limited' },
  enabled = true,
) {
  const tx = { tag: 'tx' };
  const db = {
    withActor: vi.fn(async (_w: string, _u: string, fn: (t: unknown) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const ops = {
    requestDataExport: vi.fn(async () => outcome),
    listDataExports: vi.fn(async () => []),
  };
  const enqueue = vi.fn(async () => undefined);
  const service = createDataExportService({ db: db as never, ops: ops as never, enqueue, enabled });
  return { service, db, ops, enqueue, tx };
}

describe('FR-094 cờ DATA_EXPORT_ENABLED của web', () => {
  it('FR-094 mặc định TẮT; chỉ đúng chữ "true" mới bật', () => {
    expect(isDataExportEnabled({})).toBe(false);
    expect(isDataExportEnabled({ DATA_EXPORT_ENABLED: 'TRUE' })).toBe(false);
    expect(isDataExportEnabled({ DATA_EXPORT_ENABLED: '1' })).toBe(false);
    expect(isDataExportEnabled({ DATA_EXPORT_ENABLED: ' true ' })).toBe(true);
  });
});

describe('FR-094 dịch vụ yêu cầu xuất dữ liệu (web)', () => {
  it('FR-094 cờ tắt → unavailable, không chạm DB, không xếp job', async () => {
    const { service, db, enqueue } = setup({ outcome: 'created', id: EX }, false);
    expect(await service.request(ctx)).toEqual({ ok: false, reason: 'unavailable' });
    expect(db.withActor).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('FR-094 tạo xong → xếp job chỉ có id (workspace, yêu cầu, người yêu cầu)', async () => {
    const { service, db, ops, enqueue, tx } = setup({ outcome: 'created', id: EX });
    expect(await service.request(ctx)).toEqual({ ok: true });
    expect(db.withActor).toHaveBeenCalledWith(WS, USER, expect.any(Function));
    expect(ops.requestDataExport).toHaveBeenCalledWith(tx, WS, USER);
    expect(enqueue).toHaveBeenCalledWith('data-export', {
      workspaceId: WS,
      exportId: EX,
      requestedBy: USER,
    });
  });

  it('FR-094 đang có yêu cầu hoặc quá giới hạn ngày → báo lý do, không xếp job', async () => {
    const a = setup({ outcome: 'already_active' });
    expect(await a.service.request(ctx)).toEqual({ ok: false, reason: 'already_active' });
    expect(a.enqueue).not.toHaveBeenCalled();
    const b = setup({ outcome: 'rate_limited' });
    expect(await b.service.request(ctx)).toEqual({ ok: false, reason: 'rate_limited' });
    expect(b.enqueue).not.toHaveBeenCalled();
  });

  it('FR-094 xếp job lỗi → unavailable (yêu cầu kẹt sẽ được dọn bởi job retention)', async () => {
    const { service, enqueue } = setup({ outcome: 'created', id: EX });
    enqueue.mockRejectedValueOnce(new Error('pg down'));
    expect(await service.request(ctx)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('FR-094 liệt kê yêu cầu qua withActor; cờ tắt → danh sách rỗng', async () => {
    const on = setup({ outcome: 'already_active' });
    await on.service.recent(ctx);
    expect(on.ops.listDataExports).toHaveBeenCalledWith(on.tx, WS);
    const off = setup({ outcome: 'already_active' }, false);
    expect(await off.service.recent(ctx)).toEqual([]);
    expect(off.db.withActor).not.toHaveBeenCalled();
  });
});
