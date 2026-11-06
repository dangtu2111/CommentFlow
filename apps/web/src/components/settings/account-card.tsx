import { maskPhone, WORKSPACE_TIME_ZONES } from '@flow/saas-core';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { timezoneLabel } from '../../lib/profile-form';
import { userInitials } from '../../lib/user-initials';
import { Icon } from '../ui/icon';
import { PhoneDialog } from './phone-dialog';
import { PHONE_DIALOG_ID, ProfileDialog, ProfileTrigger } from './profile-dialog';
import { TwDialogTrigger } from './tw/dialog';
import { TwCard, TwCardHead, TwChip, twBtn } from './tw/ui';

const TITLE_ID = 'account-title';

export type AccountProfile = {
  image: string | null;
  timezone: string;
  /** E.164 thô — chỉ để che ở đây, KHÔNG đưa xuống client. */
  phone: string | null;
  phoneVerified: boolean;
};

/**
 * Thông tin đăng nhập & tài khoản của CHÍNH người dùng (dữ liệu thật: tên, email, đã xác thực, vai trò, SĐT che giữa).
 * "Chỉnh sửa thông tin" mở hộp thoại lưu thật (tên, múi giờ, ảnh); SĐT xác minh bằng OTP trong hộp thoại riêng.
 * `children` = dòng đổi mật khẩu (Stitch đặt nó trong cùng thẻ).
 */
export async function AccountCard({
  name,
  email,
  emailVerified,
  memberRole,
  profile,
  phoneVerifyEnabled,
  avatarEnabled,
  children,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
  memberRole: string;
  profile: AccountProfile;
  phoneVerifyEnabled: boolean;
  avatarEnabled: boolean;
  children?: ReactNode;
}) {
  const [t, tr] = await Promise.all([
    getTranslations('settings.account'),
    getTranslations('members.roles'),
  ]);
  const roleLabel = tr(memberRole as 'owner');
  const phoneMasked = maskPhone(profile.phone);
  const zones = Array.from(new Set([profile.timezone, ...WORKSPACE_TIME_ZONES])).map((value) => ({
    value,
    label: timezoneLabel(value),
  }));
  return (
    <TwCard labelledBy={TITLE_ID}>
      <TwCardHead
        id={TITLE_ID}
        icon={<Icon name="badge" size={24} />}
        title={t('title')}
        description={t('body')}
        end={<ProfileTrigger label={t('edit')} />}
      />
      <ProfileDialog
        name={name}
        email={email}
        emailVerified={emailVerified}
        image={profile.image}
        timezone={profile.timezone}
        timezones={zones}
        phoneMasked={phoneMasked}
        phoneVerifyEnabled={phoneVerifyEnabled}
        avatarEnabled={avatarEnabled}
      />
      <PhoneDialog enabled={phoneVerifyEnabled} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg pt-2">
        <div className="flex items-center gap-space-md md:col-span-1">
          <span
            aria-hidden="true"
            className="w-16 h-16 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-headline-sm text-headline-sm shadow-sm shrink-0 overflow-hidden"
          >
            {profile.image?.startsWith('https://') ? (
              <img src={profile.image} alt="" className="w-full h-full object-cover" />
            ) : (
              userInitials(name)
            )}
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
            <div
              data-testid="account-phone"
              className={
                phoneMasked
                  ? 'font-title-sm text-title-sm text-on-surface'
                  : 'font-title-sm text-title-sm text-on-surface-variant'
              }
            >
              {phoneMasked || t('phoneEmpty')}
            </div>
            {phoneMasked && profile.phoneVerified ? (
              <div className="flex items-center gap-1 text-[#237A36] font-label-sm text-label-sm pt-0.5">
                <Icon name="verified" size={12} /> {t('phoneVerified')}
              </div>
            ) : phoneVerifyEnabled ? (
              <TwDialogTrigger
                dialogId={PHONE_DIALOG_ID}
                className={`${twBtn({ tone: 'plain', size: 'sm' })} !px-0`}
              >
                <Icon name="phone_iphone" size={12} /> {t('verifyPhone')}
              </TwDialogTrigger>
            ) : (
              <div className="flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm pt-0.5">
                <Icon name="phone_iphone" size={12} /> {t('verifyPhoneOff')}
              </div>
            )}
          </div>
        </div>
      </div>
      {children}
    </TwCard>
  );
}
