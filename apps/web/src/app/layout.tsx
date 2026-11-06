import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import '../components/ui/ui.css';
import '../styles/globals.css';
import '../components/auth/auth-shell.css';
import '../components/auth/auth-status.css';
import '../components/auth/auth-demo-card.css';
import '../components/auth/auth-social.css';
import '../styles/frames.css';
import '../styles/leads.css';
import '../styles/reports.css';
import '../styles/activity.css';
import '../styles/automation.css';
import '../styles/spam-rules.css';
import '../styles/reports-legal.css';
import '../styles/settings-pages.css';
import '../styles/messages.css';
import '../styles/tailwind.css';
import '../styles/theme-dark.css';
import { parseThemeChoice, THEME_COOKIE, THEME_INIT_SCRIPT, themeAttrFor } from '../lib/theme';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, cookieStore] = await Promise.all([getLocale(), cookies()]);
  const theme = themeAttrFor(parseThemeChoice(cookieStore.get(THEME_COOKIE)?.value));
  return (
    // `data-theme` được script trong <head> đặt lại trước khi vẽ (chế độ "theo hệ thống") nên cần bỏ qua cảnh báo hydrate.
    <html lang={locale} data-theme={theme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
