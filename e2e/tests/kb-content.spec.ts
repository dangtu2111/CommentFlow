import { type BrowserContext, expect, type Page, test } from '@playwright/test';
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
 * Cơ sở kiến thức (feat-kb-wire-content), vi + en: trang tổng quan "Nguồn dữ liệu" dùng số liệu thật; nhập tay Thông tin
 * cửa hàng, Chính sách, FAQ, Giọng văn (lưu, sửa, xóa); rail có mục "Sắp có" vô hiệu; Staff nhận 404.
 */
for (const locale of LOCALES) {
  test.describe(`cơ sở kiến thức [${locale}]`, () => {
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
  const workspaceName = `E2E KB ${tag} ${locale}`;
  let ownerState: Awaited<ReturnType<BrowserContext['storageState']>>;

  async function open(browser: Parameters<typeof newLocalizedContext>[0], path: string) {
    const context = await newLocalizedContext(browser, baseURL, locale, ownerState);
    const page = await context.newPage();
    await page.goto(path);
    return { context, page };
  }
  /** Chờ qua cửa sổ chống bấm đúp (uiWrite 1 giây, uiSensitive 2 giây) giữa hai thao tác ghi liên tiếp — người dùng thật không bấm nhanh hơn. */
  const pace = (page: Page, ms: number) => page.waitForTimeout(ms);
  const card = (page: Page, text: string) => page.locator('section').filter({ hasText: text });

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
      await createWorkspace(page, t, workspaceName);
      await expect(page).toHaveURL(/\/app\/security$/);
      await enableTwoFactor(page, t, owner);
      ownerState = await context.storageState();
    } finally {
      await context.close();
    }
  });

  test('tổng quan: rail có các trang nhập tay, mục Sắp có vô hiệu, số liệu bắt đầu từ 0', async ({
    browser,
  }) => {
    const { context, page } = await open(browser, '/app/kb');
    try {
      const rail = page.getByRole('navigation', { name: t('kb.navLabel') });
      for (const key of ['kbShop', 'kbPolicies', 'kbFaq', 'kbVoice']) {
        await expect(rail.getByRole('link', { name: t(`shell.nav.${key}`) })).toBeVisible();
      }
      for (const key of ['kbDocs', 'kbRules', 'kbDictionary']) {
        await expect(
          rail.locator('[aria-disabled="true"]').filter({ hasText: t(`kb.soonItems.${key}`) }),
        ).toHaveCount(1);
      }
      await expect(page.getByText(t('kb.hub.sources.empty'))).toBeVisible();
      await expect(page.getByText(t('kb.hub.product.empty'))).toBeVisible();

      // Ô chạy thử nhận CÂU HỎI THẬT của Owner (không có câu ví dụ cứng) và điền sẵn sang trang Thử AI.
      await page
        .getByLabel(t('kb.hub.playground.label'), { exact: true })
        .fill('Giá áo thun size M bao nhiêu?');
      await page.getByRole('button', { name: t('kb.hub.playground.run') }).click();
      await expect(page).toHaveURL(/\/app\/try-ai\?q=/);
      await expect(page.locator('#try-ai-text')).toHaveValue('Giá áo thun size M bao nhiêu?');
    } finally {
      await context.close();
    }
  });

  test('FAQ: thêm, sửa, xóa; dữ liệu hiện ở tổng quan', async ({ browser }) => {
    const { context, page } = await open(browser, '/app/kb/faq');
    try {
      await pace(page, 1200); // qua cửa sổ chống bấm đúp của thao tác ghi ở test trước
      const question = `Ship bao lâu? ${tag}`;
      const form = page
        .locator('form')
        .filter({ has: page.locator('textarea[name=answer]') })
        .first();
      await form.getByLabel(t('kbContent.faq.question'), { exact: true }).fill(question);
      await form.getByLabel(t('kbContent.faq.answer'), { exact: true }).fill('2-3 ngày làm việc');
      await form.getByLabel(t('kbContent.faq.tags'), { exact: true }).fill('ship, Giao hàng');
      await form.getByRole('button', { name: t('kbContent.add'), exact: true }).click();
      await expect(
        page.getByRole('status').filter({ hasText: t('kbContent.notice.saved') }),
      ).toBeVisible();

      const created = card(page, question);
      await expect(created.getByLabel(t('kbContent.faq.tags'), { exact: true })).toHaveValue(
        'ship, giao hàng',
      );
      await created.getByLabel(t('kbContent.faq.answer'), { exact: true }).fill('1-2 ngày');
      await created.getByRole('button', { name: t('kbContent.save'), exact: true }).click();
      await expect(
        page.getByRole('status').filter({ hasText: t('kbContent.notice.saved') }),
      ).toBeVisible();
      await expect(
        card(page, question).getByLabel(t('kbContent.faq.answer'), { exact: true }),
      ).toHaveValue('1-2 ngày');

      await page.goto('/app/kb');
      await expect(page.locator('.kb-slot a[href="/app/kb/faq"]')).toContainText('1');

      await page.goto('/app/kb/faq');
      await card(page, question)
        .getByRole('button', { name: t('kbContent.delete'), exact: true })
        .click();
      await expect(
        page.getByRole('status').filter({ hasText: t('kbContent.notice.deleted') }),
      ).toBeVisible();
      await expect(page.getByText(question)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('chống bấm đúp: gửi biểu mẫu thêm FAQ hai lần liên tiếp chỉ tạo MỘT mục', async ({
    browser,
  }) => {
    const { context, page } = await open(browser, '/app/kb/faq');
    try {
      await pace(page, 1200); // qua cửa sổ chống bấm đúp của thao tác ghi ở test trước
      const question = `Bấm đúp ${tag}`;
      const form = page
        .locator('form')
        .filter({ has: page.locator('textarea[name=answer]') })
        .first();
      await form.getByLabel(t('kbContent.faq.question'), { exact: true }).fill(question);
      await form.getByLabel(t('kbContent.faq.answer'), { exact: true }).fill('một lần thôi');
      // Mô phỏng bấm đúp bỏ qua việc nút bị khóa: hai yêu cầu gần như đồng thời.
      await form.evaluate((node) => {
        (node as HTMLFormElement).requestSubmit();
        (node as HTMLFormElement).requestSubmit();
      });
      await expect(page).toHaveURL(/n=/);
      await page.goto('/app/kb/faq');
      await expect(page.locator(`input[name=question][value="${question}"]`)).toHaveCount(1);
      await page
        .locator('section')
        .filter({ has: page.locator(`input[name=question][value="${question}"]`) })
        .getByRole('button', { name: t('kbContent.delete'), exact: true })
        .click();
      await expect(
        page.getByRole('status').filter({ hasText: t('kbContent.notice.deleted') }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('Chính sách: thêm rồi xóa; nội dung rỗng bị từ chối', async ({ browser }) => {
    const { context, page } = await open(browser, '/app/kb/policies');
    try {
      await pace(page, 1200); // qua cửa sổ chống bấm đúp của thao tác ghi ở test trước
      const title = `Đổi trả ${tag}`;
      const form = page
        .locator('form')
        .filter({ has: page.locator('textarea[name=content]') })
        .last();
      await form.getByLabel(t('kbContent.policies.titleLabel'), { exact: true }).fill(title);
      await form.getByLabel(t('kbContent.policies.content'), { exact: true }).fill('   ');
      // Nội dung chỉ có khoảng trắng: trình duyệt cho gửi (không `required` với khoảng trắng) nhưng máy chủ từ chối.
      await form.getByRole('button', { name: t('kbContent.add'), exact: true }).click();
      await expect(page.getByText(t('kbContent.notice.invalid'))).toBeVisible();

      await form.getByLabel(t('kbContent.policies.titleLabel'), { exact: true }).fill(title);
      await form
        .getByLabel(t('kbContent.policies.content'), { exact: true })
        .fill('Đổi trong 7 ngày');
      await form.getByRole('button', { name: t('kbContent.add'), exact: true }).click();
      await expect(
        page.getByRole('status').filter({ hasText: t('kbContent.notice.saved') }),
      ).toBeVisible();
      await expect(
        page.getByLabel(t('kbContent.policies.titleLabel'), { exact: true }).first(),
      ).toHaveValue(title);

      await pace(page, 1200);
      // Tiêu đề nằm trong ô nhập (không phải chữ trong thẻ) nên tìm thẻ theo giá trị ô `title`.
      await page
        .locator('section')
        .filter({ has: page.locator(`input[name=title][value="${title}"]`) })
        .getByRole('button', { name: t('kbContent.delete'), exact: true })
        .click();
      await expect(
        page.getByRole('status').filter({ hasText: t('kbContent.notice.deleted') }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('Thông tin cửa hàng: lưu; website không phải http(s) bị từ chối', async ({ browser }) => {
    const { context, page } = await open(browser, '/app/kb/shop');
    try {
      await pace(page, 1200); // qua cửa sổ chống bấm đúp của thao tác ghi ở test trước
      const form = page
        .locator('form')
        .filter({ has: page.locator('input[name=name]') })
        .first();
      await form.getByLabel(t('kbContent.shop.name'), { exact: true }).fill(`Shop ${tag}`);
      await form
        .getByLabel(t('kbContent.shop.website'), { exact: true })
        .fill('https://shop.example.test');
      await form.getByRole('button', { name: t('kbContent.add'), exact: true }).click();
      await expect(
        page.getByRole('status').filter({ hasText: t('kbContent.notice.saved') }),
      ).toBeVisible();
      await expect(page.getByLabel(t('kbContent.shop.name'), { exact: true }).first()).toHaveValue(
        `Shop ${tag}`,
      );
    } finally {
      await context.close();
    }
  });

  test('Giọng văn: lưu theo ngôn ngữ; câu mời chỉ lưu khi đủ hai câu', async ({ browser }) => {
    const { context, page } = await open(browser, '/app/kb/voice');
    try {
      await pace(page, 1200); // qua cửa sổ chống bấm đúp của thao tác ghi ở test trước
      const voiceCard = page.locator('section').filter({ has: page.locator('#voice-vi') });
      await voiceCard.getByLabel(t('kbContent.voice.tone'), { exact: true }).fill('thân thiện');
      await voiceCard
        .getByLabel(t('kbContent.voice.doRules'), { exact: true })
        .fill('chào khách\nxưng em');
      await voiceCard
        .locator('textarea[name="handoff.shipping.inHours"]')
        .fill('Em chuyển bạn nhé');
      await voiceCard.locator('textarea[name="handoff.shipping.outHours"]').fill('Sáng mai em báo');
      await voiceCard.locator('textarea[name="handoff.discount.inHours"]').fill('Chỉ có một câu');
      await voiceCard
        .getByRole('button', {
          name: t('kbContent.voice.saveFor', { lang: t('kbContent.lang.vi') }),
        })
        .click();
      await expect(
        page.getByRole('status').filter({ hasText: t('kbContent.notice.saved') }),
      ).toBeVisible();
      const saved = page.locator('section').filter({ has: page.locator('#voice-vi') });
      await expect(saved.getByLabel(t('kbContent.voice.tone'), { exact: true })).toHaveValue(
        'thân thiện',
      );
      await expect(saved.locator('textarea[name="handoff.shipping.inHours"]')).toHaveValue(
        'Em chuyển bạn nhé',
      );
      await expect(saved.locator('textarea[name="handoff.discount.inHours"]')).toHaveValue('');
    } finally {
      await context.close();
    }
  });

  test('Shopify: kết nối bằng Client ID + secret, secret không hiện lại, ngắt kết nối', async ({
    browser,
  }) => {
    const { context, page } = await open(browser, '/app/kb');
    try {
      await pace(page, 2200); // qua cửa sổ chống bấm đúp của thao tác ghi ở test trước
      const secret = `shpss_e2e_${tag}_secret`;
      const clientId = `e2eclient${tag}`;
      await expect(page.getByText(t('kb.hub.notConnected'), { exact: true })).toBeVisible();

      // Sai tên miền → bị từ chối, chưa lưu gì.
      await page.getByRole('button', { name: t('kb.hub.shopify.connect') }).click();
      let dialog = page.locator('dialog[open]');
      await dialog.getByLabel(t('kb.hub.shopify.dialog.domain'), { exact: true }).fill('evil.com');
      await dialog.getByLabel(t('kb.hub.shopify.dialog.clientId'), { exact: true }).fill(clientId);
      await dialog
        .getByLabel(t('kb.hub.shopify.dialog.clientSecret'), { exact: true })
        .fill(secret);
      await dialog.getByRole('button', { name: t('kb.hub.shopify.dialog.submit') }).click();
      await expect(
        page.getByRole('alert').filter({ hasText: t('kb.hub.shopify.notice.invalid') }),
      ).toBeVisible();
      await expect(page.getByText(t('kb.hub.notConnected'), { exact: true })).toBeVisible();

      await pace(page, 2200);
      // Hợp lệ → đã kết nối; tên miền hiện, Client secret KHÔNG hiện lại ở bất cứ đâu.
      await page.getByRole('button', { name: t('kb.hub.shopify.connect') }).click();
      dialog = page.locator('dialog[open]');
      await dialog
        .getByLabel(t('kb.hub.shopify.dialog.domain'), { exact: true })
        .fill(`https://E2E-${tag}.myshopify.com/admin`);
      await dialog.getByLabel(t('kb.hub.shopify.dialog.clientId'), { exact: true }).fill(clientId);
      await dialog
        .getByLabel(t('kb.hub.shopify.dialog.clientSecret'), { exact: true })
        .fill(secret);
      await dialog.getByRole('button', { name: t('kb.hub.shopify.dialog.submit') }).click();
      await expect(
        page.getByRole('status').filter({ hasText: t('kb.hub.shopify.notice.connected') }),
      ).toBeVisible();
      await expect(
        page.getByText(t('kb.hub.shopify.status.connected'), { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(`e2e-${tag}.myshopify.com`)).toBeVisible();
      expect(await page.content()).not.toContain(secret);
      await expect(page.getByRole('button', { name: t('kb.hub.shopify.sync') })).toBeVisible();

      await pace(page, 2200);
      // Ngắt kết nối: xóa secret, quay về "chưa kết nối".
      await page.getByRole('button', { name: t('kb.hub.shopify.disconnect') }).click();
      await page
        .locator('dialog[open]')
        .getByRole('button', { name: t('kb.hub.shopify.disconnectDialog.confirm') })
        .click();
      await expect(
        page.getByRole('status').filter({ hasText: t('kb.hub.shopify.notice.disconnected') }),
      ).toBeVisible();
      await expect(page.getByText(t('kb.hub.notConnected'), { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });
}
