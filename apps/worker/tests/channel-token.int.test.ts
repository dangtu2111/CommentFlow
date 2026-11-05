import { randomBytes, randomUUID } from 'node:crypto';
import { createTokenCipher, parseTokenKeys } from '@flow/connectors';
import {
  clearChannelToken,
  createChannel,
  createDb,
  type FlowDb,
  setChannelToken,
  sql,
} from '@flow/db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createWorkerTokenProvider } from '../src/channels/token-provider';
import { verifyTokenKeysAtStartup } from '../src/channels/verify-token-keys';

/**
 * TOKEN-ENC (FR-010), đầu-cuối: web-giả (withActor Owner) tạo kênh → mã hóa → ghi token; worker (withJob) đọc ciphertext
 * và giải mã ra đúng bản rõ. Web không đọc được cột token. Sai khóa → kênh "cần kết nối lại" (expired), không lộ dữ liệu.
 */
let db: FlowDb;
let web: FlowDb;
let worker: FlowDb;
let admin: pg.Pool;
let ws: string;
let owner: string;

const hex = () => randomBytes(32).toString('hex');
const cipherOf = (spec: string) => createTokenCipher(parseTokenKeys(spec));

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  const workerUrl = process.env.TEST_DATABASE_WORKER_URL;
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!url || !workerUrl || !adminUrl) {
    throw new Error('Thiếu TEST_DATABASE_URL / TEST_DATABASE_WORKER_URL / TEST_DATABASE_ADMIN_URL');
  }
  // Web-giả (cf_app) cho withActor/withWorkspace; worker thật (cf_worker) cho withJob — như production.
  web = createDb({ connectionString: url, max: 4 });
  worker = createDb({ connectionString: workerUrl, max: 4 });
  db = { ...web, withJob: worker.withJob };
  admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
  ws = randomUUID();
  owner = randomUUID();
  await admin.query('INSERT INTO core.workspaces (id, name, slug) VALUES ($1, $2, $3)', [
    ws,
    'Shop token',
    `shop-${ws}`,
  ]);
  await admin.query('INSERT INTO core.users (id, email, name) VALUES ($1, $2, $3)', [
    owner,
    `${owner}@example.test`,
    'Chủ shop',
  ]);
  await admin.query(
    "INSERT INTO core.members (workspace_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
    [ws, owner],
  );
});
afterAll(async () => {
  await Promise.all([web.close(), worker.close()]);
  await admin.end();
});

/** Web-giả ở callback OAuth: tạo kênh, mã hóa NGAY với id thật của kênh rồi ghi — cùng một giao dịch. */
async function connectPage(cipher: ReturnType<typeof cipherOf>, token: string) {
  return db.withActor(ws, owner, async (tx) => {
    const channelId = await createChannel(tx, {
      platform: 'facebook',
      externalId: `page-${randomUUID()}`,
      name: 'Fanpage',
    });
    const { ciphertext, keyVersion } = cipher.encrypt(token, { workspaceId: ws, channelId });
    await setChannelToken(tx, { channelId, ciphertext, keyVersion });
    return channelId;
  });
}

const refOf = (id: string) => ({
  id,
  workspaceId: ws,
  platform: 'facebook' as const,
  externalId: 'x',
});
const statusOf = async (id: string) =>
  (await admin.query('SELECT status FROM cf.channels WHERE id = $1', [id])).rows[0].status;

