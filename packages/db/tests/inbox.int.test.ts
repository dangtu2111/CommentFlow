import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  countCommentsByTab,
  escapeLikePattern,
  INBOX_TABS,
  type InboxFilter,
  listComments,
  listInboxChannels,
} from '../src/queries/inbox';
import { createAdminPool, createAppDb, seedMember, seedUser, seedWorkspace } from './helpers';

/**
 * INBOX-LIST (FR-040): truy vấn danh sách bình luận — tab theo trạng thái, lọc nền tảng/kênh/bài quảng cáo, tìm kiếm
 * (không phân biệt dấu/hoa thường, thoát ký tự đặc biệt), sắp xếp, phân trang con trỏ, cô lập workspace.
 */
let admin: pg.Pool;
let db: FlowDb;
let wsA: string;
let wsB: string;
let userA: string;
let stranger: string;
let fbA: string;
let igA: string;
let fbB: string;
let adPost: string;
let normalPost: string;
const base = Date.UTC(2026, 10, 1, 8, 0, 0);

async function channel(ws: string, platform: string, name: string): Promise<string> {
  const r = await admin.query(
    'INSERT INTO cf.channels (workspace_id, platform, external_id, name) VALUES ($1, $2, $3, $4) RETURNING id',
    [ws, platform, `ext-${randomUUID()}`, name],
  );
  return r.rows[0].id;
}
async function post(ws: string, channelId: string, isAd = false): Promise<string> {
  const r = await admin.query(
    'INSERT INTO cf.posts (workspace_id, channel_id, external_id, is_ad) VALUES ($1, $2, $3, $4) RETURNING id',
    [ws, channelId, `post-${randomUUID()}`, isAd],
  );
  return r.rows[0].id;
}
async function comment(input: {
  ws: string;
  channelId: string;
  postId: string;
  text: string;
  status?: string;
  minutes?: number;
  author?: string | null;
  followup?: boolean;
  mergedInto?: string;
  label?: string;
  createdTime?: Date;
}): Promise<string> {
  const r = await admin.query(
    `INSERT INTO cf.comments (ingest_source, workspace_id, channel_id, post_id, external_id, author_external_id, author_name, text,
       created_time, status, needs_followup, label)
     VALUES ('webhook', $1, $2, $3, $4, 'u1', $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      input.ws,
      input.channelId,
      input.postId,
      `cm-${randomUUID()}`,
      input.author === undefined ? 'Khách A' : input.author,
      input.text,
      input.createdTime ?? new Date(base + (input.minutes ?? 0) * 60_000),
      input.status ?? 'new',
      input.followup ?? false,
      input.label ?? null,
    ],
  );
  const id = r.rows[0].id as string;
  if (input.mergedInto) {
    await admin.query('UPDATE cf.comments SET merged_into_id = $2 WHERE id = $1', [
      id,
      input.mergedInto,
    ]);
  }
  return id;
}

const run = <T>(
  who: 'a' | 'stranger',
  fn: (tx: Parameters<Parameters<FlowDb['withActor']>[2]>[0]) => Promise<T>,
) => db.withActor(wsA, who === 'a' ? userA : stranger, fn);

const filter = (over: Partial<InboxFilter> = {}): InboxFilter => ({
  tab: 'all',
  sort: 'oldest',
  ...over,
});
const list = async (over: Partial<InboxFilter> = {}) =>
  run('a', (tx) => listComments(tx, wsA, filter(over)));
const texts = (items: { text: string }[]) => items.map((i) => i.text);

beforeAll(async () => {
  admin = createAdminPool();
  db = createAppDb(3);
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  userA = await seedUser(admin, 'a');
  stranger = await seedUser(admin, 'stranger');
  await seedMember(admin, wsA, userA, 'staff');
  fbA = await channel(wsA, 'facebook', 'Page FB A');
  igA = await channel(wsA, 'instagram', 'IG A');
  fbB = await channel(wsB, 'facebook', 'Page FB B');
  adPost = await post(wsA, fbA, true);
  normalPost = await post(wsA, fbA, false);
  const igPost = await post(wsA, igA, false);
  const bPost = await post(wsB, fbB, false);

  // Workspace A — mỗi trạng thái một bình luận, cách nhau 1 phút (cũ → mới theo thứ tự khai báo)
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'mới 1',
    status: 'new',
    minutes: 0,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'đang xử lý',
    status: 'processing',
    minutes: 1,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: adPost,
    text: 'Giá bao nhiêu vậy shop?',
    status: 'pending_review',
    minutes: 2,
    author: 'Lê Phương Thảo',
    label: 'price',
  });
  await comment({
    ws: wsA,
    channelId: igA,
    postId: igPost,
    text: 'chờ duyệt IG',
    status: 'pending_review',
    minutes: 3,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'sẽ tự gửi',
    status: 'scheduled_auto',
    minutes: 4,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'đang gửi',
    status: 'sending',
    minutes: 5,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'AI đã gửi',
    status: 'auto_replied',
    minutes: 6,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'cần người',
    status: 'needs_human',
    minutes: 7,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'nghi spam',
    status: 'spam_suspected',
    minutes: 8,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'gửi lỗi',
    status: 'send_failed',
    minutes: 9,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'đã trả lời',
    status: 'replied',
    minutes: 10,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'đã ẩn',
    status: 'hidden',
    minutes: 11,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'bỏ qua',
    status: 'skipped',
    minutes: 12,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'cần hỗ trợ thêm',
    status: 'pending_review',
    minutes: 13,
    followup: true,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'hỗ trợ nhưng đã trả lời',
    status: 'replied',
    minutes: 14,
    followup: true,
  });
  const main = await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'bình luận chính',
    status: 'pending_review',
    minutes: 15,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'đã gộp vào chính',
    status: 'pending_review',
    minutes: 16,
    mergedInto: main,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: 'khách ẩn danh',
    status: 'new',
    minutes: 17,
    author: null,
  });
  await comment({
    ws: wsA,
    channelId: fbA,
    postId: normalPost,
    text: '100% giảm_giá \\ nhé',
    status: 'new',
    minutes: 18,
  });
  // Workspace B — không bao giờ được thấy từ A
  await comment({
    ws: wsB,
    channelId: fbB,
    postId: bPost,
    text: 'bình luận của workspace B',
    status: 'pending_review',
    minutes: 0,
  });
});
afterAll(async () => {
  await db.close();
  await admin.end();
});

describe('FR-040 tab trạng thái', () => {
  const tabTexts = async (tab: InboxFilter['tab']) => texts((await list({ tab })).items);

  it('mỗi tab chỉ chứa đúng trạng thái của nó (sending gộp vào Sẽ tự gửi; new+processing là Mới); bình luận đã gộp bị loại', async () => {
    expect(await tabTexts('new')).toEqual([
      'mới 1',
      'đang xử lý',
      'khách ẩn danh',
      '100% giảm_giá \\ nhé',
    ]);
    expect(await tabTexts('pending_review')).toEqual([
      'Giá bao nhiêu vậy shop?',
      'chờ duyệt IG',
      'cần hỗ trợ thêm',
      'bình luận chính',
    ]);
    expect(await tabTexts('scheduled_auto')).toEqual(['sẽ tự gửi', 'đang gửi']);
    expect(await tabTexts('auto_replied')).toEqual(['AI đã gửi']);
    expect(await tabTexts('needs_human')).toEqual(['cần người']);
    expect(await tabTexts('spam_suspected')).toEqual(['nghi spam']);
    expect(await tabTexts('send_failed')).toEqual(['gửi lỗi']);
    expect(await tabTexts('replied')).toEqual(['đã trả lời', 'hỗ trợ nhưng đã trả lời']);
    expect(await tabTexts('hidden')).toEqual(['đã ẩn']);
    expect(await tabTexts('skipped')).toEqual(['bỏ qua']);
  });

  it('tab Cần hỗ trợ thêm = needs_followup chưa kết thúc (không gồm đã trả lời/ẩn/bỏ qua)', async () => {
    expect(await tabTexts('needs_followup')).toEqual(['cần hỗ trợ thêm']);
  });

  it('tab Tất cả có mọi bình luận (trừ đã gộp) của workspace A và KHÔNG có của B', async () => {
    const all = await tabTexts('all');
    expect(all).toHaveLength(18);
    expect(all).not.toContain('đã gộp vào chính');
    expect(all).not.toContain('bình luận của workspace B');
  });

  it('mục trả về có kênh, nền tảng, bài quảng cáo, tên tác giả; tác giả rỗng giữ null (giao diện hiển thị "Khách ẩn danh")', async () => {
    const { items } = await list({ tab: 'pending_review' });
    expect(items[0]).toMatchObject({
      text: 'Giá bao nhiêu vậy shop?',
      authorName: 'Lê Phương Thảo',
      platform: 'facebook',
      channelName: 'Page FB A',
      isAd: true,
      label: 'price',
      status: 'pending_review',
    });
    expect(items[1]).toMatchObject({ platform: 'instagram', channelName: 'IG A', isAd: false });
    const anon = (await list({ tab: 'new' })).items.find((i) => i.text === 'khách ẩn danh');
    expect(anon?.authorName).toBeNull();
  });
});

describe('FR-040 số lượng theo tab', () => {
  it('trả số thật cho mọi tab trong một truy vấn; khớp độ dài danh sách của từng tab', async () => {
    const counts = await run('a', (tx) => countCommentsByTab(tx, wsA, filter()));
    expect(Object.keys(counts).sort()).toEqual([...INBOX_TABS].sort());
    for (const tab of INBOX_TABS) {
      const { items } = await list({ tab, limit: 100 });
      expect(counts[tab], tab).toBe(items.length);
    }
    expect(counts.all).toBe(18);
    expect(counts.pending_review).toBe(4);
  });

  it('áp cùng bộ lọc nền tảng/kênh/quảng cáo/tìm kiếm (số tab khớp danh sách khi chọn tab đó)', async () => {
    const cases: Partial<InboxFilter>[] = [
      { platform: 'instagram' },
      { channelId: fbA },
      { adsOnly: true },
      { search: 'gia' },
    ];
    for (const over of cases) {
      const counts = await run('a', (tx) => countCommentsByTab(tx, wsA, filter(over)));
      for (const tab of INBOX_TABS) {
        const { items } = await list({ ...over, tab, limit: 100 });
        expect(counts[tab], `${JSON.stringify(over)} ${tab}`).toBe(items.length);
      }
    }
  });
});

describe('FR-040 lọc', () => {
  it('theo nền tảng, theo kênh, và chỉ bài quảng cáo', async () => {
    expect(texts((await list({ platform: 'instagram' })).items)).toEqual(['chờ duyệt IG']);
    expect((await list({ channelId: igA })).items).toHaveLength(1);
    expect(texts((await list({ adsOnly: true })).items)).toEqual(['Giá bao nhiêu vậy shop?']);
    expect((await list({ platform: 'tiktok' })).items).toEqual([]);
  });

  it('lọc theo kênh của workspace KHÁC → rỗng (không rò, không lỗi)', async () => {
    expect((await list({ channelId: fbB })).items).toEqual([]);
    const counts = await run('a', (tx) => countCommentsByTab(tx, wsA, filter({ channelId: fbB })));
    expect(counts.all).toBe(0);
  });
});

describe('FR-040 tìm kiếm', () => {
  it('không phân biệt dấu và hoa thường; khớp cả tên tác giả', async () => {
    expect(texts((await list({ search: 'gia bao nhieu' })).items)).toEqual([
      'Giá bao nhiêu vậy shop?',
    ]);
    expect(texts((await list({ search: 'GIÁ' })).items)).toEqual([
      'Giá bao nhiêu vậy shop?',
      '100% giảm_giá \\ nhé',
    ]);
    expect(texts((await list({ search: 'phuong thao' })).items)).toEqual([
      'Giá bao nhiêu vậy shop?',
    ]);
  });

  it('%, _, \\, dấu nháy là ký tự thường: không khớp tràn, không lỗi SQL', async () => {
    expect(texts((await list({ search: '100%' })).items)).toEqual(['100% giảm_giá \\ nhé']);
    expect(texts((await list({ search: '%' })).items)).toEqual(['100% giảm_giá \\ nhé']);
    expect(texts((await list({ search: 'giảm_giá' })).items)).toEqual(['100% giảm_giá \\ nhé']);
    expect((await list({ search: 'giảmXgiá' })).items).toEqual([]);
    expect(texts((await list({ search: '\\' })).items)).toEqual(['100% giảm_giá \\ nhé']);
    expect((await list({ search: "'; DROP TABLE cf.comments; --" })).items).toEqual([]);
    expect((await list({ tab: 'all' })).items.length).toBeGreaterThan(0); // bảng còn nguyên
  });

  it('escapeLikePattern thoát đúng \\ % _', () => {
    expect(escapeLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    expect(escapeLikePattern('thường')).toBe('thường');
  });

  it('chuỗi rỗng/chỉ khoảng trắng = không tìm', async () => {
    expect((await list({ search: '   ' })).items).toHaveLength(18);
  });
});

describe('FR-040 sắp xếp và phân trang con trỏ', () => {
  it('cũ nhất trước (mặc định) và mới nhất trước', async () => {
    const oldest = texts((await list({ sort: 'oldest' })).items);
    const newest = texts((await list({ sort: 'newest' })).items);
    expect(oldest[0]).toBe('mới 1');
    expect(newest[0]).toBe('100% giảm_giá \\ nhé');
    expect(newest).toEqual([...oldest].reverse());
  });

  it('phân trang: duyệt hết các trang không lặp/sót, kể cả nhiều bình luận cùng created_time', async () => {
    const tie = new Date(base + 99 * 60_000);
    const ws = await seedWorkspace(admin);
    const u = await seedUser(admin, 'tie');
    await seedMember(admin, ws, u, 'owner');
    const ch = await channel(ws, 'facebook', 'Tie');
    const p = await post(ws, ch);
    for (let i = 0; i < 7; i++)
      await comment({ ws, channelId: ch, postId: p, text: `tie-${i}`, createdTime: tie });
    await comment({
      ws,
      channelId: ch,
      postId: p,
      text: 'sau-tie',
      createdTime: new Date(base + 100 * 60_000),
    });

    for (const sort of ['oldest', 'newest'] as const) {
      const seen: string[] = [];
      let cursor: InboxFilter['cursor'] = null;
      for (let guard = 0; guard < 10; guard++) {
        const page = await db.withActor(ws, u, (tx) =>
          listComments(tx, ws, filter({ sort, limit: 3, cursor })),
        );
        seen.push(...page.items.map((i) => i.id));
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      expect(seen, sort).toHaveLength(8);
      expect(new Set(seen).size, sort).toBe(8);
    }
  });

  it('trang cuối không có nextCursor; limit được kẹp trong khoảng hợp lệ', async () => {
    const page = await list({ limit: 100 });
    expect(page.nextCursor).toBeNull();
    expect((await list({ limit: 0 })).items.length).toBeGreaterThan(0);
    expect((await list({ limit: 100_000 })).items.length).toBeLessThanOrEqual(100);
  });

  it('cursor giả/sai kiểu hoặc trỏ tới bình luận workspace khác không làm lỗi hay rò dữ liệu', async () => {
    const fake = { createdTime: new Date(base).toISOString(), id: randomUUID() };
    const page = await list({ cursor: fake });
    expect(texts(page.items)).not.toContain('bình luận của workspace B');
  });
});

describe('FR-040 cô lập workspace', () => {
  it('người KHÔNG phải thành viên: 0 dòng và mọi đếm bằng 0', async () => {
    expect((await run('stranger', (tx) => listComments(tx, wsA, filter()))).items).toEqual([]);
    const counts = await run('stranger', (tx) => countCommentsByTab(tx, wsA, filter()));
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });

  it('truyền workspaceId của B trong ngữ cảnh A → 0 dòng (RLS + điều kiện tường minh)', async () => {
    expect((await run('a', (tx) => listComments(tx, wsB, filter()))).items).toEqual([]);
  });
});

describe('FR-040 danh sách kênh cho bộ lọc', () => {
  it('chỉ kênh của workspace hiện tại (id/tên/nền tảng), không có kênh của workspace khác; người ngoài thấy rỗng', async () => {
    const channels = await run('a', (tx) => listInboxChannels(tx, wsA));
    expect(channels.map((c) => c.name).sort()).toEqual(['IG A', 'Page FB A']);
    expect(channels.every((c) => Object.keys(c).sort().join() === 'id,name,platform')).toBe(true);
    expect(await run('stranger', (tx) => listInboxChannels(tx, wsA))).toEqual([]);
    expect(await run('a', (tx) => listInboxChannels(tx, wsB))).toEqual([]);
  });
});
