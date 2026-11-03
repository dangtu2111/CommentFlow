import { describe, expect, it } from 'vitest';
import { clientIpFrom } from './client-ip';

const headersOf = (init: Record<string, string>) => new Headers(init);

describe('clientIpFrom — nguồn none (dev/LAN)', () => {
  it('KHÔNG lấy IP từ bất kỳ header nào, kể cả khi client giả X-Forwarded-For / X-Real-IP / CF-Connecting-IP', () => {
    const spoofed = headersOf({
      'x-forwarded-for': '6.6.6.6, 7.7.7.7',
      'x-real-ip': '8.8.8.8',
      'cf-connecting-ip': '9.9.9.9',
    });
    expect(clientIpFrom(spoofed, 'none')).toBeUndefined();
    expect(clientIpFrom(headersOf({}), 'none')).toBeUndefined();
  });
});

describe('clientIpFrom — nguồn cf-connecting-ip (staging)', () => {
  it('lấy IP từ CF-Connecting-IP (IPv4 và IPv6)', () => {
    expect(clientIpFrom(headersOf({ 'cf-connecting-ip': '203.0.113.9' }), 'cf-connecting-ip')).toBe(
      '203.0.113.9',
    );
    expect(
      clientIpFrom(headersOf({ 'cf-connecting-ip': ' 2001:db8::1 ' }), 'cf-connecting-ip'),
    ).toBe('2001:db8::1');
  });

  it('bỏ qua X-Forwarded-For / X-Real-IP dù có mặt; thiếu header → undefined', () => {
    expect(
      clientIpFrom(
        headersOf({ 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '8.8.8.8' }),
        'cf-connecting-ip',
      ),
    ).toBeUndefined();
  });

  it('giá trị không phải một IP (danh sách, chữ, mã độc, rỗng) → undefined', () => {
    for (const bad of ['', 'abc', '1.2.3.4, 5.6.7.8', '<script>', '999.1.1.1', '1.2.3.4:80']) {
      expect(
        clientIpFrom(headersOf({ 'cf-connecting-ip': bad }), 'cf-connecting-ip'),
        bad,
      ).toBeUndefined();
    }
  });
});
