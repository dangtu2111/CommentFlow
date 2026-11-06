import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { newTestUser, requireEnv, runTag } from '../support/env';
import {
  createWorkspace,
  enableTwoFactor,
  expectInWorkspace,
  newLocalizedContext,
  register,
  signIn,
  verifyEmail,
} from '../support/flows';
import { LOCALES, type Locale, type Translate, translator } from '../support/i18n';
import { createMailpit } from '../support/mailpit';

/**
 * Kịch bản cổng 0 (docs/16 §3 GĐ0, UF-1) ở cả tiếng Việt và tiếng Anh. Mỗi ngôn ngữ chạy tuần tự trên cùng một
 * Owner: (1) Owner đăng ký → xác minh → workspace → 2FA; (2) mời Staff và Staff nhận lời mời; (3) chuyển workspace
 * và lời mời lạ. Email ngẫu nhiên mỗi lần chạy nên chạy lại không đụng dữ liệu cũ. Nhãn lấy từ vi.json/en.json.
 */
for (const locale of LOCALES) {
  test.describe(`cổng 0 [${locale}]`, () => {
    test.describe.configure({ mode: 'serial' });
    runScenarios(locale);
  });
}

function runScenarios(locale: Locale) {
  const t = translator(locale);
  // Biến môi trường đọc khi chạy ca (không phải lúc liệt kê ca bằng --list).
  let baseURL = '';
  let mailpit: ReturnType<typeof createMailpit>;
  test.beforeAll(() => {
    baseURL = requireEnv('E2E_BASE_URL');
    mailpit = createMailpit({ baseUrl: requireEnv('MAILPIT_URL') });
  });
  const tag = runTag();
  const owner = newTestUser(tag, 'owner');
  const staff = newTestUser(tag, 'staff');
  const workspaceName = `E2E Shop ${tag} ${locale}`;
  const secondWorkspaceName = `E2E Shop 2 ${tag} ${locale}`;

  let ownerState: Awaited<ReturnType<BrowserContext['storageState']>>;
  let inviteUrl = '';

  test('Owner: đăng ký, xác minh email, tạo workspace, bật 2FA', async ({ browser }) => {
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

      // Owner chưa bật 2FA bị cổng chuyển tới /app/security (có biểu ngữ bắt buộc).
      await expect(page).toHaveURL(/\/app\/security$/);
      await expect(page.getByText(t('auth.security.requiredBanner'))).toBeVisible();
      await enableTwoFactor(page, t, owner);

      await page.goto('/app');
      await expectInWorkspace(page, t, owner, workspaceName);
      ownerState = await context.storageState();
    } finally {
      await context.close();
    }
  });

  test('mời Staff: thư mời, nhận lời mời trong ngữ cảnh riêng, Staff không thấy Thành viên', async ({
    browser,
  }) => {
    const ownerContext = await newLocalizedContext(browser, baseURL, locale, ownerState);
    const staffContext = await newLocalizedContext(browser, baseURL, locale);
    try {
      const ownerPage = await ownerContext.newPage();
      await ownerPage.goto('/app/members');
      await ownerPage.getByLabel(t('members.invite.email'), { exact: true }).fill(staff.email);
      await ownerPage
        .getByRole('button', { name: t('members.invite.submit'), exact: true })
        .click();
      await expect(ownerPage.getByText(t('members.invite.sent'))).toBeVisible();

      inviteUrl = await mailpit.waitForLink(staff.email, /\/invite\/[A-Za-z0-9_-]{43}$/);

      // Staff (chưa có tài khoản): mở link → đăng ký → xác minh → đăng nhập → quay lại nhận lời mời.
      const staffPage = await staffContext.newPage();
      await staffPage.goto(inviteUrl);
      await expect(
        staffPage.getByRole('heading', {
          name: t('invite.card.title', { workspace: workspaceName }),
          level: 1,
        }),
      ).toBeVisible();
      await staffPage.getByRole('link', { name: t('invite.card.register'), exact: true }).click();
      await expect(staffPage).toHaveURL(/\/register$/);
      await register(staffPage, t, staff);
      await verifyEmail(staffPage, t, mailpit, staff);
      await signIn(staffPage, t, staff);

      await expect(
        staffPage.getByRole('heading', {
          name: t('invite.card.title', { workspace: workspaceName }),
          level: 1,
        }),
      ).toBeVisible();
      await staffPage.getByRole('button', { name: t('invite.card.accept'), exact: true }).click();
      await expectInWorkspace(staffPage, t, staff, workspaceName);

      // Staff không thấy mục Thành viên và vào thẳng /app/members nhận 404 (docs/13 §3.1).
      await expect(
        staffPage.getByRole('link', { name: t('shell.nav.members'), exact: true }),
      ).toHaveCount(0);
      const response = await staffPage.goto('/app/members');
      expect(response?.status()).toBe(404);
      await expect(
        staffPage.getByRole('heading', { name: t('members.title'), level: 1 }),
      ).toHaveCount(0);

      // Owner thấy Staff trong danh sách thành viên.
      await ownerPage.goto('/app/members');
      await expect(ownerPage.getByText(staff.email, { exact: true })).toBeVisible();
    } finally {
      await ownerContext.close();
      await staffContext.close();
    }
  });

  test('chuyển workspace và cô lập: tên đúng khi chuyển, lời mời lạ giống lời mời đã dùng', async ({
    browser,
  }) => {
    const ownerContext = await newLocalizedContext(browser, baseURL, locale, ownerState);
    const anonymous = await newLocalizedContext(browser, baseURL, locale);
    try {
      const page = await ownerContext.newPage();
      await createWorkspace(page, t, secondWorkspaceName);
      // Tạo xong, người dùng vào wizard thiết lập (FR-146); bài này tiếp tục từ trang chủ /app.
      await expect(page).toHaveURL(/\/app\/onboarding\/setup/);
      await page.goto('/app');
      await expectInWorkspace(page, t, owner, secondWorkspaceName);

      await switchTo(page, t, workspaceName);
      await expectInWorkspace(page, t, owner, workspaceName);
      await switchTo(page, t, secondWorkspaceName);
      await expectInWorkspace(page, t, owner, secondWorkspaceName);

      // Lời mời đã dùng và token lạ cho cùng một màn "không dùng được", không lộ gì thêm.
      const strangeToken = 'Z'.repeat(43);
      const used = await invalidInvitePage(anonymous, `/invite/${tokenOf(inviteUrl)}`);
      const stranger = await invalidInvitePage(anonymous, `/invite/${strangeToken}`);
      expect(stranger).toBe(used);
      expect(stranger).toContain(t('invite.invalid.body'));
    } finally {
      await ownerContext.close();
      await anonymous.close();
    }

    function tokenOf(url: string): string {
      return new URL(url).pathname.split('/').pop() ?? '';
    }

    async function invalidInvitePage(context: BrowserContext, path: string): Promise<string> {
      const view = await context.newPage();
      await view.goto(path);
      await expect(
        view.getByRole('heading', { name: t('invite.invalid.title'), level: 1 }),
      ).toBeVisible();
      const text = ((await view.locator('main').textContent()) ?? '').trim();
      await view.close();
      return text;
    }
  });
}

/** Mở bộ chuyển workspace (đầu trang) và chọn workspace theo tên. */
async function switchTo(page: Page, t: Translate, workspaceName: string): Promise<void> {
  await page.getByLabel(t('workspace.switcher.label'), { exact: true }).click();
  await page.getByRole('button', { name: new RegExp(escapeRegExp(workspaceName)) }).click();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
