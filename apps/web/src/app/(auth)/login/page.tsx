import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LoginView } from '../../../components/auth/auth-views';
import { getBrand } from '../../../server/brand';
import { getCurrentUser } from '../../../server/session';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('login.title')} · ${getBrand().name}` };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; reset?: string; loggedOut?: string }>;
}) {
  if (await getCurrentUser()) redirect('/app');
  return <LoginView params={await searchParams} />;
}
