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
import { LOCALES, type Locale, translator } from '../support/i18n';
import { createMailpit } from '../support/mailpit';

/**
 * Cài đặt › Thành viên & Phân quyền (feat-wire-settings-members), vi + en: mời, thu hồi, mời lại (token mới), nhận lời mời,
 * đổi vai trò, tạm khóa/mở khóa, gỡ, Owner cuối cùng không rời được, bảng quyền lấy từ code (không còn nút/mục bịa).
 */
for (const locale of LOCALES) {
  test.describe(`thành viên & phân quyền [${locale}]`, () => {
    test.describe.configure({ mode: 'serial' });
    runScenarios(locale);
  });
}

const INVITE_LINK = /\/invite\/[A-Za-z0-9_-]{43}$/;

/** Chụp ảnh đối chiếu giao diện (chỉ khi đặt `E2E_SHOT_DIR`) ở 1440px và 390px. */
async function shots(page: Page, name: string) {
  const dir = process.env.E2E_SHOT_DIR;
  if (!dir) return;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `${dir}/${name}-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
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
  const staff = newTestUser(tag, 'staff');
  const pendingEmail = `e2e-pending-${tag}@example.test`;
  const workspaceName = `E2E Mem ${tag} ${locale}`;
  let ownerState: Awaited<ReturnType<BrowserContext['storageState']>>;

  async function openMembers(browser: Parameters<typeof newLocalizedContext>[0]) {
    const context = await newLocalizedContext(browser, baseURL, locale, ownerState);
    const page = await context.newPage();
    await page.goto('/app/members');
    await expect(page.getByRole('heading', { name: t('members.list.title') })).toBeVisible();
    return { context, page };
  }
  const memberRow = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name });
  /** Hàng của thành viên KHÁC owner (khi tạm khóa, tên/email bị ẩn nên không lọc theo tên staff được). */
  const staffRow = (page: Page) =>
    page
      .getByRole('table')
      .first()
      .getByRole('row')
      .filter({ has: page.locator('td') })
      .filter({ hasNotText: owner.name });
  const pendingItem = (page: Page, email: string) =>
    page.getByRole('listitem').filter({ hasText: email });
  const invite = async (page: Page, email: string) => {
    await page.getByLabel(t('members.invite.email'), { exact: true }).fill(email);
    await page.getByRole('button', { name: t('members.invite.submit'), exact: true }).click();
    await expect(page.getByText(t('members.invite.sent'))).toBeVisible();
  };

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

  test('bảng quyền lấy từ code, không còn nút giả hay mục bịa', async ({ browser }) => {
    const { context, page } = await openMembers(browser);
    try {
      const main = page.locator('main');
      // Hàng của "Thành viên" chỉ Owner: ô Owner có quyền, ô Staff không (đọc từ chữ ẩn cho trình đọc màn hình).
      const row = page.getByRole('row').filter({
        has: page.getByRole('cell', { name: t('shell.nav.members'), exact: true }),
      });
      await expect(row.getByText(t('members.matrix.allowed'), { exact: true })).toHaveCount(1);
      await expect(row.getByText(t('members.matrix.denied'), { exact: true })).toHaveCount(1);
      // Nội dung bịa của bản Stitch không được xuất hiện.
      for (const fake of ['VietQR', 'SOC2', 'Black Friday']) {
        expect(await main.textContent()).not.toContain(fake);
      }
      expect(await main.textContent()).not.toMatch(/Sắp có|Coming soon/);
      await shots(page, `${locale}-thanh-vien`);
    } finally {
      await context.close();
    }
  });

  let firstLink = '';
  test('mời Staff: thư mời, nhận lời mời, Owner thấy Staff đang hoạt động', async ({ browser }) => {
    const { context: ownerContext, page: ownerPage } = await openMembers(browser);
    const staffContext = await newLocalizedContext(browser, baseURL, locale);
    try {
      await invite(ownerPage, staff.email);
      await expect(pendingItem(ownerPage, staff.email)).toBeVisible();
      const url = await mailpit.waitForLink(staff.email, INVITE_LINK);

      const staffPage = await staffContext.newPage();
      await staffPage.goto(url);
      await staffPage.getByRole('link', { name: t('invite.card.register'), exact: true }).click();
      await register(staffPage, t, staff);
      await verifyEmail(staffPage, t, mailpit, staff);
      await signIn(staffPage, t, staff);
      await staffPage.getByRole('button', { name: t('invite.card.accept'), exact: true }).click();
      await expectInWorkspace(staffPage, t, staff, workspaceName);
      expect(url).toMatch(INVITE_LINK);

      await ownerPage.reload();
      const row = staffRow(ownerPage);
      await expect(row).toBeVisible();
      await expect(row.getByText(t('members.roles.staff'), { exact: true })).toBeVisible();
      await expect(row.getByText(t('members.status.active'), { exact: true })).toBeVisible();
    } finally {
      await ownerContext.close();
      await staffContext.close();
    }
  });

  test('lời mời chờ: mời lại cho link mới, thu hồi', async ({ browser }) => {
    const { context, page } = await openMembers(browser);
    try {
      await invite(page, pendingEmail);
      firstLink = await mailpit.waitForLink(pendingEmail, INVITE_LINK);
      const item = pendingItem(page, pendingEmail);
      await expect(item.getByText(t('members.pending.waiting'), { exact: true })).toBeVisible();

      await item.getByRole('button', { name: t('members.pending.resend'), exact: true }).click();
      await expect
        .poll(async () => mailpit.waitForLink(pendingEmail, INVITE_LINK), { timeout: 30_000 })
        .not.toBe(firstLink);

      await page.reload();
      await pendingItem(page, pendingEmail)
        .getByRole('button', { name: t('members.pending.revoke'), exact: true })
        .click();
      await expect(pendingItem(page, pendingEmail)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('đổi vai trò Staff → Owner → Staff', async ({ browser }) => {
    const { context, page } = await openMembers(browser);
    try {
      const row = () => staffRow(page);
      await row()
        .getByRole('button', { name: t('members.actions.makeOwner'), exact: true })
        .click();
      await expect(row().getByText(t('members.roles.owner'), { exact: true })).toBeVisible();
      await row()
        .getByRole('button', { name: t('members.actions.makeStaff'), exact: true })
        .click();
      await expect(row().getByText(t('members.roles.staff'), { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('tạm khóa rồi mở khóa', async ({ browser }) => {
    const { context, page } = await openMembers(browser);
    try {
      const row = () => staffRow(page);
      await row()
        .getByRole('button', { name: t('members.actions.suspend'), exact: true })
        .click();
      await expect(row().getByText(t('members.status.suspended'), { exact: true })).toBeVisible();
      await row()
        .getByRole('button', { name: t('members.actions.restore'), exact: true })
        .click();
      await expect(row().getByText(t('members.status.active'), { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('Owner cuối cùng không rời được; hàng của chính mình khóa, có lối Rời workspace', async ({
    browser,
  }) => {
    const { context, page } = await openMembers(browser);
    try {
      const self = memberRow(page, owner.name);
      await expect(self.getByText(t('members.list.locked'), { exact: true })).toBeVisible();
      await expect(self.getByRole('button')).toHaveCount(0);
      await self.getByRole('link', { name: t('members.list.leave'), exact: true }).click();
      await expect(page).toHaveURL(/\/app\/leave$/);
      await expect(page.getByText(t('leave.lastOwner'))).toBeVisible();
      await expect(page.getByRole('button', { name: t('leave.confirm'), exact: true })).toHaveCount(
        0,
      );
    } finally {
      await context.close();
    }
  });

  test('gỡ khỏi workspace (xác nhận hai bước): Staff mất quyền, biến khỏi danh sách', async ({
    browser,
  }) => {
    const { context, page } = await openMembers(browser);
    try {
      const row = staffRow(page);
      await row.getByText(t('members.actions.remove'), { exact: true }).click();
      await row
        .getByRole('button', { name: t('members.actions.removeConfirm'), exact: true })
        .click();
      await expect(staffRow(page)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
