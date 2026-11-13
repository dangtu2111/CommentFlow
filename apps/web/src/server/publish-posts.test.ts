import { describe, expect, it, vi } from 'vitest';
import type { PublishFormValue } from '../lib/publish-form';
import { createPublishPostService, type PublishPostDeps } from './publish-posts';

const SESSION = { workspaceId: 'w1', userId: 'u1' };
const POST = '33333333-3333-4333-8333-333333333333';
const CH = ['11111111-1111-4111-8111-111111111111'];
const ZONE = 'Asia/Ho_Chi_Minh';

const value = (over: Partial<PublishFormValue> = {}): PublishFormValue => ({
  intent: 'draft',
  id: undefined,
  message: 'Nội dung',
  channelIds: CH,
  productIds: [],
  mediaIds: [],
  aiNote: null,
  scheduledAt: null,
  ...over,
});

function build(over: Partial<PublishPostDeps> = {}) {
  const deps: PublishPostDeps = {
    publishEnabled: () => true,
    save: vi.fn(async () => POST),
    publishNow: vi.fn(async () => true),
    cancelSchedule: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    get: vi.fn(async () => null),
    update: vi.fn(async () => {}),
    warn: vi.fn(),
    ...over,
  };
  return { deps, service: createPublishPostService(deps) };
}
const dbError = (code: string, message = 'x') =>
  Object.assign(new Error('Failed query'), { cause: Object.assign(new Error(message), { code }) });
const throwing = (error: unknown) =>
  vi.fn(async () => {
    throw error;
  });

describe('submit — ý định của Owner', () => {
  it('nháp: lưu không giờ, ở lại Biên tập với id; KHÔNG cần cờ đăng bài', async () => {
    const { deps, service } = build({ publishEnabled: () => false });
    expect(await service.submit(SESSION, value(), ZONE)).toEqual({
      notice: 'saved',
      postId: POST,
      to: 'composer',
    });
    expect(deps.save).toHaveBeenCalledWith(SESSION, {
      id: undefined,
      message: 'Nội dung',
      channelIds: CH,
      productIds: [],
      mediaIds: [],
      aiNote: null,
      scheduledAt: null,
    });
  });

  it('lên lịch: lưu kèm giờ, chuyển sang Lịch ở đúng tuần của giờ đó (theo múi giờ cửa hàng)', async () => {
    const at = new Date('2026-12-02T03:30:00Z'); // thứ Tư 02/12 10:30 giờ VN → tuần thứ Hai 30/11
    const { service } = build();
    expect(
      await service.submit(SESSION, value({ intent: 'schedule', scheduledAt: at }), ZONE),
    ).toEqual({ notice: 'scheduled', postId: POST, to: 'calendar', week: '2026-11-30' });
  });

  it('đăng ngay: lưu nháp rồi gọi publishNow; thành công → Lịch "publishing"; publishNow false → giữ nháp, báo unavailable', async () => {
    const ok = build();
    expect(await ok.service.submit(SESSION, value({ intent: 'publish' }), ZONE)).toMatchObject({
      notice: 'publishing',
      to: 'calendar',
    });
    expect(ok.deps.publishNow).toHaveBeenCalledWith(SESSION, POST);
    const no = build({ publishNow: vi.fn(async () => false) });
    expect(await no.service.submit(SESSION, value({ intent: 'publish' }), ZONE)).toEqual({
      notice: 'unavailable',
      postId: POST,
      to: 'composer',
    });
  });

  it('cờ đăng bài TẮT: lên lịch/đăng ngay bị từ chối "publish_disabled" và KHÔNG ghi gì', async () => {
    for (const intent of ['schedule', 'publish'] as const) {
      const { deps, service } = build({ publishEnabled: () => false });
      expect(
        await service.submit(SESSION, value({ intent, scheduledAt: new Date() }), ZONE),
      ).toEqual({ notice: 'publish_disabled', to: 'composer' });
      expect(deps.save).not.toHaveBeenCalled();
      expect(deps.publishNow).not.toHaveBeenCalled();
    }
  });
});

describe('dịch lỗi DB (mã nằm trong cause vì Drizzle bọc lỗi)', () => {
  const run = async (error: unknown) => {
    const { service } = build({ save: throwing(error) });
    return service.submit(SESSION, value(), ZONE);
  };

  it('42501 → forbidden; 55000 → not_editable; 22023 theo nội dung: kênh / giờ / còn lại → invalid', async () => {
    expect(await run(dbError('42501'))).toEqual({ notice: 'forbidden', to: 'composer' });
    expect(await run(dbError('55000'))).toEqual({ notice: 'not_editable', to: 'calendar' });
    expect(await run(dbError('22023', 'invalid channel'))).toEqual({
      notice: 'invalid_channel',
      to: 'composer',
    });
    expect(await run(dbError('22023', 'invalid schedule'))).toEqual({
      notice: 'invalid_schedule',
      to: 'composer',
    });
    expect(await run(dbError('22023', 'message too long'))).toEqual({
      notice: 'invalid',
      to: 'composer',
    });
  });

  it('lỗi lạ → unavailable; nhật ký chỉ có MÃ, không nội dung bài', async () => {
    const { deps, service } = build({ save: throwing(dbError('08006', 'NỘI DUNG BÍ MẬT')) });
    expect(await service.submit(SESSION, value({ message: 'NỘI DUNG BÍ MẬT' }), ZONE)).toEqual({
      notice: 'unavailable',
      to: 'composer',
    });
    expect(JSON.stringify(vi.mocked(deps.warn).mock.calls)).not.toContain('NỘI DUNG BÍ MẬT');
  });
});

