import { getFormatter, getTranslations } from 'next-intl/server';
import { revokeOtherSessionsAction, revokeSessionAction } from '../../app/app/security/actions';
import { cn } from '../../lib/cn';
import { TwSubmit } from '../settings/tw/dialog';
import { TwCard, TwCardHead, TwChip } from '../settings/tw/ui';
import { Icon } from '../ui/icon';

export type SessionRow = {
  id: string;
  browser: string;
  os: string;
  current: boolean;
  lastUsedAt: Date;
  /** Thời điểm đăng nhập (tạo phiên). */
  createdAt?: Date;
};

const MOBILE_OS = ['ios', 'android'];
const TITLE_ID = 'sessions-title';

/** Danh sách phiên đăng nhập CỦA CHÍNH người dùng + đăng xuất từng phiên khác (dùng ở `/app/security` và `/app/settings`). */
export async function SessionsCard({ sessions }: { sessions: SessionRow[] }) {
  const [t, format] = await Promise.all([getTranslations('auth.security'), getFormatter()]);
  const when = (date: Date) => format.dateTime(date, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <TwCard labelledBy={TITLE_ID}>
      <TwCardHead
        id={TITLE_ID}
        icon={<Icon name="devices_other" size={24} />}
        title={t('sessions.title')}
        description={t('sessions.body')}
        end={
          sessions.some((session) => !session.current) ? (
            <form action={revokeOtherSessionsAction}>
              <TwSubmit tone="danger-soft" size="md">
                <Icon name="logout" size={16} />
                {t('sessions.signOutOthers')}
              </TwSubmit>
            </form>
          ) : null
        }
      />
      {sessions.length === 0 ? (
        <p className="font-body-md text-body-md text-on-surface-variant">{t('sessions.empty')}</p>
      ) : null}
      <ul className="space-y-space-sm">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="p-space-md rounded-xl bg-surface-container-low flex flex-col md:flex-row md:items-center justify-between gap-space-md"
          >
            <div className="flex items-start gap-space-md">
              <span
                aria-hidden="true"
                className={cn(
                  'w-10 h-10 rounded-lg bg-surface-container-lowest flex items-center justify-center shrink-0',
                  session.current ? 'text-primary' : 'text-secondary',
                )}
              >
                <Icon
                  name={MOBILE_OS.includes(session.os) ? 'phone_iphone' : 'laptop_mac'}
                  size={20}
                />
              </span>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-title-md text-title-md text-on-surface">
                    {t('sessions.device', {
                      browser: t(`sessions.browser.${session.browser}`),
                      os: t(`sessions.os.${session.os}`),
                    })}
                  </span>
                  {session.current ? (
                    <TwChip tone="ok" className="font-semibold">
                      {t('sessions.current')}
                    </TwChip>
                  ) : null}
                </div>
                <div className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-3 flex-wrap">
                  <span>{t('sessions.lastUsed', { date: when(session.lastUsedAt) })}</span>
                  {session.createdAt ? (
                    <span>
                      {t('sessions.signedInAt', {
                        date: when(session.createdAt),
                        code: session.id.slice(-4),
                      })}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            {session.current ? null : (
              <form action={revokeSessionAction}>
                <input type="hidden" name="sessionId" value={session.id} />
                <TwSubmit tone="danger-ghost" size="sm">
                  {t('sessions.revoke')}
                </TwSubmit>
              </form>
            )}
          </li>
        ))}
      </ul>
    </TwCard>
  );
}
