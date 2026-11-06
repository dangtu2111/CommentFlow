import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlowDb } from '../src/client';
import {
  confirmInvoicePayment,
  createInvoice,
  getInvoicePayment,
  listInvoices,
  reportInvoiceTransfer,
  voidInvoice,
} from '../src/invoices';
import {
  createAdminPool,
  createWebDb,
  createWorkerDb,
  expectRejectCode,
  seedMember,
  seedUser,
  seedWorkspace,
} from './helpers';

/**
 * INVOICES (migration 0052, FR-091/FR-102, Q-INV1): `core.invoices`/`core.payments` chỉ ĐỌC với cf_app (Owner của
 * workspace); ghi duy nhất qua hàm DEFINER (đường `withJob` của đúng workspace trên `cf_worker`).
 */
let admin: pg.Pool;
let web: FlowDb;
let worker: FlowDb;
let wsA: string;
let wsB: string;
let ownerA: string;
let staffA: string;
let ownerB: string;

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const items = [{ description: 'Gói Starter', quantity: 1, unitPriceVnd: 299_000 }];
const invoiceInput = (workspaceId: string, over: Record<string, unknown> = {}) => ({
  workspaceId,
  product: 'commentflow',
  items,
  dueAt: FUTURE,
  ...over,
});
const make = (ws: string, over: Record<string, unknown> = {}) =>
  worker.withJob(ws, (tx) => createInvoice(tx, invoiceInput(ws, over)));
let refSeq = 0;
const newRef = (): string => {
  refSeq += 1;
  return `FT${Date.now()}${refSeq}`;
};
const confirm = (
  ws: string,
  invoiceId: string,
  amountVnd: number,
  bankRef = newRef(),
  confirmedBy: string | null = null,
) =>
  worker.withJob(ws, (tx) =>
    confirmInvoicePayment(tx, { workspaceId: ws, invoiceId, amountVnd, bankRef, confirmedBy }),
  );
const statusOf = async (id: string) =>
  (await admin.query('SELECT status, paid_at, voided_at FROM core.invoices WHERE id = $1', [id]))
    .rows[0] as { status: string; paid_at: Date | null; voided_at: Date | null };

beforeAll(async () => {
  admin = createAdminPool();
  web = createWebDb();
  worker = createWorkerDb();
  wsA = await seedWorkspace(admin);
  wsB = await seedWorkspace(admin);
  ownerA = await seedUser(admin);
  staffA = await seedUser(admin);
  ownerB = await seedUser(admin);
  await seedMember(admin, wsA, ownerA, 'owner');
  await seedMember(admin, wsA, staffA, 'staff');
  await seedMember(admin, wsB, ownerB, 'owner');
});
afterAll(async () => {
  await Promise.all([web.close(), worker.close(), admin.end()]);
});

