import { notFound } from 'next/navigation';
import { AuthShell } from '../../../../components/auth/auth-shell';
import { RegisterView } from '../../../../components/auth/auth-views';

/** Tab Đăng ký của màn đăng nhập/đăng ký, dữ liệu mẫu — CHỈ khi `NODE_ENV !== 'production'`. */
export default function DevAuthRegisterPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <AuthShell sample>
      <RegisterView sample />
    </AuthShell>
  );
}
