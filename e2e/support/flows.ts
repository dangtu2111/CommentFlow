import { type Browser, type BrowserContext, expect, type Page } from '@playwright/test';
import type { TestUser } from './env';
import { LOCALE_COOKIE, type Locale, type Translate } from './i18n';
import type { createMailpit } from './mailpit';
import { secretFromUri, totp } from './totp';

export type Mailpit = ReturnType<typeof createMailpit>;

const exact = { exact: true } as const;

/** Ngữ cảnh trình duyệt mới đã đặt ngôn ngữ (cookie `NEXT_LOCALE` + Accept-Language) để mọi trang ra đúng locale. */
export async function newLocalizedContext(
  browser: Browser,
  baseURL: string,
  locale: Locale,
  storageState?: Awaited<ReturnType<BrowserContext['storageState']>>,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL,
    locale: locale === 'vi' ? 'vi-VN' : 'en-US',
    ...(storageState ? { storageState } : {}),
  });
  await context.addCookies([{ name: LOCALE_COOKIE, value: locale, url: baseURL }]);
  return context;
}

/** Đăng ký rồi dừng ở màn "Kiểm tra email". */
export async function register(page: Page, t: Translate, user: TestUser): Promise<void> {
  await page.goto('/register');
  await page.getByLabel(t('auth.fields.name'), exact).fill(user.name);
  await page.getByLabel(t('auth.fields.email'), exact).fill(user.email);
  await page.getByLabel(t('auth.fields.password'), exact).fill(user.password);
  await page.getByRole('button', { name: t('auth.register.submit'), ...exact }).click();
  await expect(
    page.getByRole('heading', { name: t('auth.checkEmail.title'), level: 1 }),
  ).toBeVisible();
}

/** Đọc thư xác minh từ Mailpit và mở liên kết trong thư. */
export async function verifyEmail(
  page: Page,
  t: Translate,
  mailpit: Mailpit,
  user: TestUser,
): Promise<void> {
  const link = await mailpit.waitForLink(user.email, /\/verify-email/);
  await page.goto(link);
  await expect(
    page.getByRole('heading', { name: t('auth.verify.successTitle'), level: 1 }),
  ).toBeVisible();
}

export async function signIn(page: Page, t: Translate, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(t('auth.fields.email'), exact).fill(user.email);
  await page.getByLabel(t('auth.fields.password'), exact).fill(user.password);
  await page.getByRole('button', { name: t('auth.login.submit'), ...exact }).click();
}

/** Tạo workspace ở màn tạo workspace (múi giờ/ngôn ngữ mặc định). Sau đó web tự chuyển đi tiếp. */
export async function createWorkspace(page: Page, t: Translate, name: string): Promise<void> {
  await page.goto('/app/onboarding/workspace');
  await page.getByLabel(t('workspace.create.name'), exact).fill(name);
  await page.getByRole('button', { name: t('workspace.create.submit'), ...exact }).click();
}

/** Chờ cho mã TOTP không sắp hết hạn (tránh nộp đúng lúc cửa sổ 30 giây đổi). */
async function freshCode(secret: string): Promise<string> {
  const left = 30_000 - (Date.now() % 30_000);
  if (left < 4000) await new Promise((resolve) => setTimeout(resolve, left + 500));
  return totp(secret);
}

/**
 * Ở trang /app/security: bật 2FA bằng mật khẩu → khóa nhập tay hiển thị → mã TOTP tính tại chỗ → lưu mã dự phòng.
 * (Khóa hiển thị dạng base32; chấp nhận cả khi web hiển thị URI otpauth.)
 */
export async function enableTwoFactor(page: Page, t: Translate, user: TestUser): Promise<void> {
  const tf = (key: string) => t(`auth.security.twoFactor.${key}`);
  await page.getByLabel(tf('passwordLabel'), exact).fill(user.password);
  await page.getByRole('button', { name: tf('start'), ...exact }).click();

  const keyLine = page.locator('p', { hasText: tf('manualKey') }).locator('code');
  await expect(keyLine).toBeVisible();
  const shown = ((await keyLine.textContent()) ?? '').trim();
  const secret = shown.startsWith('otpauth://') ? secretFromUri(shown) : shown.replace(/\s+/g, '');

  await page.getByLabel(tf('confirmLabel'), exact).fill(await freshCode(secret));
  await page.getByRole('button', { name: tf('confirm'), ...exact }).click();

  await expect(page.getByRole('heading', { name: tf('backupTitle') })).toBeVisible();
  await page.getByRole('button', { name: tf('saved'), ...exact }).click();
  // Sau "Đã lưu": mã dự phòng biến mất và màn quản lý (có mục tạo lại mã) hiện ra.
  await expect(page.getByRole('heading', { name: tf('backupTitle') })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: tf('regenTitle') })).toBeVisible();
  await expect(page.getByText(tf('statusOn'), exact)).toBeVisible();
}

/** Dòng chào + tên workspace của trang /app (bằng chứng đã vào được workspace đó). */
export async function expectInWorkspace(
  page: Page,
  t: Translate,
  user: TestUser,
  workspace: string,
): Promise<void> {
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole('heading', { name: t('auth.app.greeting', { name: user.name }), level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(t('auth.app.body', { workspace }))).toBeVisible();
}
