import type { Database, FlowDb } from '@flow/db';
import type { DataExportJob } from '@flow/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ExportFileStore } from '../export-store';
import { type DataExportOps, runDataExport } from './data-export';

const WS = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000002';
const EX = '00000000-0000-4000-8000-000000000003';
const job: DataExportJob = { workspaceId: WS, exportId: EX, requestedBy: USER };
const NOW = new Date('2026-11-06T00:00:00.000Z');
const db = { withJob: async (_w: string, fn: (tx: Database) => Promise<unknown>) => fn({} as Database) } as unknown as Pick<FlowDb, 'withJob'>;

function memoryStore(failOnPut = false) {
  const files = new Map<string, string>();
  const store: ExportFileStore = {
    put: vi.fn(async (key, lines) => {
      let text = '';
      for await (const line of lines) text += line;
      if (failOnPut) throw new Error('disk full: 0912345678');
      files.set(key, text);
      return { bytes: Buffer.byteLength(text) };
    }),
    remove: vi.fn(async (key) => void files.delete(key)),
  };
  return { store, files };
}

const comment = {
  id: 'c1',
  channelId: 'ch',
  postId: 'p',
  externalId: 'e',
  authorExternalId: 'fb-999',
  text: 'gọi 0912345678 nhé',
  lang: 'vi',
  createdTime: NOW,
  label: null,
  status: 'new',
  isHidden: false,
  isOwn: false,
  repliedAt: null,
  deletedAt: null,
};

function ops(over: Partial<DataExportOps> = {}): DataExportOps {
  const empty = async () => ({ rows: [], lastId: null });
  return {
    isActiveOwner: vi.fn(async () => true),
    claim: vi.fn(async () => true),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
    readComments: vi.fn(empty) as DataExportOps['readComments'],
    readLeads: vi.fn(empty) as DataExportOps['readLeads'],
    readKbChunks: vi.fn(empty) as DataExportOps['readKbChunks'],
    readRules: vi.fn(empty) as DataExportOps['readRules'],
    readAutomationSettings: vi.fn(async () => null),
    ...over,
  };
}

const deps = (o: DataExportOps, store: ExportFileStore, over: { maxRows?: number } = {}) => ({
  db,
  ops: o,
  store,
  now: () => NOW,
  logger: { info: vi.fn(), error: vi.fn() },
  salt: 'salt',
  pageSize: 2,
  ...over,
});

const parse = (text: string) =>
  text
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { section: string; row: Record<string, unknown> });

