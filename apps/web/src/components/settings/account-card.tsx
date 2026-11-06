import { BadgeCheck, IdCard } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { roleTone } from '../../lib/settings-visual';
import { userInitials } from '../../lib/user-initials';
import { Avatar } from '../ui/avatar';
import { Chip } from '../ui/chip';
import { SectionHead } from '../ui/section-head';
import { Stat } from '../ui/stat';

/** Thông tin đăng nhập & tài khoản của CHÍNH người dùng (chỉ dữ liệu thật: tên, email, đã xác thực, vai trò). */
export async function AccountCard({
  name,
  email,
  emailVerified,
  memberRole,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
  memberRole: string;
}) {
  const [t, tr] = await Promise.all([
    getTranslations('settings.account'),
    getTranslations('members.roles'),
  ]);
  const roleLabel = tr(memberRole as 'owner');
  return (
    <section className="card stack" aria-labelledby="account-title">
      <SectionHead
        id="account-title"
        icon={<IdCard size={22} />}
        title={t('title')}
        description={t('body')}
      />
      <div className="account-grid">
        <div className="account-person">
          <Avatar size="lg">{userInitials(name)}</Avatar>
          <div>
            <p className="account-name">{name}</p>
            <Chip tone={roleTone(memberRole) === 'owner' ? 'info' : 'muted'}>{roleLabel}</Chip>
          </div>
        </div>
        <Stat
          label={t('email')}
          value={email}
          noteOk
          note={
            emailVerified ? (
              <>
                <BadgeCheck size={14} aria-hidden="true" /> {t('verified')}
              </>
            ) : null
          }
        />
      </div>
    </section>
  );
}
