import { describe, expect, it } from 'vitest';
import { createReservationBook } from './reservations';

describe('FR-071 sổ đặt chỗ chi phí đang bay', () => {
  it('cộng dồn theo workspace và nhả đúng phần đã đặt', () => {
    const book = createReservationBook();
    const releaseA = book.reserve('a', 0.5);
    book.reserve('a', 0.25);
    book.reserve('b', 1);
    expect(book.inFlightUsd('a')).toBeCloseTo(0.75, 9);
    expect(book.inFlightUsd('b')).toBe(1);
    releaseA();
    expect(book.inFlightUsd('a')).toBeCloseTo(0.25, 9);
  });

  it('nhả hai lần chỉ có tác dụng một lần (idempotent)', () => {
    const book = createReservationBook();
    const release = book.reserve('a', 1);
    release();
    release();
    expect(book.inFlightUsd('a')).toBe(0);
  });

  it('workspace chưa có gì → 0; số lẻ không trôi (làm tròn micro-đô)', () => {
    const book = createReservationBook();
    expect(book.inFlightUsd('x')).toBe(0);
    const releases = Array.from({ length: 10 }, () => book.reserve('x', 0.1));
    for (const r of releases) r();
    expect(book.inFlightUsd('x')).toBe(0);
  });

  it('withLock chạy tuần tự theo workspace, workspace khác không chờ nhau', async () => {
    const book = createReservationBook();
    const order: string[] = [];
    const slow = book.withLock('a', async () => {
      order.push('a1-start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('a1-end');
    });
    const next = book.withLock('a', async () => {
      order.push('a2');
    });
    const other = book.withLock('b', async () => {
      order.push('b');
    });
    await Promise.all([slow, next, other]);
    expect(order.indexOf('a1-end')).toBeLessThan(order.indexOf('a2'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a1-end'));
  });

  it('withLock vẫn nhả khóa khi hàm ném lỗi, và ném lại đúng lỗi đó', async () => {
    const book = createReservationBook();
    await expect(
      book.withLock('a', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(book.withLock('a', async () => 'ok')).resolves.toBe('ok');
  });
});