describe('hủy lịch và xóa', () => {
  it('hủy lịch: true → cancelled (về Biên tập để sửa); false → not_editable', async () => {
    expect(await build().service.cancelSchedule(SESSION, POST)).toEqual({
      notice: 'cancelled',
      postId: POST,
      to: 'composer',
    });
    expect(
      await build({ cancelSchedule: vi.fn(async () => false) }).service.cancelSchedule(
        SESSION,
        POST,
      ),
    ).toEqual({ notice: 'not_editable', to: 'calendar' });
  });

  it('xóa: true → deleted; false → not_editable; Staff (42501) → forbidden', async () => {
    expect(await build().service.remove(SESSION, POST)).toEqual({
      notice: 'deleted',
      to: 'calendar',
    });
    expect(await build({ remove: vi.fn(async () => false) }).service.remove(SESSION, POST)).toEqual(
      { notice: 'not_editable', to: 'calendar' },
    );
    expect(
      await build({ remove: throwing(dbError('42501')) }).service.remove(SESSION, POST),
    ).toEqual({ notice: 'forbidden', to: 'calendar' });
  });
});

describe('CALENDAR-DND — move (kéo thả) và edit (hộp thoại)', () => {
  const NOW = new Date('2026-11-13T03:00:00Z'); // 10:00 giờ VN
  const scheduled = (over: Record<string, unknown> = {}) =>
    ({
      id: POST,
      message: 'Hàng mới',
      status: 'scheduled',
      scheduledAt: new Date('2026-11-15T02:30:00Z'), // 09:30 VN
      publishedAt: null,
      day: null,
      time: null,
      targets: [],
      ...over,
    }) as never;

  it('kéo sang ngày khác: giữ nguyên nội dung và GIỜ địa phương, về Lịch đúng tuần kèm thông báo moved', async () => {
    const { deps, service } = build({ get: vi.fn(async () => scheduled()) });
    const result = await service.move(SESSION, POST, '2026-11-18', ZONE, NOW);
    expect(result).toEqual({ notice: 'moved', postId: POST, to: 'calendar', week: '2026-11-16' });
    expect(deps.update).toHaveBeenCalledWith(SESSION, {
      id: POST,
      message: 'Hàng mới',
      scheduledAt: new Date('2026-11-18T02:30:00Z'),
    });
  });

  it('bài không tồn tại/không còn lên lịch (nháp, đã đăng) → not_editable, KHÔNG ghi', async () => {
    for (const post of [null, scheduled({ status: 'published' }), scheduled({ status: 'draft' })]) {
      const { deps, service } = build({ get: vi.fn(async () => post) });
      expect(await service.move(SESSION, POST, '2026-11-18', ZONE, NOW)).toEqual({
        notice: 'not_editable',
        to: 'calendar',
      });
      expect(deps.update).not.toHaveBeenCalled();
    }
  });

  it('thả vào ngày quá khứ hoặc giờ mới quá gần → invalid_schedule, KHÔNG ghi; lỗi DB được dịch', async () => {
    const past = build({ get: vi.fn(async () => scheduled()) });
    expect((await past.service.move(SESSION, POST, '2026-11-10', ZONE, NOW)).notice).toBe(
      'invalid_schedule',
    );
    expect(past.deps.update).not.toHaveBeenCalled();
    const denied = build({
      get: vi.fn(async () => scheduled()),
      update: throwing(dbError('42501')),
    });
    expect((await denied.service.move(SESSION, POST, '2026-11-18', ZONE, NOW)).notice).toBe(
      'forbidden',
    );
  });

  it('edit nháp: lưu nội dung, không cần cờ đăng bài; edit có giờ: cần cờ, về đúng tuần, thông báo updated', async () => {
    const off = build({ publishEnabled: () => false });
    expect(
      await off.service.edit(
        SESSION,
        { id: POST, intent: 'draft', message: 'x', scheduledAt: null },
        ZONE,
      ),
    ).toEqual({ notice: 'saved', postId: POST, to: 'calendar' });
    expect(
      (
        await off.service.edit(
          SESSION,
          { id: POST, intent: 'save', message: 'x', scheduledAt: new Date('2026-11-20T02:30:00Z') },
          ZONE,
        )
      ).notice,
    ).toBe('publish_disabled');
    expect(off.deps.update).toHaveBeenCalledTimes(1);
    const on = build();
    expect(
      await on.service.edit(
        SESSION,
        {
          id: POST,
          intent: 'schedule',
          message: 'x',
          scheduledAt: new Date('2026-11-20T02:30:00Z'),
        },
        ZONE,
      ),
    ).toEqual({ notice: 'updated', postId: POST, to: 'calendar', week: '2026-11-16' });
  });

  it('edit: bài không còn sửa được (55000) → not_editable; nhật ký chỉ có MÃ lỗi', async () => {
    const { deps, service } = build({ update: throwing(dbError('55000')) });
    expect(
      (
        await service.edit(
          SESSION,
          { id: POST, intent: 'draft', message: 'BÍ MẬT', scheduledAt: null },
          ZONE,
        )
      ).notice,
    ).toBe('not_editable');
    const boom = build({ update: throwing(dbError('08006')) });
    await boom.service.edit(
      SESSION,
      { id: POST, intent: 'draft', message: 'BÍ MẬT', scheduledAt: null },
      ZONE,
    );
    expect(JSON.stringify((boom.deps.warn as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(
      'BÍ MẬT',
    );
    void deps;
  });
});
