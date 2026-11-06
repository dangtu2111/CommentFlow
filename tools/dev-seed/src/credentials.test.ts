import { describe, expect, it } from 'vitest';
import { DEMO_EMAILS, generateDemoPassword } from './credentials';

describe('DEV-SEED-DEMO mật khẩu thử', () => {
  it('đủ dài, có chữ hoa/thường/số, khác nhau mỗi lần', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = generateDemoPassword();
      expect(p.length).toBeGreaterThanOrEqual(20);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[0-9]/);
      seen.add(p);
    }
    expect(seen.size).toBe(50);
  });

  it('email thử dùng tên miền .test, không phải địa chỉ thật', () => {
    expect(DEMO_EMAILS.owner).toMatch(/@example\.test$/);
    expect(DEMO_EMAILS.staff).toMatch(/@example\.test$/);
    expect(DEMO_EMAILS.owner).not.toBe(DEMO_EMAILS.staff);
  });
});
