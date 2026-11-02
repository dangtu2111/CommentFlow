import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '../components/locale-switcher';

export default async function HomePage() {
  const t = await getTranslations('home');
  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      <LocaleSwitcher />
    </main>
  );
}
