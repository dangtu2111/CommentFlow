import { type BrowserContext, expect, test } from '@playwright/test';
import { newTestUser, requireEnv, runTag } from '../support/env';
import {
  createWorkspace,
  enableTwoFactor,
  newLocalizedContext,
  register,
  signIn,
  signInWithTotp,
  verifyEmail,
} from '../support/flows';
import { LOCALES, type Locale, translator } from '../support/i18n';
import { createMailpit } from '../support/mailpit';

/**
 * Cài đặt › Tài khoản & Bảo mật (feat-wire-settings-security), vi + en, tài khoản test riêng của mỗi lần chạy:
 *  (1) Owner bật 2FA; (2) đăng nhập thiết bị thứ hai → Cài đặt liệt kê 2 phiên, thu hồi phiên kia → thiết bị đó bị đẩy ra;
 *  (3) đổi mật khẩu: sai mật khẩu hiện tại bị từ chối, đúng → màn thành công, email báo, mọi phiên bị xóa.
 */
for (const locale of LOCALES) {
  test.describe(`cài đặt bảo mật [${locale}]`, () => {
    test.describe.configure({ mode: 'serial' });
    runScenarios(locale);
  });
}

function runScenarios(locale: Locale) {
  const t = translator(locale);
  const sec = (key: string) => t(`auth.security.${key}`);
  let baseURL = '';
  let mailpit: ReturnType<typeof createMailpit>;
  test.beforeAll(() => {
    baseURL = requireEnv('E2E_BASE_URL');
    mailpit = createMailpit({ baseUrl: requireEnv('MAILPIT_URL') });
  });
  const tag = runTag();
  const owner = newTestUser(tag, 'owner');
  const workspaceName = `E2E Sec ${tag} ${locale}`;
  let ownerState: Awaited<ReturnType<BrowserContext['storageState']>>;
  let totpSecret = '';

  test('Owner: đăng ký, workspace, bật 2FA', async ({ browser }) => {
    const context = await newLocalizedContext(browser, baseURL, locale);
    try {
      const page = await context.newPage();
      await register(page, t, owner);
      await verifyEmail(page, t, mailpit, owner);
      await signIn(page, t, owner);
      // Chờ đăng nhập xong (màn tạo workspace) trước khi điều hướng đi — tránh hủy giữa chừng yêu cầu đăng nhập.
      await expect(
        page.getByRole('heading', { name: t('workspace.create.title'), level: 1 }),
      ).toBeVisible();
      await createWorkspace(page, t, workspaceName);
      await expect(page).toHaveURL(/\/app\/security$/);
      totpSecret = await enableTwoFactor(page, t, owner);
      ownerState = await context.storageState();
    } finally {
      await context.close();
    }
  });

  test('phiên thật: thiết bị thứ hai xuất hiện, thu hồi thì thiết bị đó bị đăng xuất', async ({
    browser,
  }) => {
    const first = await newLocalizedContext(browser, baseURL, locale, ownerState);
    const second = await newLocalizedContext(browser, baseURL, locale);
    try {
      const page2 = await second.newPage();
      await signInWithTotp(page2, t, owner, totpSecret);
      await page2.goto('/app/settings');
      await expect(page2.getByText(sec('sessions.current'), { exact: true })).toBeVisible();

      const page1 = await first.newPage();
      await page1.goto('/app/settings');
      const revoke = page1.getByRole('button', { name: sec('sessions.revoke'), exact: true });
      await expect(revoke).toHaveCount(1); // đúng một phiên khác ngoài phiên hiện tại
      await revoke.click();
      await expect(revoke).toHaveCount(0);

      await page2.goto('/app/settings');
      await expect(page2).toHaveURL(/\/login/);
    } finally {
      await first.close();
      await second.close();
    }
  });

  test('đổi mật khẩu: sai mật khẩu hiện tại bị từ chối; đúng → màn thành công + email + mọi phiên bị xóa', async ({
    browser,
  }) => {
    const context = await newLocalizedContext(browser, baseURL, locale, ownerState);
    try {
      const page = await context.newPage();
      await page.goto('/app/settings');
      // Nút mở (ở thẻ) trùng tên với nút gửi trong hộp thoại → chỉ lấy nút có aria-haspopup="dialog",
      // và chỉ bấm khi hộp thoại đang đóng (sau lần sai mật khẩu nó vẫn mở).
      const open = page
        .getByRole('button', { name: sec('changePassword.open'), exact: true })
        .and(page.locator('[aria-haspopup="dialog"]'));
      const dialog = page.locator('#change-password-dialog');
      const fill = async (current: string, next: string) => {
        if (!(await dialog.evaluate((d: HTMLDialogElement) => d.open))) await open.click();
        await expect(dialog).toBeVisible();
        await dialog.getByLabel(sec('changePassword.currentLabel'), { exact: true }).fill(current);
        await dialog.getByLabel(sec('changePassword.newLabel'), { exact: true }).fill(next);
        await dialog.getByLabel(sec('changePassword.confirmLabel'), { exact: true }).fill(next);
        await dialog
          .getByRole('button', { name: sec('changePassword.submit'), exact: true })
          .click();
      };
      const newPassword = `${owner.password}-moi`;

      await fill(`${owner.password}-sai`, newPassword);
      await expect(dialog.getByText(t('auth.errors.wrongPassword'))).toBeVisible();

      await fill(owner.password, newPassword);
      await expect(page).toHaveURL(/\/password-changed$/);
      await expect(
        page.getByRole('heading', { name: t('auth.passwordChanged.title'), level: 1 }),
      ).toBeVisible();

      // Email báo đổi mật khẩu có liên kết đặt lại (không chứa mật khẩu).
      const link = await mailpit.waitForLink(owner.email, /\/forgot-password/);
      expect(link).not.toContain(newPassword);

      // Mọi phiên (kể cả phiên vừa dùng) đã bị xóa.
      await page.goto('/app/settings');
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await context.close();
    }
  });
}
