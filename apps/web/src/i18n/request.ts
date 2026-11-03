import { LOCALE_COOKIE, negotiateLocale } from '@flow/shared';
import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { getMessages } from './messages';

export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = negotiateLocale(
    store.get(LOCALE_COOKIE)?.value,
    (await headers()).get('accept-language'),
  );
  return { locale, messages: getMessages(locale) };
});