describe('FR-091 tạo hóa đơn', () => {
  it('tạo pending, số hóa đơn đúng định dạng, mã chuyển khoản khớp sản phẩm, tăng dần', async () => {
    const a = await make(wsA);
    const b = await make(wsA, { product: 'excelflow' });
    expect(a.number).toMatch(/^INV-\d{6}-\d{6,}$/);
    expect(a.transferCode).toMatch(/^CF[A-HJ-NP-Z2-9]{8}$/);
    expect(b.transferCode).toMatch(/^XF[A-HJ-NP-Z2-9]{8}$/);
    expect(a.number < b.number).toBe(true);
    expect(a.amountVnd).toBe(299_000);
    expect((await statusOf(a.id)).status).toBe('pending');
  });

  it('DB tính lại tổng: gọi thẳng hàm với amount lệch items → 22023', async () => {
    const code = await expectRejectCode(
      worker.withJob(wsA, (tx) =>
        tx.execute(
          sql.raw(
            `SELECT * FROM core.create_invoice('${wsA}'::uuid, 'commentflow', 1000, '[{"description":"x","quantity":1,"unit_price_vnd":999}]'::jsonb, 'CFABCDEFGH', now() + interval '1 day')`,
          ),
        ),
      ),
    );
    expect(code).toBe('22023');
  });

  it('DB từ chối mục hóa đơn xấu dù tổng khớp: giá âm, thiếu trường, không phải số → 22023', async () => {
    const call = (itemsJson: string, amount: number) =>
      expectRejectCode(
        worker.withJob(wsA, (tx) =>
          tx.execute(
            sql.raw(
              `SELECT * FROM core.create_invoice('${wsA}'::uuid, 'commentflow', ${amount}, '${itemsJson}'::jsonb, 'CFABCDEFGH', now() + interval '1 day')`,
            ),
          ),
        ),
      );
    const neg =
      '[{"description":"a","quantity":1,"unit_price_vnd":5000},{"description":"b","quantity":1,"unit_price_vnd":-1000}]';
    expect(await call(neg, 4000)).toBe('22023');
    expect(
      await call(
        '[{"description":"a","quantity":1,"unit_price_vnd":5000},{"description":"b"}]',
        5000,
      ),
    ).toBe('22023');
    expect(await call('[{"description":"a","quantity":"1","unit_price_vnd":5000}]', 5000)).toBe(
      '22023',
    );
    expect(await call('[{"description":"a","quantity":0,"unit_price_vnd":5000}]', 5000)).toBe(
      '22023',
    );
    expect(await call('["x"]', 5000)).toBe('22023');
  });

  it('đầu vào sai bị từ chối ở tầng code (items rỗng, sản phẩm lạ)', async () => {
    await expect(make(wsA, { items: [] })).rejects.toThrow();
    await expect(make(wsA, { product: 'tiktok' })).rejects.toThrow();
  });

  it('hạn thanh toán trong quá khứ → 22023 từ DB', async () => {
    const code = await expectRejectCode(make(wsA, { dueAt: new Date(Date.now() - 1000) }));
    expect(code).toBe('22023');
  });
});

