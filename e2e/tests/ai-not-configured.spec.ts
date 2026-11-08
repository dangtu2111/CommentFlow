import { type BrowserContext, expect, test } from '@playwright/test';
import { newTestUser, requireEnv, runTag } from '../support/env';
import {
  createWorkspace,
  enableTwoFactor,
  newLocalizedContext,
  register,
  signIn,
  verifyEmail,
} from '../support/flows';
import { LOCALES, type Locale, translator } from '../support/i18n';
import { createMailpit } from '../support/mailpit';

/**
 * "CHƯA CẤU HÌNH AI": bản web thứ hai (`E2E_NOAI_BASE_URL`, không có LITELLM_*) — ô Thử AI báo trung thực, KHÔNG chạy bản mẫu, KHÔNG tốn lượt thử.
 */
for (const locale of LOCALES) {
  test.describe(`AI chưa cấu hình [${locale}]`, () => {
    test.describe.configure({ mode: 'serial' });
    runScenarios(locale);
  });
}

function runScenarios(locale: Locale) {
  const t = translator(locale);
  let baseURL = '';
  let mailpit: ReturnType<typeof createMailpit>;
  test.beforeAll(() => {
    baseURL = requireEnv('E2E_NOAI_BASE_URL');
    mailpit = createMailpit({ baseUrl: requireEnv('MAILPIT_URL') });
  });
  const tag = runTag();
  const owner = newTestUser(tag, 'owner');
  let ownerState: Awaited<ReturnType<BrowserContext['storageState']>>;

  test('Owner: đăng ký, workspace, bật 2FA', async ({ browser }) => {
    const context = await newLocalizedContext(browser, baseURL, locale);
    try {
      const page = await context.newPage();
      await register(page, t, owner);
      await verifyEmail(page, t, mailpit, owner);
      await signIn(page, t, owner);
      await expect(
        page.getByRole('heading', { name: t('workspace.create.title'), level: 1 }),
      ).toBeVisible();
      await createWorkspace(page, t, `E2E NoAI ${tag} ${locale}`);
      await expect(page).toHaveURL(/\/app\/security$/);
      await enableTwoFactor(page, t, owner);
      ownerState = await context.storageState();
    } finally {
      await context.close();
    }
  });

  test('Thử AI báo "chưa cấu hình AI thật", không có kết quả mẫu', async ({ browser }) => {
    const context = await newLocalizedContext(browser, baseURL, locale, ownerState);
    try {
      const page = await context.newPage();
      await page.goto('/app/try-ai');
      await page.getByLabel(t('tryAi.label'), { exact: true }).fill('ship về Hà Nội mất bao lâu ạ');
      await page.getByRole('button', { name: t('tryAi.submit'), exact: true }).click();
      await expect(page.getByText(t('tryAi.errors.llm_missing_service'))).toBeVisible();
      await expect(page.getByText(t('tryAi.result.reply'))).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
