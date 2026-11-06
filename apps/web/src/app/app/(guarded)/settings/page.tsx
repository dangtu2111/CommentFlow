import { listChannels } from '@flow/db/runtime';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ChangePasswordCard } from '../../../../components/security/change-password-card';
import { SessionsCard } from '../../../../components/security/sessions-card';
import { TwoFactorCard } from '../../../../components/security/two-factor-card';
import { AccountCard } from '../../../../components/settings/account-card';
import { LanguageCard } from '../../../../components/settings/language-card';
import { ReplyLanguageCard } from '../../../../components/settings/reply-language-card';
import { SettingsFrame, TwPageHeader } from '../../../../components/settings/settings-frame';
import { TwChip } from '../../../../components/settings/tw/ui';
import { UsageMeterCard } from '../../../../components/settings/usage-meter-card';
import { Icon } from '../../../../components/ui/icon';
import { getAuthRuntime } from '../../../../server/auth';
import { getDb } from '../../../../server/db';
import { requestContext } from '../../../../server/request-context';
import { requireAppUser } from '../../../../server/require-app-user';
import { loadSettingsCounts } from '../../../../server/settings-counts';
import { loadUsageMeterView } from '../../../../server/usage-meter';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('settings'), getTranslations('shell')]);
  return { title: `${t('pageTitle')} · ${tb('brand')}` };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const REPLY_NOTICES = ['saved', 'not_found', 'invalid_language', 'unavailable'] as const;
const replyNoticeOf = (value: string | string[] | undefined) =>
  REPLY_NOTICES.find((notice) => notice === value) ?? null;

/**
 * Cài đặt (FR-001, FR-119; Stitch `settings-security`): 2FA + phiên đăng nhập CỦA CHÍNH người dùng + ngôn ngữ.
 * Mọi vai trò vào được (không có dữ liệu workspace nào ở đây). Nằm trong `(guarded)` nên có khung ứng dụng; Owner/Admin
 * chưa bật 2FA bị cổng chuyển sang `/app/security` (trang ngoài khung) để bật trước.
 */
export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, workspace } = await requireAppUser({});
  const query = await searchParams;
  // Ngôn ngữ trả lời theo kênh (FR-120): chỉ Owner thấy và đổi được; Staff không có thẻ này.
  const channels =
    workspace.role === 'owner'
      ? await getDb().withActor(workspace.id, user.id, (tx) => listChannels(tx, workspace.id))
      : null;
  // Đồng hồ lượt AI (FR-090): chỉ Owner (liên quan gói cước), chỉ đọc.
  const usage = workspace.role === 'owner' ? await loadUsageMeterView(workspace.id) : null;
  const overview = await getAuthRuntime().twoFactor.overview((await requestContext()).headers);
  if (!overview) redirect('/login');
  const t = await getTranslations('settings');
  const counts = await loadSettingsCounts({
    role: workspace.role,
    workspaceId: workspace.id,
    userId: user.id,
  });
  return (
    <main>
      <SettingsFrame
        viewerRole={workspace.role}
        active="security"
        counts={counts}
        header={
          <TwPageHeader
            title={t('title')}
            subtitle={t('subtitle')}
            end={
              <TwChip tone={overview.twoFactorEnabled ? 'ok' : 'warn'} dot className="px-3 py-1.5">
                {t(overview.twoFactorEnabled ? 'securityStatus.on' : 'securityStatus.off')}
              </TwChip>
            }
          />
        }
        sideNote={
          <div className="bg-surface-container-low rounded-xl p-space-md shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <Icon name="verified" size={16} />
              <span className="font-title-sm text-title-sm">{t('securityNote.title')}</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {t('securityNote.body')}
            </p>
          </div>
        }
      >
        <TwoFactorCard enabled={overview.twoFactorEnabled} required={overview.required} />
        <AccountCard
          name={user.name}
          email={user.email}
          emailVerified={user.emailVerified}
          memberRole={workspace.role}
        >
          <ChangePasswordCard />
        </AccountCard>
        <SessionsCard sessions={overview.sessions} />
        {usage ? <UsageMeterCard view={usage} /> : null}
        <LanguageCard />
        {channels ? (
          <ReplyLanguageCard channels={channels} notice={replyNoticeOf(query.rl)} />
        ) : null}
      </SettingsFrame>
    </main>
  );
}