describe('FR-091/FR-102 xác nhận thanh toán', () => {
  it('đúng tiền → paid + một dòng payments; lần gọi lại → already_paid cùng payment', async () => {
    const inv = await make(wsA);
    const first = await confirm(wsA, inv.id, 299_000, newRef(), ownerA);
    expect(first.result).toBe('ok');
    expect(first.paymentId).toBeTruthy();
    const after = await statusOf(inv.id);
    expect(after.status).toBe('paid');
    expect(after.paid_at).toBeInstanceOf(Date);
    const again = await confirm(wsA, inv.id, 299_000);
    expect(again).toEqual({ result: 'already_paid', paymentId: first.paymentId });
    const payment = await worker.withJob(wsA, (tx) => getInvoicePayment(tx, wsA, inv.id));
    expect(payment?.amountVnd).toBe(299_000);
  });

  it('lệch tiền → amount_mismatch, KHÔNG đổi hóa đơn, KHÔNG tạo payment', async () => {
    const inv = await make(wsA);
    expect((await confirm(wsA, inv.id, 298_000)).result).toBe('amount_mismatch');
    expect((await statusOf(inv.id)).status).toBe('pending');
    const rows = await admin.query('SELECT 1 FROM core.payments WHERE invoice_id = $1', [inv.id]);
    expect(rows.rowCount).toBe(0);
  });

  it('hóa đơn đã hủy không xác nhận được (void)', async () => {
    const inv = await make(wsA);
    expect(await worker.withJob(wsA, (tx) => voidInvoice(tx, wsA, inv.id))).toBe('ok');
    expect((await confirm(wsA, inv.id, 299_000)).result).toBe('void');
    expect((await statusOf(inv.id)).status).toBe('void');
  });

  it('bank_ref khác hoa/thường/khoảng trắng vẫn là MỘT giao dịch (23505)', async () => {
    const one = await make(wsA);
    const two = await make(wsA);
    const ref = newRef();
    expect((await confirm(wsA, one.id, 299_000, ref.toLowerCase())).result).toBe('ok');
    expect(await expectRejectCode(confirm(wsA, two.id, 299_000, `  ${ref} `))).toBe('23505');
    const stored = await admin.query('SELECT bank_ref FROM core.payments WHERE invoice_id = $1', [
      one.id,
    ]);
    expect(stored.rows[0]?.bank_ref).toBe(ref.toUpperCase());
  });

  it('một bank_ref không dùng cho hai hóa đơn (23505, hóa đơn thứ hai vẫn pending)', async () => {
    const one = await make(wsA);
    const two = await make(wsA);
    const ref = newRef();
    expect((await confirm(wsA, one.id, 299_000, ref)).result).toBe('ok');
    expect(await expectRejectCode(confirm(wsA, two.id, 299_000, ref))).toBe('23505');
    expect((await statusOf(two.id)).status).toBe('pending');
  });

  it('hóa đơn của workspace khác → không tìm thấy (P0002), không xác nhận chéo', async () => {
    const inv = await make(wsA);
    expect(await expectRejectCode(confirm(wsB, inv.id, 299_000))).toBe('P0002');
    expect((await statusOf(inv.id)).status).toBe('pending');
  });

  it('hủy: chỉ pending; đã trả → trả "paid" và không đổi; hủy lặp lại idempotent', async () => {
    const paid = await make(wsA);
    await confirm(wsA, paid.id, 299_000);
    expect(await worker.withJob(wsA, (tx) => voidInvoice(tx, wsA, paid.id))).toBe('paid');
    expect((await statusOf(paid.id)).status).toBe('paid');
    const pending = await make(wsA);
    await worker.withJob(wsA, (tx) => voidInvoice(tx, wsA, pending.id));
    expect(await worker.withJob(wsA, (tx) => voidInvoice(tx, wsA, pending.id))).toBe('void');
  });
});

