import type { ReadinessResult } from '@flow/ai';
import { listChannels } from '@flow/db/runtime';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { OnboardingStepper } from '../../../../components/app/onboarding-stepper';
import { SetupReadinessBar } from '../../../../components/app/setup-readiness-bar';
import { SimpleTopbar } from '../../../../components/app/simple-topbar';
import { FB_START_PATH } from '../../../../lib/fb-connect-view';
import { parseSetupStep, type SetupStepKey, setupNav } from '../../../../lib/onboarding-setup';
import { getBrand } from '../../../../server/brand';
import { getDb } from '../../../../server/db';
import { getEnabledFbConfig } from '../../../../server/fb-connect-runtime';
import { loadReadiness, readinessLangOf } from '../../../../server/readiness';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const t = await getTranslations('onboarding');
  return { title: `${t('eyebrow')} · ${getBrand().name}` };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function facebookEnabled(): boolean {
  try {
    return getEnabledFbConfig() !== null;
  } catch {
    return false; // bật mà thiếu biến: trang Kênh báo chi tiết; ở đây chỉ tắt nút
  }
}

/** Trình hướng dẫn thiết lập bước 2–5 (FR-146, UF-1): chỉ Owner; nối vào chức năng đã có, không logic mới. */
export default async function OnboardingSetupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const [t, locale, query] = await Promise.all([getTranslations(), getLocale(), searchParams]);
  const step: SetupStepKey = parseSetupStep(query.step);
  const nav = setupNav(step);

  const channels = await getDb().withActor(workspace.id, user.id, (tx) =>
    listChannels(tx, workspace.id),
  );

  let readiness: ReadinessResult | null = null;
  if (step === 'knowledge') {
    try {
      readiness = await loadReadiness(workspace.id, user.id, readinessLangOf(locale));
    } catch {
      readiness = null; // không lộ chi tiết lỗi; khối hiện thông báo chung
    }
  }
  const fbOn = facebookEnabled();

  return (
    <div className="page-frame">
      <SimpleTopbar href="/app" workspaceName={workspace.name} />
      <main className="page-frame-main">
        <section className="card hero-card">
          <p className="hero-code">{t('onboarding.eyebrow')}</p>
          <h1 className="hero-title">{t('onboarding.setup.title')}</h1>
          <p className="hero-body">{t('onboarding.setup.subtitle')}</p>
        </section>
        <OnboardingStepper active={step} />

        {step === 'channels' || step === 'pages' ? (
          <section className="card stack" aria-labelledby="setup-channels-title">
            <h2 id="setup-channels-title" className="section-title">
              {t(`onboarding.setup.${step}.title`)}
            </h2>
            <p className="muted">{t(`onboarding.setup.${step}.body`)}</p>
            {channels.length === 0 ? (
              <p className="muted">{t('onboarding.setup.noChannels')}</p>
            ) : (
              <ul className="member-list">
                {channels.map((channel) => (
                  <li key={channel.id} className="member-item">
                    <div className="member-info">
                      <p className="member-name">{channel.name}</p>
                      <p>
                        <span className="badge badge-off">
                          {t(`channels.platform.${channel.platform}`)}
                        </span>{' '}
                        <span
                          className={
                            channel.status === 'connected' ? 'badge badge-on' : 'badge badge-off'
                          }
                        >
                          {t(`channels.status.${channel.status}`)}
                        </span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="row">
              {fbOn ? (
                <a href={FB_START_PATH} className="btn btn-primary">
                  {t('channels.connect')}
                </a>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled
                  aria-describedby="fb-off"
                >
                  {t('channels.connect')}
                </button>
              )}
              <Link href="/app/channels" className="btn btn-secondary">
                {t('onboarding.setup.manageChannels')}
              </Link>
            </div>
            {fbOn ? null : (
              <p id="fb-off" className="muted">
                {t('channels.disabled')}
              </p>
            )}
          </section>
        ) : null}

        {step === 'knowledge' ? (
          <>
            <section className="card stack" aria-labelledby="setup-knowledge-title">
              <h2 id="setup-knowledge-title" className="section-title">
                {t('onboarding.setup.knowledge.title')}
              </h2>
              <p className="muted">{t('onboarding.setup.knowledge.body')}</p>
              <div className="row">
                <Link href="/app/products/import" className="btn btn-primary">
                  {t('onboarding.setup.knowledge.importProducts')}
                </Link>
                <Link href="/app/kb" className="btn btn-secondary">
                  {t('onboarding.setup.knowledge.openKb')}
                </Link>
              </div>
            </section>
            <SetupReadinessBar result={readiness} />
          </>
        ) : null}

        {step === 'invite' ? (
          <section className="card stack" aria-labelledby="setup-invite-title">
            <h2 id="setup-invite-title" className="section-title">
              {t('onboarding.setup.invite.title')}
            </h2>
            <p className="muted">{t('onboarding.setup.invite.body')}</p>
            <Link href="/app/members" className="btn btn-primary">
              {t('onboarding.setup.invite.open')}
            </Link>
          </section>
        ) : null}

        <nav className="setup-footer" aria-label={t('onboarding.stepsLabel')}>
          <Link href={nav.back} className="btn btn-secondary">
            {t('onboarding.setup.back')}
          </Link>
          <p className="muted">{t('onboarding.setup.skipHint')}</p>
          <Link href={nav.next} className="btn btn-primary">
            {step === 'invite' ? t('onboarding.setup.finish') : t('onboarding.setup.next')}
          </Link>
        </nav>
      </main>
    </div>
  );
}
