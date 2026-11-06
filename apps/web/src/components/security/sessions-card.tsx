import { Laptop, MonitorSmartphone, Smartphone } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { revokeOtherSessionsAction, revokeSessionAction } from '../../app/app/security/actions';
import { SectionHead } from '../ui/section-head';
import { SubmitButton } from '../ui/submit-button';

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

/** Danh sách phiên đăng nhập CỦA CHÍNH người dùng + đăng xuất từng phiên khác (dùng ở `/app/security` và `/app/settings`). */
export async function SessionsCard({ sessions }: { sessions: SessionRow[] }) {
  const [t, format] = await Promise.all([getTranslations('auth.security'), getFormatter()]);
  return (
    <section className="card stack" aria-labelledby="sessions-title">
      <SectionHead
        id="sessions-title"
        icon={<MonitorSmartphone size={22} />}
        title={t('sessions.title')}
        description={t('sessions.body')}
        end={
          sessions.some((session) => !session.current) ? (
            <form action={revokeOtherSessionsAction}>
              <SubmitButton variant="danger-ghost" block={false}>
                {t('sessions.signOutOthers')}
              </SubmitButton>
            </form>
          ) : null
        }
      />
      {sessions.length === 0 ? <p className="muted">{t('sessions.empty')}</p> : null}
      <ul className="session-list">
        {sessions.map((session) => {
          const Icon = MOBILE_OS.includes(session.os) ? Smartphone : Laptop;
          return (
            <li key={session.id} className={`session-item${session.current ? ' is-current' : ''}`}>
              <span className="session-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <div className="session-info">
                <p className="session-device">
                  {t('sessions.device', {
                    browser: t(`sessions.browser.${session.browser}`),
                    os: t(`sessions.os.${session.os}`),
                  })}
                  {session.current ? (
                    <span className="chip chip-success">{t('sessions.current')}</span>
                  ) : null}
                </p>
                <p className="muted">
                  {t('sessions.lastUsed', {
                    date: format.dateTime(session.lastUsedAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </p>
                {session.createdAt ? (
                  <p className="muted">
                    {t('sessions.signedInAt', {
                      date: format.dateTime(session.createdAt, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                      code: session.id.slice(-4),
                    })}
                  </p>
                ) : null}
              </div>
              {session.current ? null : (
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <SubmitButton variant="secondary" block={false}>
                    {t('sessions.revoke')}
                  </SubmitButton>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
