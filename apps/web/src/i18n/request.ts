import { LOCALE_COOKIE, resolveLocale } from '@flow/shared';
import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { getMessages } from './messages';

export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  return { locale, messages: getMessages(locale) };
});
