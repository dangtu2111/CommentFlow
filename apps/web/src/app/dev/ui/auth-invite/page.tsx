import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { authButtonClass } from '../../../../components/auth/auth-styles';
import { InviteShell } from '../../../../components/auth/invite-panel';
import { INVITE_SAMPLE } from '../../../../lib/invite-sample';

/**
 * Nhận lời mời (design/stitch/accept-invite.html) với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'`.
 * Nút hành động là phần tử giả (không có token thật), nên chỉ để xem bố cục.
 */
export default async function DevAuthInvitePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const [t, tr] = await Promise.all([getTranslations('invite'), getTranslations('members.roles')]);
  return (
    <InviteShell workspace="[MẪU] Cửa hàng mẫu" role={tr('staff')} sample={INVITE_SAMPLE}>
      <p className="font-body-md text-body-md text-on-surface-variant">{t('card.signedOut')}</p>
      <span className={authButtonClass()} aria-disabled="true">
        {t('card.login')}
      </span>
      <span className={authButtonClass('neutral')} aria-disabled="true">
        {t('card.register')}
      </span>
    </InviteShell>
  );
}