describe('FR-010 token Page đầu-cuối (web ghi, worker đọc)', () => {
  it('Owner kết nối Page → worker giải mã đúng token; DB chỉ chứa ciphertext (không có bản rõ)', async () => {
    const cipher = cipherOf(`v1:${hex()}`);
    const channelId = await connectPage(cipher, 'EAAG-token-that-123');
    const stored = (
      await admin.query('SELECT access_token_enc, key_version FROM cf.channels WHERE id = $1', [
        channelId,
      ])
    ).rows[0];
    expect(Buffer.from(stored.access_token_enc).toString('utf8')).not.toContain(
      'EAAG-token-that-123',
    );
    expect(stored.key_version).toBe(1);

    const provider = createWorkerTokenProvider({ db, cipher });
    expect(await provider.getAccessToken(refOf(channelId))).toBe('EAAG-token-that-123');
  });

  it('web (withActor Owner / withWorkspace trần) KHÔNG đọc được cột token hay ciphertext qua hàm', async () => {
    const cipher = cipherOf(`v1:${hex()}`);
    const channelId = await connectPage(cipher, 'token-an');
    const codeOf = (error: unknown) => {
      const e = error as { cause?: { code?: string }; code?: string };
      return e.cause?.code ?? e.code;
    };
    const attempts: Array<() => Promise<unknown>> = [
      () =>
        db.withActor(ws, owner, (tx) =>
          tx.execute(sql`SELECT access_token_enc FROM cf.channels WHERE id = ${channelId}::uuid`),
        ),
      () =>
        db.withWorkspace(ws, (tx) =>
          tx.execute(sql`SELECT access_token_enc FROM cf.channels WHERE id = ${channelId}::uuid`),
        ),
      () =>
        db.withActor(ws, owner, (tx) =>
          tx.execute(sql`SELECT * FROM cf.read_channel_token(${channelId}::uuid)`),
        ),
      () =>
        db.withWorkspace(ws, (tx) =>
          tx.execute(sql`SELECT * FROM cf.read_channel_token(${channelId}::uuid)`),
        ),
    ];
    for (const attempt of attempts) {
      const error = await attempt().then(
        () => undefined,
        (e) => e,
      );
      expect(codeOf(error)).toBe('42501');
    }
  });

  it('sai khóa → kênh chuyển expired ("cần kết nối lại"), connector nhận TOKEN_EXPIRED, log/lỗi không lộ token/ciphertext', async () => {
    const k = hex();
    const channelId = await connectPage(cipherOf(`v1:${k}`), 'token-bi-mat-abc');
    const ciphertextHex = (
      await admin.query(
        "SELECT encode(access_token_enc, 'hex') AS h FROM cf.channels WHERE id = $1",
        [channelId],
      )
    ).rows[0].h as string;
    const logs = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ].map((s) => s.mockImplementation(() => undefined));

    const provider = createWorkerTokenProvider({ db, cipher: cipherOf(`v1:${hex()}`) }); // khóa khác
    const error = (await provider.getAccessToken(refOf(channelId)).then(
      () => undefined,
      (e) => e,
    )) as Error & { code?: string };
    expect(error.code).toBe('TOKEN_EXPIRED');
    expect(await statusOf(channelId)).toBe('expired');

    const dump = JSON.stringify({
      m: error.message,
      c: String(error.cause ?? ''),
      l: logs.flatMap((s) => s.mock.calls),
    });
    for (const secret of ['token-bi-mat-abc', k, ciphertextHex]) expect(dump).not.toContain(secret);
    for (const s of logs) s.mockRestore();
  });

  it('ciphertext bị chép sang kênh khác (AAD khác) → không giải mã được → kênh đó chuyển expired', async () => {
    const cipher = cipherOf(`v1:${hex()}`);
    const a = await connectPage(cipher, 'token-A');
    const b = await connectPage(cipher, 'token-B');
    await admin.query(
      'UPDATE cf.channels SET access_token_enc = (SELECT access_token_enc FROM cf.channels WHERE id = $1) WHERE id = $2',
      [a, b],
    );
    const provider = createWorkerTokenProvider({ db, cipher });
    const error = (await provider.getAccessToken(refOf(b)).then(
      () => undefined,
      (e) => e,
    )) as { code?: string };
    expect(error.code).toBe('TOKEN_EXPIRED');
    expect(await statusOf(b)).toBe('expired');
    expect(await provider.getAccessToken(refOf(a))).toBe('token-A');
  });

  it('xoay khóa: thêm v2 vẫn đọc được token v1; mã hóa lại (reencrypt) rồi gỡ v1 vẫn đọc được', async () => {
    const k1 = hex();
    const k2 = hex();
    const channelId = await connectPage(cipherOf(`v1:${k1}`), 'token-xoay-vong');
    const both = cipherOf(`v1:${k1},v2:${k2}`);
    expect(
      await createWorkerTokenProvider({ db, cipher: both }).getAccessToken(refOf(channelId)),
    ).toBe('token-xoay-vong');

    const row = (
      await admin.query('SELECT access_token_enc, key_version FROM cf.channels WHERE id = $1', [
        channelId,
      ])
    ).rows[0];
    const next = both.reencrypt(Buffer.from(row.access_token_enc), row.key_version, {
      workspaceId: ws,
      channelId,
    });
    await db.withJob(ws, (tx) =>
      setChannelToken(tx, { channelId, ciphertext: next.ciphertext, keyVersion: next.keyVersion }),
    );
    expect(
      (await admin.query('SELECT key_version FROM cf.channels WHERE id = $1', [channelId])).rows[0]
        .key_version,
    ).toBe(2);
    expect(
      await createWorkerTokenProvider({ db, cipher: cipherOf(`v2:${k2}`) }).getAccessToken(
        refOf(channelId),
      ),
    ).toBe('token-xoay-vong');
  });

  it('kênh chưa có token → TOKEN_EXPIRED và trạng thái KHÔNG đổi; kênh đã ngắt (revoked) không bị ghi đè thành expired', async () => {
    const channelId = await db.withActor(ws, owner, (tx) =>
      createChannel(tx, {
        platform: 'facebook',
        externalId: `page-${randomUUID()}`,
        name: 'Chưa token',
      }),
    );
    const provider = createWorkerTokenProvider({ db, cipher: cipherOf(`v1:${hex()}`) });
    const error = (await provider.getAccessToken(refOf(channelId)).then(
      () => undefined,
      (e) => e,
    )) as { code?: string };
    expect(error.code).toBe('TOKEN_EXPIRED');
    expect(await statusOf(channelId)).toBe('connected');

    const revoked = await connectPage(cipherOf(`v1:${hex()}`), 'token-se-bi-ngat');
    await db.withActor(ws, owner, (tx) => clearChannelToken(tx, revoked));
    const again = (await provider.getAccessToken(refOf(revoked)).then(
      () => undefined,
      (e) => e,
    )) as { code?: string };
    expect(again.code).toBe('TOKEN_EXPIRED');
    expect(await statusOf(revoked)).toBe('revoked');
  });

  it('thiếu khóa cho key_version đang dùng → lỗi cấu hình, kênh KHÔNG bị đổi trạng thái (không expired hàng loạt)', async () => {
    const k1 = hex();
    const channelId = await connectPage(cipherOf(`v1:${k1}`), 'token-v1');
    const onlyV2 = cipherOf(`v2:${hex()}`);
    const error = (await createWorkerTokenProvider({ db, cipher: onlyV2 })
      .getAccessToken(refOf(channelId))
      .then(
        () => undefined,
        (e) => e,
      )) as Error;
    expect(error.name).toBe('TokenKeyMissingError');
    expect(error.message).not.toContain(k1);
    expect(await statusOf(channelId)).toBe('connected');
  });
});