describe('FR-094 job xuất dữ liệu', () => {
  it('FR-094 không phải Owner → failed forbidden, không ghi tệp', async () => {
    const { store, files } = memoryStore();
    const o = ops({ isActiveOwner: vi.fn(async () => false) });
    expect(await runDataExport(deps(o, store), job)).toEqual({ outcome: 'forbidden' });
    expect(o.fail).toHaveBeenCalledWith(expect.anything(), WS, EX, 'forbidden');
    expect(o.claim).not.toHaveBeenCalled();
    expect(files.size).toBe(0);
  });

  it('FR-094 chạy lại khi không còn pending → skipped, không ghi tệp', async () => {
    const { store, files } = memoryStore();
    const o = ops({ claim: vi.fn(async () => false) });
    expect(await runDataExport(deps(o, store), job)).toEqual({ outcome: 'skipped' });
    expect(files.size).toBe(0);
    expect(o.complete).not.toHaveBeenCalled();
  });

  it('FR-094 xuất đủ các phần, meta đầu + tổng kết cuối, đã che PII, phân trang theo khóa', async () => {
    const { store, files } = memoryStore();
    const readComments = vi
      .fn()
      .mockResolvedValueOnce({ rows: [comment, { ...comment, id: 'c2' }], lastId: 'c2' })
      .mockResolvedValueOnce({ rows: [{ ...comment, id: 'c3' }], lastId: 'c3' }) as DataExportOps['readComments'];
    const o = ops({
      readComments,
      readAutomationSettings: vi.fn(async () => ({
        delaySeconds: 60,
        dailyCap: 5,
        activeHours: null,
        blockedKeywords: [],
        signature: null,
      })),
      readRules: vi.fn(async () => ({
        rows: [{ id: 'r1', name: 'n', type: 'keyword', pattern: 'x', action: 'hide', enabled: true }],
        lastId: 'r1',
      })) as DataExportOps['readRules'],
    });
    const result = await runDataExport(deps(o, store), job);
    expect(result).toMatchObject({ outcome: 'ready', counts: { comments: 3, rules: 1, automation_settings: 1, leads: 0, kb_chunks: 0 } });
    const text = files.get(`exports/${WS}/${EX}.jsonl`) ?? '';
    const lines = parse(text);
    expect(lines[0]?.section).toBe('meta');
    expect(lines.at(-1)?.section).toBe('summary');
    expect(lines.at(-1)?.row).toMatchObject({ truncated: [], counts: { comments: 3 } });
    expect(lines.filter((l) => l.section === 'comments')).toHaveLength(3);
    expect(text).not.toContain('0912345678');
    expect(text).not.toContain('fb-999');
    expect(readComments).toHaveBeenNthCalledWith(2, expect.anything(), WS, 'c2', 2);
    expect(o.complete).toHaveBeenCalledWith(
      expect.anything(),
      WS,
      EX,
      expect.objectContaining({
        fileKey: `exports/${WS}/${EX}.jsonl`,
        sizeBytes: Buffer.byteLength(text),
        expiresAt: new Date('2026-11-13T00:00:00.000Z'),
      }),
    );
  });

  it('FR-094 mã giả của cùng một người dùng ổn định trong một tệp, khác nhau giữa hai người', async () => {
    const { store, files } = memoryStore();
    const o = ops({
      readComments: vi.fn(async () => ({
        rows: [comment, { ...comment, id: 'c2' }, { ...comment, id: 'c3', authorExternalId: 'fb-1' }],
        lastId: null,
      })) as DataExportOps['readComments'],
    });
    await runDataExport(deps(o, store, { maxRows: 100 }), job);
    const authors = parse(files.get(`exports/${WS}/${EX}.jsonl`) ?? '')
      .filter((l) => l.section === 'comments')
      .map((l) => l.row.author);
    expect(authors[0]).toBe(authors[1]);
    expect(authors[0]).not.toBe(authors[2]);
    expect(String(authors[0])).toMatch(/^kh_[0-9a-f]{16}$/);
  });

  it('FR-094 vượt trần dòng mỗi phần → cắt và ghi truncated', async () => {
    const { store, files } = memoryStore();
    const o = ops({
      readComments: vi.fn(async () => ({
        rows: [comment, { ...comment, id: 'c2' }],
        lastId: 'c2',
      })) as DataExportOps['readComments'],
    });
    const result = await runDataExport(deps(o, store, { maxRows: 3 }), job);
    expect(result).toMatchObject({ outcome: 'ready', counts: { comments: 3 } });
    const last = parse(files.get(`exports/${WS}/${EX}.jsonl`) ?? '').at(-1);
    expect(last?.row.truncated).toEqual(['comments']);
  });

  it('FR-094 lỗi ghi tệp → failed export_failed, xóa tệp dở, không ném lại, không log nội dung lỗi', async () => {
    const { store } = memoryStore(true);
    const o = ops();
    const d = deps(o, store);
    expect(await runDataExport(d, job)).toEqual({ outcome: 'failed' });
    expect(o.fail).toHaveBeenCalledWith(expect.anything(), WS, EX, 'export_failed');
    expect(store.remove).toHaveBeenCalledWith(`exports/${WS}/${EX}.jsonl`);
    expect(JSON.stringify(d.logger.error.mock.calls)).not.toContain('0912345678');
    expect(o.complete).not.toHaveBeenCalled();
  });
});
