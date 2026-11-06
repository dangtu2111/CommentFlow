import { getFormatter, getTranslations } from 'next-intl/server';
import { revokeSessionAction } from '../../app/app/security/actions';
import { SubmitButton } from '../ui/submit-button';

export type SessionRow = {
  id: string;
  browser: string;
  os: string;
  current: boolean;
  lastUsedAt: Date;
};

/** Danh sách phiên đăng nhập CỦA CHÍNH người dùng + đăng xuất từng phiên khác (dùng ở `/app/security` và `/app/settings`). */
export async function SessionsCard({ sessions }: { sessions: SessionRow[] }) {
  const [t, format] = await Promise.all([getTranslations('auth.security'), getFormatter()]);
  return (
    <section className="card stack" aria-labelledby="sessions-title">
      <h2 id="sessions-title" className="section-title">
        {t('sessions.title')}
      </h2>
      <p className="muted">{t('sessions.body')}</p>
      {sessions.length === 0 ? <p className="muted">{t('sessions.empty')}</p> : null}
      <ul className="session-list">
        {sessions.map((session) => (
          <li key={session.id} className="session-item">
            <div>
              <p className="session-device">
                {t('sessions.device', {
                  browser: t(`sessions.browser.${session.browser}`),
                  os: t(`sessions.os.${session.os}`),
                })}
                {session.current ? (
                  <span className="badge badge-on">{t('sessions.current')}</span>
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
            </div>
            {session.current ? null : (
              <form action={revokeSessionAction}>
                <input type="hidden" name="sessionId" value={session.id} />
                <SubmitButton variant="secondary" block={false}>
                  {t('sessions.signOut')}
                </SubmitButton>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
