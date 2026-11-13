import { redirect } from 'next/navigation';
import { requireAppUser } from '../../../../server/require-app-user';

/** Trang cũ "Câu kiểm thử" đã gộp vào Độ sẵn sàng AI & Kiểm thử: giữ đường dẫn cũ (dấu trang, liên kết) bằng chuyển hướng. */
export default async function KbTestSetRedirect() {
  await requireAppUser({ role: 'owner' });
  redirect('/app/readiness#test-lab');
}
