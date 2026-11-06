import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { RegisterView } from '../../../components/auth/auth-views';
import { showSampleData } from '../../../lib/sample-data';
import { getBrand } from '../../../server/brand';
import { getCurrentUser } from '../../../server/session';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('register.title')} · ${getBrand().name}` };
}

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect('/app');
  return <RegisterView sample={showSampleData()} />;
}