describe('FR-010 kiểm khóa lúc khởi động worker', () => {
  it('đủ khóa cho mọi phiên bản đang dùng → qua; thiếu → lỗi nêu phiên bản, không in khóa', async () => {
    const k1 = hex();
    const k2 = hex();
    const channelId = await connectPage(cipherOf(`v1:${k1}`), 'token-khoi-dong');
    await db.withJob(ws, (tx) =>
      setChannelToken(tx, { channelId, ciphertext: randomBytes(40), keyVersion: 7 }),
    );
    // DB test dùng chung: đủ khóa cho MỌI phiên bản đang dùng (các test khác để lại v1, v2...).
    const inUse = (
      await admin.query(
        'SELECT DISTINCT key_version FROM cf.channels WHERE access_token_enc IS NOT NULL',
      )
    ).rows.map((r) => Number(r.key_version));
    const all = [...new Set([...inUse, 7])].map((v) => `v${v}:${v === 7 ? k2 : hex()}`).join(',');
    await expect(verifyTokenKeysAtStartup(db, all)).resolves.toBeUndefined();
    const withoutV7 = all
      .split(',')
      .filter((p) => !p.startsWith('v7:'))
      .join(',');
    const error = (await verifyTokenKeysAtStartup(db, withoutV7).then(
      () => undefined,
      (e) => e,
    )) as Error;
    expect(error.name).toBe('TokenConfigError');
    expect(error.message).toContain('v7');
    expect(error.message).not.toContain(k2);
    await db.withJob(ws, (tx) =>
      setChannelToken(tx, { channelId, ciphertext: randomBytes(40), keyVersion: 1 }),
    );
  });
});
