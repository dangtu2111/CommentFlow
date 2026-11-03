import { redirect } from 'next/navigation';
import { getCurrentUser } from '../server/session';

/** Trang gốc: đã đăng nhập → /app, chưa → /login. */
export default async function HomePage() {
  redirect((await getCurrentUser()) ? '/app' : '/login');
}
