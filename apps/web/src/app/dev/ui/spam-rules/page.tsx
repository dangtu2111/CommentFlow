import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { parseSpamView, SpamRulesView } from '../../../../components/spam-rules/spam-rules-view';
import { Notice } from '../../../../components/ui/tw-form';
import { TwPage } from '../../../../components/ui/tw-parts';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Xem giao diện Quy tắc spam (design/stitch/spam-rules.html) với DỮ LIỆU MẪU `[MẪU]` — CHỈ khi
 * `NODE_ENV !== 'production'` (UI-first 06/11/2026). Dùng đúng `SpamRulesView` như trang thật; `?view=logs` là
 * khung nhìn "Bình luận đã bị ẩn". Không có phiên Owner nên Lưu/Xem trước ở đây không có hiệu lực.
 */
export default async function DevSpamRulesPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const [t, params] = await Promise.all([getTranslations('spamRules'), searchParams]);
  return (
    <TwPage>
      <SpamRulesView
        view={parseSpamView(params.view)}
        sample
        basePath="/dev/ui/spam-rules"
        notices={<Notice tone="info">{t('sampleBanner')}</Notice>}
      />
    </TwPage>
  );
}
