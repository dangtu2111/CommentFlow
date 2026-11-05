import { cookies, headers } from 'next/headers';
import { clientIpFrom } from '../lib/client-ip';
import { cookieHeaderFromJar } from '../lib/cookie-header';
import { getAuthRuntime } from './auth';

/**
 * IP khách chỉ lấy từ nguồn đã cấu hình (ADR 004 §2; dev: không có IP). Mọi header IP của client bị XÓA trước khi
 * gửi cho Better Auth, rồi chỉ đặt lại `x-forwarded-for` bằng IP đã tin cậy — nên `sessions.ip` và rate limit
 * không bị giả bằng header tự đặt. Mọi Server Action gọi saas-core phải dùng hàm này thay vì `headers()` thô.
 */
export async function requestContext(): Promise<{ ip: string | undefined; headers: Headers }> {
  const incoming = await headers();
  const ip = clientIpFrom(incoming, getAuthRuntime().clientIpSource);
  const forwarded = new Headers(incoming);
  for (const name of ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip']) forwarded.delete(name);
  if (ip) forwarded.set('x-forwarded-for', ip);
  // Cookie theo kho hiện tại của Next: thấy cả cookie Server Action vừa đặt (xoay phiên) khi trang dựng lại.
  const cookie = cookieHeaderFromJar(incoming.get('cookie'), (await cookies()).getAll());
  if (cookie) forwarded.set('cookie', cookie);
  else forwarded.delete('cookie');
  return { ip, headers: forwarded };
}