describe('RLS và quyền ghi', () => {
  it('Owner đọc lịch sử hóa đơn của workspace mình, mới nhất trước', async () => {
    const inv = await make(wsA);
    const list = await web.withActor(wsA, ownerA, (tx) => listInvoices(tx, wsA));
    expect(list[0]?.id).toBe(inv.id);
    expect(list.every((r) => typeof r.number === 'string')).toBe(true);
  });

  it('Staff không thấy hóa đơn; Owner workspace khác không thấy', async () => {
    await make(wsA);
    expect(await web.withActor(wsA, staffA, (tx) => listInvoices(tx, wsA))).toEqual([]);
    expect(await web.withActor(wsB, ownerB, (tx) => listInvoices(tx, wsA))).toEqual([]);
    expect(await web.withActor(wsB, ownerB, (tx) => listInvoices(tx, wsB))).toEqual([]);
  });

  it('withWorkspace trần (quên withActor) KHÔNG đọc được; job hệ thống đọc được', async () => {
    const inv = await make(wsA);
    expect(await web.withWorkspace(wsA, (tx) => listInvoices(tx, wsA))).toEqual([]);
    const list = await worker.withJob(wsA, (tx) => listInvoices(tx, wsA));
    expect(list.some((r) => r.id === inv.id)).toBe(true);
  });

  it('cf_app không đọc được sao kê gốc và người xác nhận (cột payments)', async () => {
    const inv = await make(wsA);
    await worker.withJob(wsA, (tx) =>
      confirmInvoicePayment(tx, {
        workspaceId: wsA,
        invoiceId: inv.id,
        amountVnd: 299_000,
        bankRef: newRef(),
        rawStatement: 'NGUYEN VAN A CK CF',
      }),
    );
    const read = (col: string) =>
      expectRejectCode(
        web.withActor(wsA, ownerA, async (tx) => {
          await tx.execute(sql.raw(`SELECT ${col} FROM core.payments`));
        }),
      );
    expect(await read('raw_statement')).toBe('42501');
    expect(await read('confirmed_by')).toBe('42501');
    expect(await read('bank_ref')).toBeUndefined();
    const stored = await admin.query(
      'SELECT raw_statement FROM core.payments WHERE invoice_id = $1',
      [inv.id],
    );
    expect(stored.rows[0]?.raw_statement).toBe('NGUYEN VAN A CK CF');
  });

  it('cf_app KHÔNG ghi trực tiếp invoices/payments (INSERT/UPDATE/DELETE → 42501)', async () => {
    const inv = await make(wsA);
    const run = (query: string) =>
      expectRejectCode(
        web.withActor(wsA, ownerA, async (tx) => {
          await tx.execute(sql.raw(query));
        }),
      );
    expect(
      await run(
        `INSERT INTO core.invoices (workspace_id, product, number, amount_vnd, items, transfer_code, due_at) VALUES ('${wsA}', 'commentflow', 'INV-209901-000001', 1000, '[]', 'CFAAAAAAAA', now())`,
      ),
    ).toBe('42501');
    expect(await run(`UPDATE core.invoices SET status = 'paid' WHERE id = '${inv.id}'`)).toBe(
      '42501',
    );
    expect(await run(`DELETE FROM core.invoices WHERE id = '${inv.id}'`)).toBe('42501');
    expect(await run(`DELETE FROM core.payments WHERE invoice_id = '${inv.id}'`)).toBe('42501');
  });

  it('web (cf_app) không gọi được hàm ghi (42501), kể cả withJob trên pool web', async () => {
    const code = await expectRejectCode(
      web.withJob(wsA, (tx) => createInvoice(tx, invoiceInput(wsA))),
    );
    expect(code).toBe('42501');
    const inv = await make(wsA);
    expect(
      await expectRejectCode(
        web.withJob(wsA, (tx) =>
          confirmInvoicePayment(tx, {
            workspaceId: wsA,
            invoiceId: inv.id,
            amountVnd: 299_000,
            bankRef: newRef(),
          }),
        ),
      ),
    ).toBe('42501');
  });

  it('worker nhưng sai workspace ngữ cảnh → 42501; có người dùng (withActor) → 42501', async () => {
    expect(
      await expectRejectCode(worker.withJob(wsB, (tx) => createInvoice(tx, invoiceInput(wsA)))),
    ).toBe('42501');
    expect(
      await expectRejectCode(
        worker.withActor(wsA, ownerA, (tx) => createInvoice(tx, invoiceInput(wsA))),
      ),
    ).toBe('42501');
  });

  it('CHECK: mã chuyển khoản phải khớp sản phẩm; trạng thái paid phải có paid_at', async () => {
    const mismatch = await expectRejectCode(
      admin.query(
        `INSERT INTO core.invoices (workspace_id, product, number, amount_vnd, items, transfer_code, due_at)
         VALUES ($1, 'commentflow', 'INV-209901-000002', 1000, '[]', 'XFAAAAAAAA', now())`,
        [wsA],
      ),
    );
    expect(mismatch).toBe('23514');
    const inv = await make(wsA);
    expect(
      await expectRejectCode(
        admin.query("UPDATE core.invoices SET status = 'paid' WHERE id = $1", [inv.id]),
      ),
    ).toBe('23514');
  });
});

