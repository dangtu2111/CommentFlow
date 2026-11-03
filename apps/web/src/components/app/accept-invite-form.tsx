'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { type AcceptInviteState, acceptInviteAction } from '../../app/invite/[token]/actions';
import { Banner } from '../ui/banner';
import { SubmitButton } from '../ui/submit-button';

const IDLE: AcceptInviteState = { status: 'idle' };

/** Nút "Chấp nhận lời mời". Mọi lỗi (sai email, hết hạn, đã dùng...) hiện cùng một thông báo trung tính. */
export function AcceptInviteForm({ token }: { token: string }) {
  const t = useTranslations('invite');
  const [state, action] = useActionState(acceptInviteAction, IDLE);
  const message =
    state.status === 'error'
      ? t(`errors.${state.message}`, { minutes: state.retryMinutes ?? 1 })
      : null;
  return (
    <form action={action} className="form">
      <input type="hidden" name="token" value={token} />
      {message ? <Banner variant="danger">{message}</Banner> : null}
      <SubmitButton>{t('card.accept')}</SubmitButton>
    </form>
  );
}
