import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
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
import '../components/kb/kb.css';
import '../components/posts/posts.css';
import '../styles/leads.css';
import '../styles/reports.css';
import '../styles/activity.css';
import '../styles/automation.css';
import '../styles/spam-rules.css';
import '../styles/reports-legal.css';
import '../styles/settings-pages.css';
import '../styles/messages.css';
import '../styles/inbox.css';
import '../styles/inbox-parts.css';
import '../styles/tailwind.css';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
