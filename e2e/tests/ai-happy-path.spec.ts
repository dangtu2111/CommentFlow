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
 * ĐƯỜNG THÀNH CÔNG của AI (gap E2E-AI-HAPPY-PATH), vi + en. Ứng dụng dùng client THẬT; CI chỉ trỏ LITELLM_BASE_URL/ML_URL sang dịch vụ giả chạy NGOÀI
 * ứng dụng (e2e/fake-services). Kết quả của dịch vụ giả là JSON cố định — KHÔNG phải số đo chất lượng (docs/testing/dich-vu-gia-ci.md).
 * Kịch bản: Owner nhập một FAQ thật → ô Thử AI ra nhãn, hành động, câu trả lời và nguồn là chính FAQ đó.
 */
for (const locale of LOCALES) {
  test.describe(`AI đường thành công [${locale}]`, () => {
    test.describe.configure({ mode: 'serial' });
    runScenarios(locale);
  });
}

function runScenarios(locale: Locale) {
  const t = translator(locale);
  let baseURL = '';
  let mailpit: ReturnType<typeof createMailpit>;
  test.beforeAll(() => {
    baseURL = requireEnv('E2E_BASE_URL');
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
      await createWorkspace(page, t, `E2E AI ${tag} ${locale}`);
      await expect(page).toHaveURL(/\/app\/security$/);
      await enableTwoFactor(page, t, owner);
      ownerState = await context.storageState();
    } finally {
      await context.close();
    }
  });

  test('nhập FAQ thật rồi Thử AI: nhãn, hành động, câu trả lời có nguồn', async ({ browser }) => {
    const context = await newLocalizedContext(browser, baseURL, locale, ownerState);
    try {
      const page = await context.newPage();
      await page.goto('/app/kb/faq');
      const question = `Ship về Hà Nội mất bao lâu ${tag}`;
      const form = page
        .locator('form')
        .filter({ has: page.locator('textarea[name=answer]') })
        .first();
      await form.getByLabel(t('kbContent.faq.question'), { exact: true }).fill(question);
      await form.getByLabel(t('kbContent.faq.answer'), { exact: true }).fill('2-3 ngày làm việc');
      await form.getByLabel(t('kbContent.faq.tags'), { exact: true }).fill('ship');
      await form.getByRole('button', { name: t('kbContent.add'), exact: true }).click();
      await expect(
        page.getByRole('status').filter({ hasText: t('kbContent.notice.saved') }),
      ).toBeVisible();

      await page.goto('/app/try-ai');
      await page.getByLabel(t('tryAi.label'), { exact: true }).fill('ship về Hà Nội mất bao lâu ạ');
      await page.getByRole('button', { name: t('tryAi.submit'), exact: true }).click();

      await expect(page.getByText(t('tryAi.result.reply'), { exact: true })).toBeVisible();
      await expect(page.getByText(t('tryAi.labels.advice'), { exact: true }).first()).toBeVisible();
      await expect(
        page.getByText(t('tryAi.actions.answer'), { exact: true }).first(),
      ).toBeVisible();
      // Câu trả lời cố định của dịch vụ LLM giả (đi qua client thật + guard của pipeline).
      await expect(page.getByText('Dạ shop gửi bạn thông tin')).toBeVisible();
      // Nguồn tìm được là chính FAQ vừa nhập.
      await expect(page.getByText(question).first()).toBeVisible();
      for (const key of ['llm_missing_service', 'llm_missing_model', 'llm_flag_off']) {
        await expect(page.getByText(t(`tryAi.errors.${key}`))).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  });
}
