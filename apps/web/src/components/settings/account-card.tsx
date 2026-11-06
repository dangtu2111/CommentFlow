import { BadgeCheck, IdCard } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { roleTone } from '../../lib/settings-visual';
import { userInitials } from '../../lib/user-initials';
import { SectionHead } from '../ui/section-head';

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
          <span className="avatar avatar-lg" aria-hidden="true">
            {userInitials(name)}
          </span>
          <div>
            <p className="account-name">{name}</p>
            <span
              className={`chip ${roleTone(memberRole) === 'owner' ? 'chip-info' : 'chip-muted'}`}
            >
              {roleLabel}
            </span>
          </div>
        </div>
        <div className="info-tile">
          <p className="info-tile-label">{t('email')}</p>
          <p className="info-tile-value">{email}</p>
          {emailVerified ? (
            <p className="info-tile-note is-ok">
              <BadgeCheck size={14} aria-hidden="true" /> {t('verified')}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
