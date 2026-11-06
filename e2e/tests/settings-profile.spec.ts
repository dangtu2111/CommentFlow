import { readFileSync } from 'node:fs';
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
 * Cài đặt › Tài khoản & Bảo mật, lát 1b (feat-wire-settings-profile), vi + en: chỉnh sửa thông tin (tên, múi giờ, email chỉ
 * đọc), xác minh SĐT bằng OTP (SMS MOCK: mã đọc từ hộp thư thử), chế độ Sáng/Tối/Theo hệ thống, mã dự phòng còn lại, IP phiên,
 * ảnh đại diện MOCK. Bộ chọn trong hộp thoại luôn giới hạn trong `dialog` (tránh lỗi strict-mode: nút mở trùng tên nút gửi).
 */
for (const locale of LOCALES) {
  test.describe(`hồ sơ & giao diện [${locale}]`, () => {
    test.describe.configure({ mode: 'serial' });
    runScenarios(locale);
  });
}

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Mã OTP mới nhất mà SMS MOCK đã "gửi" (tệp JSON Lines do web ghi; SĐT trong tệp đã che). */
function lastOtp(): string {
  const file = process.env.SMS_MOCK_OUTBOX_FILE;
  if (!file) throw new Error('Thiếu SMS_MOCK_OUTBOX_FILE (chạy bằng `pnpm e2e`).');
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  return (JSON.parse(lines.at(-1) ?? '{}') as { code?: string }).code ?? '';
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
  const workspaceName = `E2E Prof ${tag} ${locale}`;
  let ownerState: Awaited<ReturnType<BrowserContext['storageState']>>;

  /** Nút MỞ hộp thoại (có aria-haspopup), không phải nút gửi cùng tên bên trong hộp thoại. */
  const opener = (page: Page, name: string) =>
    page.getByRole('button', { name, exact: true }).and(page.locator('[aria-haspopup="dialog"]'));

  async function openSettings(browser: Parameters<typeof newLocalizedContext>[0]) {
    const context = await newLocalizedContext(browser, baseURL, locale, ownerState);
    const page = await context.newPage();
    await page.goto('/app/settings');
    return { context, page };
  }

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

  test('chỉnh sửa thông tin: tên bắt buộc, lưu tên + múi giờ, email chỉ đọc', async ({
    browser,
  }) => {
    const { context, page } = await openSettings(browser);
    try {
      await opener(page, t('settings.account.edit')).click();
      const dialog = page.locator('#profile-edit-dialog');
      await expect(dialog).toBeVisible();

      const email = dialog.getByLabel(t('settings.profile.emailLabel'), { exact: true });
      await expect(email).toBeDisabled();
      await expect(email).toHaveValue(owner.email);

      const name = dialog.getByLabel(t('settings.profile.nameLabel'), { exact: false });
      await name.fill('   ');
      await dialog.getByRole('button', { name: t('settings.profile.save'), exact: true }).click();
      await expect(dialog.getByText(t('settings.profile.nameRequired'))).toBeVisible();

      const newName = `Nguyễn Mai Linh ${tag}`;
      await name.fill(newName);
      await dialog
        .getByLabel(t('settings.profile.timezoneLabel'), { exact: true })
        .selectOption('Asia/Bangkok');
      await dialog.getByRole('button', { name: t('settings.profile.save'), exact: true }).click();
      await expect(dialog.getByText(t('settings.profile.saved'))).toBeVisible();

      await page.reload();
      await expect(page.getByText(newName, { exact: true }).first()).toBeVisible();
      await opener(page, t('settings.account.edit')).click();
      await expect(
        page
          .locator('#profile-edit-dialog')
          .getByLabel(t('settings.profile.timezoneLabel'), { exact: true }),
      ).toHaveValue('Asia/Bangkok');
    } finally {
      await context.close();
    }
  });

  test('ảnh đại diện (MOCK): PNG hợp lệ lưu được; tệp sai loại bị từ chối', async ({ browser }) => {
    const { context, page } = await openSettings(browser);
    try {
      await opener(page, t('settings.account.edit')).click();
      const dialog = page.locator('#profile-edit-dialog');
      const input = dialog.locator('input[type="file"][name="avatar"]');
      await input.setInputFiles({
        name: 'a.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('xin chào'),
      });
      await expect(dialog.getByText(t('settings.profile.avatarErrors.type'))).toBeVisible();
      await input.setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG_1PX });
      await expect(dialog.getByText(t('settings.profile.avatarSaved'))).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('xác minh SĐT bằng OTP: sai số bị từ chối, mã sai rồi mã đúng, SĐT hiện che giữa', async ({
    browser,
  }) => {
    const { context, page } = await openSettings(browser);
    try {
      await opener(page, t('settings.account.verifyPhone')).click();
      const dialog = page.locator('#phone-verify-dialog');
      await expect(dialog).toBeVisible();

      const phone = dialog.getByLabel(t('settings.phone.numberLabel'), { exact: false });
      const send = dialog.getByRole('button', { name: t('settings.phone.send'), exact: true });
      await phone.fill('12345');
      await send.click();
      await expect(dialog.getByText(t('settings.phone.errors.invalid_phone'))).toBeVisible();

      await phone.fill('0912 345 678');
      await send.click();
      // Bước 2: SĐT đã che, 6 ô OTP, đếm ngược gửi lại.
      await expect(dialog.getByTestId('phone-masked')).toHaveText('+849 ••• ••• 678');
      await expect(dialog.getByText(/^(Gửi lại sau|Resend in) \d+/)).toBeVisible();
      const boxes = dialog.locator('fieldset input');
      await expect(boxes).toHaveCount(6);

      const fillCode = async (code: string) => {
        for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i] ?? '');
        await dialog.getByRole('button', { name: t('settings.phone.verify'), exact: true }).click();
      };
      const real = lastOtp();
      const wrong = real === '000000' ? '111111' : '000000';
      await fillCode(wrong);
      await expect(dialog.getByText(t('settings.phone.errors.invalid_code'))).toBeVisible();

      await fillCode(real);
      await expect(dialog.getByText(t('settings.phone.successTitle'))).toBeVisible();
      await dialog.getByRole('button', { name: t('settings.phone.done'), exact: false }).click();
      await expect(dialog).toBeHidden();

      await page.reload();
      const shown = page.getByTestId('account-phone');
      await expect(shown).toHaveText('+849 ••• ••• 678');
      // SĐT thô không xuất hiện ở bất kỳ đâu trên trang.
      expect(await page.content()).not.toContain('912345678');
      expect(await page.content()).not.toContain('0912 345 678');
    } finally {
      await context.close();
    }
  });

  test('chế độ giao diện: Tối áp cho khung Cài đặt, giữ sau tải lại, Theo hệ thống theo trình duyệt', async ({
    browser,
  }) => {
    const { context, page } = await openSettings(browser);
    try {
      const html = page.locator('html');
      const setting = page.locator('main.app-page-settings');
      await page.getByRole('button', { name: t('settings.display.dark'), exact: false }).click();
      await expect(html).toHaveAttribute('data-theme', 'dark');
      await expect(setting).toHaveCSS('background-color', 'rgb(14, 22, 27)');

      // Tải lại: thuộc tính đã có ngay khi tài liệu được phân tích (script chống nháy), không đợi hydrate.
      await page.reload({ waitUntil: 'commit' });
      await expect(html).toHaveAttribute('data-theme', 'dark');

      await page.getByRole('button', { name: t('settings.display.light'), exact: false }).click();
      await expect(html).toHaveAttribute('data-theme', 'light');

      await page.getByRole('button', { name: t('settings.display.system'), exact: false }).click();
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.reload();
      await expect(html).toHaveAttribute('data-theme', 'dark');
      await page.emulateMedia({ colorScheme: 'light' });
      await page.reload();
      await expect(html).toHaveAttribute('data-theme', 'light');
    } finally {
      await context.close();
    }
  });

  test('mã dự phòng còn lại thật, IP phiên chỉ ở dạng che, không có chứng nhận bịa', async ({
    browser,
  }) => {
    const { context, page } = await openSettings(browser);
    try {
      await expect(
        page.getByText(t('auth.security.twoFactor.tiles.codesValue', { remaining: 10, total: 10 })),
      ).toBeVisible();
      // Phiên hiện tại: IP đã che hoặc "không xác định" (máy thử không có IP tin cậy); không bao giờ IP thô.
      const ip = page.getByTestId('session-ip').first();
      await expect(ip).toBeVisible();
      await expect(ip).not.toHaveText(/\d+\.\d+\.\d+\.\d+/);
      expect(await page.locator('main').textContent()).not.toMatch(/ISO\s*27001/i);
      // Thẻ Tài khoản / Thiết bị / Hiển thị không còn mục "Sắp có" (đã nối thật).
      for (const id of ['account-title', 'sessions-title', 'language-title']) {
        const card = page.locator(`[aria-labelledby="${id}"]`);
        await expect(card).toBeVisible();
        expect(await card.textContent()).not.toContain(t('settings.account.soon'));
      }
    } finally {
      await context.close();
    }
  });
}
