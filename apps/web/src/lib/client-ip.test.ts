import { describe, expect, it } from 'vitest';
import { clientIpFrom } from './client-ip';

describe('clientIpFrom', () => {
  it('không có proxy tin cậy → bỏ qua header (khách tự đặt được)', () => {
    expect(clientIpFrom('1.2.3.4', 0)).toBeUndefined();
    expect(clientIpFrom('6.6.6.6, 1.2.3.4', 0)).toBeUndefined();
  });

  it('một proxy tin cậy → phần tử cuối; giá trị giả đứng trước bị bỏ qua', () => {
    expect(clientIpFrom('203.0.113.9', 1)).toBe('203.0.113.9');
    expect(clientIpFrom('6.6.6.6, 203.0.113.9', 1)).toBe('203.0.113.9');
  });

  it('hai proxy (CDN + cân bằng tải) → phần tử thứ hai từ phải', () => {
    expect(clientIpFrom('6.6.6.6, 203.0.113.9, 10.0.0.2', 2)).toBe('203.0.113.9');
  });

  it('danh sách ngắn hơn số proxy, thiếu header, hoặc giá trị không phải IP → undefined', () => {
    expect(clientIpFrom('203.0.113.9', 2)).toBeUndefined();
    expect(clientIpFrom(null, 1)).toBeUndefined();
    expect(clientIpFrom('<script>', 1)).toBeUndefined();
    expect(clientIpFrom('2001:db8::1', 1)).toBe('2001:db8::1');
  });
});