describe('FR-091 báo chuyển khoản → chờ xác nhận (QR-PAYMENT, migration 0056)', () => {
  const report = (ws: string, user: string, invoiceId: string) =>
    web.withActor(ws, user, (tx) => reportInvoiceTransfer(tx, ws, invoiceId));
  const reportedAt = async (id: string) =>
    (await admin.query('SELECT transfer_reported_at FROM core.invoices WHERE id = $1', [id]))
      .rows[0]?.transfer_reported_at as Date | null;
  const logCount = async (id: string) =>
    (
      await admin.query(
        "SELECT actor_id FROM core.action_logs WHERE action = 'invoice.transfer_reported' AND target_id = $1",
        [id],
      )
    ).rows;

  it('Owner báo lần đầu → ok, có mốc, hóa đơn vẫn pending; ghi action_logs', async () => {
    const inv = await make(wsA);
    expect(await reportedAt(inv.id)).toBeNull();
    expect(await report(wsA, ownerA, inv.id)).toBe('ok');
    expect(await reportedAt(inv.id)).toBeInstanceOf(Date);
    expect((await statusOf(inv.id)).status).toBe('pending');
    expect((await logCount(inv.id)).map((r) => r.actor_id)).toEqual([ownerA]);
    const list = await web.withActor(wsA, ownerA, (tx) => listInvoices(tx, wsA));
    expect(list.find((r) => r.id === inv.id)?.transferReportedAt).toBeInstanceOf(Date);
  });

  it('báo lần hai → already_reported, giữ mốc đầu, không ghi log thứ hai', async () => {
    const inv = await make(wsA);
    await report(wsA, ownerA, inv.id);
    const first = await reportedAt(inv.id);
    expect(await report(wsA, ownerA, inv.id)).toBe('already_reported');
    expect(await reportedAt(inv.id)).toEqual(first);
    expect(await logCount(inv.id)).toHaveLength(1);
  });

  it('ba lần bấm đồng thời → đúng một ok', async () => {
    const inv = await make(wsA);
    const results = await Promise.all([
      report(wsA, ownerA, inv.id),
      report(wsA, ownerA, inv.id),
      report(wsA, ownerA, inv.id),
    ]);
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r === 'already_reported')).toHaveLength(2);
  });

  it('đã trả hoặc đã hủy → trả trạng thái, không đặt mốc', async () => {
    const paid = await make(wsA);
    await confirm(wsA, paid.id, 299_000);
    expect(await report(wsA, ownerA, paid.id)).toBe('paid');
    expect(await reportedAt(paid.id)).toBeNull();
    const voided = await make(wsA);
    await worker.withJob(wsA, (tx) => voidInvoice(tx, wsA, voided.id));
    expect(await report(wsA, ownerA, voided.id)).toBe('void');
    expect(await reportedAt(voided.id)).toBeNull();
  });

  it('Staff → 42501; Owner workspace khác → P0002 (không lộ tồn tại); hóa đơn không đổi', async () => {
    const inv = await make(wsA);
    expect(await expectRejectCode(report(wsA, staffA, inv.id))).toBe('42501');
    expect(await expectRejectCode(report(wsB, ownerB, inv.id))).toBe('P0002');
    expect(await reportedAt(inv.id)).toBeNull();
  });

  it('không người dùng (withWorkspace), job hệ thống, workspace ngữ cảnh sai → 42501', async () => {
    const inv = await make(wsA);
    const bare = web.withWorkspace(wsA, (tx) => reportInvoiceTransfer(tx, wsA, inv.id));
    expect(await expectRejectCode(bare)).toBe('42501');
    const job = worker.withJob(wsA, (tx) => reportInvoiceTransfer(tx, wsA, inv.id));
    expect(await expectRejectCode(job)).toBe('42501');
    const wrongWs = web.withActor(wsB, ownerB, (tx) => reportInvoiceTransfer(tx, wsA, inv.id));
    expect(await expectRejectCode(wrongWs)).toBe('42501');
    expect(await reportedAt(inv.id)).toBeNull();
  });

  it('cf_app vẫn không UPDATE trực tiếp transfer_reported_at (42501)', async () => {
    const inv = await make(wsA);
    const direct = web.withActor(wsA, ownerA, (tx) =>
      tx.execute(
        sql`UPDATE core.invoices SET transfer_reported_at = now() WHERE id = ${inv.id}::uuid`,
      ),
    );
    expect(await expectRejectCode(direct)).toBe('42501');
  });
});
