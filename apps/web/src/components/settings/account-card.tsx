import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { userInitials } from '../../lib/user-initials';
import { Icon } from '../ui/icon';
import { TwCard, TwCardHead, TwChip, TwSoonButton } from './tw/ui';

const TITLE_ID = 'account-title';

/**
 * Thông tin đăng nhập & tài khoản của CHÍNH người dùng (chỉ dữ liệu thật: tên, email, đã xác thực, vai trò).
 * Số điện thoại và "Chỉnh sửa thông tin" chưa có dữ liệu/chức năng → hiện đúng thiết kế, vô hiệu + "Sắp có".
 * `children` = dòng đổi mật khẩu (Stitch đặt nó trong cùng thẻ).
 */
export async function AccountCard({
  name,
  email,
  emailVerified,
  memberRole,
  children,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
  memberRole: string;
  children?: ReactNode;
}) {
  const [t, tr] = await Promise.all([
    getTranslations('settings.account'),
    getTranslations('members.roles'),
  ]);
  const roleLabel = tr(memberRole as 'owner');
  return (
    <TwCard labelledBy={TITLE_ID}>
      <TwCardHead
        id={TITLE_ID}
        icon={<Icon name="badge" size={24} />}
        title={t('title')}
        description={t('body')}
        end={
          <TwSoonButton tone="soft" soon={t('soon')}>
            {t('edit')}
          </TwSoonButton>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg pt-2">
        <div className="flex items-center gap-space-md md:col-span-1">
          <span
            aria-hidden="true"
            className="w-16 h-16 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-headline-sm text-headline-sm shadow-sm shrink-0"
          >
            {userInitials(name)}
          </span>
          <div>
            <p className="font-title-md text-title-md text-on-surface">{name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <TwChip tone={memberRole === 'owner' ? 'info' : 'muted'}>{roleLabel}</TwChip>
            </div>
          </div>
        </div>
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-space-md">
          <div className="p-space-md rounded-lg bg-surface-container-low space-y-1">
            <div className="text-on-surface-variant font-label-sm text-label-sm">{t('email')}</div>
            <div className="font-title-sm text-title-sm text-on-surface truncate">{email}</div>
            {emailVerified ? (
              <div className="flex items-center gap-1 text-[#237A36] font-label-sm text-label-sm pt-0.5">
                <Icon name="verified" size={12} /> {t('verified')}
              </div>
            ) : null}
          </div>
          <div className="p-space-md rounded-lg bg-surface-container-low space-y-1">
            <div className="text-on-surface-variant font-label-sm text-label-sm">{t('phone')}</div>
            <div className="font-title-sm text-title-sm text-on-surface-variant">
              {t('phoneEmpty')}
            </div>
            <div className="flex items-center gap-1 text-primary font-label-sm text-label-sm pt-0.5">
              <Icon name="phone_iphone" size={12} /> {t('soon')}
            </div>
          </div>
        </div>
      </div>
      {children}
    </TwCard>
  );
}
