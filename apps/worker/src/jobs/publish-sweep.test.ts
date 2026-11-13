import { PlatformError } from '@flow/connectors';
import type { ClaimedPublishTarget } from '@flow/db';
import { describe, expect, it, vi } from 'vitest';
import { PUBLISH_PERMISSION, runPublishSweep } from './publish-sweep';

const target = (over: Partial<ClaimedPublishTarget> = {}): ClaimedPublishTarget => ({
  targetId: 't1',
  postId: 'p1',
  channelId: 'c1',
  channelExternalId: '1000000000001',
  message: 'Khai trương cửa hàng',
  scopes: [PUBLISH_PERMISSION, 'pages_read_engagement'],
  attempts: 1,
  ...over,
});

function build(opts: {
  workspaces?: string[];
  claimed?: ClaimedPublishTarget[];
  publish?: (channel: unknown, text: string) => Promise<{ externalId: string }>;
}) {
  const record = vi.fn(async () => true);
  const publish = vi.fn(opts.publish ?? (async () => ({ externalId: '1000000000001_77' })));
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const claim = vi.fn(async () => opts.claimed ?? []);
  const run = () =>
    runPublishSweep({
      listDueWorkspaces: async () => opts.workspaces ?? ['w1'],
      claim,
      record,
      publish: publish as never,
      logger,
    });
  return { run, record, publish, logger, claim };
}

describe('runPublishSweep — đăng bài đến hạn', () => {
  it('gọi nền tảng bằng ChannelRef đúng (Facebook, id kênh/Page) với đúng nội dung rồi ghi published kèm id bài', async () => {
    const { run, record, publish } = build({ claimed: [target()] });
    expect(await run()).toMatchObject({ claimed: 1, published: 1 });
    expect(publish).toHaveBeenCalledWith(
      { id: 'c1', workspaceId: 'w1', platform: 'facebook', externalId: '1000000000001' },
      'Khai trương cửa hàng',
    );
    expect(record).toHaveBeenCalledWith('w1', 't1', 'published', {
      externalPostId: '1000000000001_77',
    });
  });

  it('không có workspace đến hạn → không nhận, không gọi nền tảng', async () => {
    const { run, publish, claim } = build({ workspaces: [] });
    expect(await run()).toEqual({ claimed: 0, published: 0, failed: 0, unknown: 0, retried: 0 });
    expect(claim).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('thiếu quyền pages_manage_posts → ghi failed "missing_permission" và KHÔNG gọi nền tảng', async () => {
    const { run, record, publish } = build({
      claimed: [target({ scopes: ['pages_read_engagement'] })],
    });
    expect(await run()).toMatchObject({ failed: 1, published: 0 });
    expect(publish).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith('w1', 't1', 'failed', { error: 'missing_permission' });
  });

  it('lỗi chắc chắn CHƯA đăng (quyền / token hết hạn / nội dung bị từ chối trước khi gửi) → failed kèm mã', async () => {
    const cases: Array<[Error, string]> = [
      [new PlatformError('PERMISSION'), 'permission'],
      [new PlatformError('TOKEN_EXPIRED'), 'token_expired'],
      [new PlatformError('UNKNOWN', { message: 'facebook_invalid_post' }), 'invalid_post'],
    ];
    for (const [error, code] of cases) {
      const { run, record } = build({
        claimed: [target()],
        publish: async () => {
          throw error;
        },
      });
      expect(await run()).toMatchObject({ failed: 1 });
      expect(record).toHaveBeenCalledWith('w1', 't1', 'failed', { error: code });
    }
  });

  it('giới hạn tốc độ (chưa đăng) → retry; hết 3 lần thử thì failed "rate_limited"', async () => {
    const limited = async () => {
      throw new PlatformError('RATE_LIMIT');
    };
    const first = build({ claimed: [target({ attempts: 1 })], publish: limited });
    expect(await first.run()).toMatchObject({ retried: 1, failed: 0 });
    expect(first.record).toHaveBeenCalledWith('w1', 't1', 'retry', { error: 'rate_limited' });
    const last = build({ claimed: [target({ attempts: 3 })], publish: limited });
    expect(await last.run()).toMatchObject({ retried: 0, failed: 1 });
    expect(last.record).toHaveBeenCalledWith('w1', 't1', 'failed', { error: 'rate_limited' });
  });

  it('kết quả KHÔNG RÕ (lỗi mạng, phản hồi thiếu id, lỗi lạ) → unknown, KHÔNG BAO GIỜ retry (tránh đăng trùng)', async () => {
    const ambiguous: Error[] = [
      new PlatformError('UNKNOWN', { message: 'facebook_network_error' }),
      new PlatformError('UNKNOWN', { message: 'facebook_bad_response' }),
      new Error('lỗi lạ'),
    ];
    for (const error of ambiguous) {
      const { run, record } = build({
        claimed: [target({ attempts: 1 })],
        publish: async () => {
          throw error;
        },
      });
      expect(await run()).toMatchObject({ unknown: 1, retried: 0, failed: 0 });
      expect(record).toHaveBeenCalledWith('w1', 't1', 'unknown', { error: 'unknown_result' });
    }
  });

  it('nhật ký chỉ có số đếm và mã lỗi — không nội dung bài, không id kênh/Page/bài', async () => {
    const { run, logger } = build({
      claimed: [target({ message: 'NỘI DUNG BÍ MẬT' })],
      publish: async () => {
        throw new PlatformError('PERMISSION');
      },
    });
    await run();
    const logged = JSON.stringify([
      ...logger.info.mock.calls,
      ...logger.warn.mock.calls,
      ...logger.error.mock.calls,
    ]);
    expect(logged).not.toContain('NỘI DUNG BÍ MẬT');
    expect(logged).not.toContain('1000000000001');
    expect(logged).not.toContain('c1');
  });

  it('lỗi ghi kết quả hoặc lỗi nhận việc của MỘT workspace không làm dừng workspace khác và không ném', async () => {
    let calls = 0;
    const claim = vi.fn(async (workspaceId: string) => {
      calls += 1;
      if (workspaceId === 'bad') throw new Error('db down');
      return [target()];
    });
    const record = vi.fn(async () => true);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const result = await runPublishSweep({
      listDueWorkspaces: async () => ['bad', 'good'],
      claim,
      record,
      publish: async () => ({ externalId: '1_1' }),
      logger,
    });
    expect(calls).toBe(2);
    expect(result.published).toBe(1);
    expect(logger.error).toHaveBeenCalled();
  });
});
