import { randomInt } from 'node:crypto';

/** Email thử: miền `.test` (RFC 2606) không bao giờ gửi được thư thật. */
export const DEMO_EMAILS = {
  owner: 'owner.mau@example.test',
  staff: 'staff.mau@example.test',
  /** Nhân viên thứ hai: để trang Báo cáo có số liệu "theo nhân viên" (so sánh hai người). */
  staff2: 'staff2.mau@example.test',
} as const;

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const ALL = LOWER + UPPER + DIGIT;
const LENGTH = 24;

const pick = (chars: string): string => chars[randomInt(chars.length)] as string;

/** Mật khẩu ngẫu nhiên (CSPRNG), có đủ chữ hoa/thường/số. Chỉ IN RA terminal một lần, không lưu file. */
export function generateDemoPassword(): string {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT)];
  while (chars.length < LENGTH) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join('');
}
