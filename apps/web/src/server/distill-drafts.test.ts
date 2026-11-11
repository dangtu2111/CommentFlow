import { describe, expect, it, vi } from 'vitest';
import { createDistillDraftService } from './distill-drafts';

const ctx = { workspaceId: 'w1', userId: 'u1' };
const make = (approved: boolean) => {
  const requestSync = vi.fn(async () => undefined);
  const approve = vi.fn(async () => approved);
  const reject = vi.fn(async () => approved);
  const withActor = vi.fn(async (_ws: string, _user: string, fn: (tx: object) => unknown) =>
    fn({}),
  );
  const service = createDistillDraftService({
    db: { withActor } as never,
    ops: { list: vi.fn(async () => []), count: vi.fn(async () => 2), approve, reject } as never,
    requestSync,
  });
  return { service, requestSync, approve, reject, withActor };
};

describe('createDistillDraftService', () => {
  it('duyệt thành công → xếp đồng bộ kiến thức đúng workspace', async () => {
    const { service, requestSync, approve } = make(true);
    expect(await service.approve(ctx, 'id1')).toBe('ok');
    expect(approve).toHaveBeenCalledWith({}, 'w1', 'id1');
    expect(requestSync).toHaveBeenCalledWith('w1');
  });

  it('duyệt id lạ/đã xử lý → not_found, KHÔNG xếp đồng bộ', async () => {
    const { service, requestSync } = make(false);
    expect(await service.approve(ctx, 'id1')).toBe('not_found');
    expect(requestSync).not.toHaveBeenCalled();
  });

  it('từ chối → xóa gợi ý, không xếp đồng bộ; mọi thao tác đi qua withActor của Owner', async () => {
    const { service, requestSync, reject, withActor } = make(true);
    expect(await service.reject(ctx, 'id1')).toBe('ok');
    expect(reject).toHaveBeenCalledWith({}, 'w1', 'id1');
    expect(requestSync).not.toHaveBeenCalled();
    expect(withActor).toHaveBeenCalledWith('w1', 'u1', expect.any(Function));
  });

  it('đếm gợi ý chờ duyệt', async () => {
    expect(await make(true).service.count(ctx)).toBe(2);
  });
});
