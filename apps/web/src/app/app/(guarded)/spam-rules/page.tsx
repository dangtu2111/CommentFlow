import { getTranslations } from 'next-intl/server';
import { parseSpamView, SpamRulesView } from '../../../../components/spam-rules/spam-rules-view';
import { Banner } from '../../../../components/ui/banner';
import { showSampleData } from '../../../../lib/sample-data';
import { requireAppUser } from '../../../../server/require-app-user';

export async function generateMetadata() {
  const [t, tb] = await Promise.all([getTranslations('spamRules'), getTranslations('shell')]);
  return { title: `${t('title')} · ${tb('brand')}` };
}

const BASE_PATH = '/app/spam-rules';
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Quy tắc spam (FR-080, US-050, UF-4): chỉ Owner (Staff nhận 404). Tạo quy tắc + xem trước số bình luận khớp 7 ngày.
 * Danh sách quy tắc, số liệu và nhật ký ẩn chưa có dữ liệu thật: bản dev (`APP_ENV=dev`) hiện `[MẪU]`, nơi khác hiện
 * "—"/trạng thái trống + "Sắp có".
 */
export default async function SpamRulesPage({ searchParams }: { searchParams: SearchParams }) {
  const [, t, params] = await Promise.all([
    requireAppUser({ role: 'owner' }),
    getTranslations('spamRules'),
    searchParams,
  ]);
  const sample = showSampleData();
  return (
    <main className="app-page app-page-wide spam-page stack">
      <SpamRulesView
        view={parseSpamView(params.view)}
        sample={sample}
        basePath={BASE_PATH}
        notices={sample ? <Banner variant="info">{t('sampleBanner')}</Banner> : null}
      />
    </main>
  );
}
