import { notFound } from 'next/navigation';
import { AuthShell } from '../../../../components/auth/auth-shell';
import { LoginView } from '../../../../components/auth/auth-views';

/** Đăng nhập (design/stitch/auth-login-register.html) với khối mẫu `[MẪU]` — CHỈ khi `NODE_ENV !== 'production'`. */
export default function DevAuthPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <AuthShell sample>
      <LoginView />
    </AuthShell>
  );
}
