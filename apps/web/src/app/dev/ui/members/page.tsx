import { notFound } from 'next/navigation';
import {
  type InvitationRowView,
  type MemberRowView,
  MembersView,
} from '../../../../components/app/members-view';
import { DEV_SAMPLE_NOTE, DevShell } from '../../../../components/dev/dev-shell';

const NOW = new Date('2026-11-06T10:30:00Z');
const DAY = 86_400_000;
const VIEWER = 'u1';
const WORKSPACE = '[MẪU] Cửa hàng mẫu';

const MEMBERS: MemberRowView[] = [
  {
    memberId: 'm1',
    userId: 'u1',
    name: '[MẪU] Nguyễn Mai Linh',
    email: 'mau1@example.invalid',
    role: 'owner',
    status: 'active',
  },
  {
    memberId: 'm2',
    userId: 'u2',
    name: '[MẪU] Trần Quốc Huy',
    email: 'mau2@example.invalid',
    role: 'staff',
    status: 'active',
  },
  {
    memberId: 'm3',
    userId: 'u3',
    name: '[MẪU] Lê Thùy Dung',
    email: '',
    role: 'staff',
    status: 'suspended',
  },
];

const INVITATIONS: InvitationRowView[] = [
  {
    id: 'i1',
    email: 'moi1@example.invalid',
    role: 'staff',
    expired: false,
    expiresAt: new Date(NOW.getTime() + 2 * DAY),
  },
  {
    id: 'i2',
    email: 'moi2@example.invalid',
    role: 'staff',
    expired: true,
    expiresAt: new Date(NOW.getTime() - DAY),
  },
];

/** Trang xem giao diện Thành viên với DỮ LIỆU MẪU — chỉ khi `NODE_ENV !== 'production'`. */
export default function DevMembersPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <DevShell>
      <p className="inbox-sample-note" role="note">
        {DEV_SAMPLE_NOTE}
      </p>
      <main className="app-page app-page-settings">
        <MembersView
          frame={{ viewerRole: 'owner', counts: null }}
          currentUserId={VIEWER}
          workspaceName={WORKSPACE}
          members={MEMBERS}
          invitations={INVITATIONS}
        />
      </main>
    </DevShell>
  );
}
