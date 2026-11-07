'use server';

import { redirect } from 'next/navigation';
import { actionAllowed } from '../../../../server/action-guard';
import { requireAppUser } from '../../../../server/require-app-user';
import { shopifyConnect } from '../../../../server/shopify-runtime';

/**
 * Kết nối Shopify (SHOPIFY-CONNECT-STORE) — chỉ Owner (Staff nhận 404 ở `requireAppUser`, gọi đầu MỖI action; DB cũng ép
 * Owner). Workspace và người dùng lấy từ phiên, KHÔNG từ form. Client secret chỉ đi từ form → mã hóa → DB, không bao
 * giờ quay lại trình duyệt. Mọi kết thúc chuyển hướng về `/app/kb` kèm mã `sh`.
 */
export type ShopifyNotice =
  | 'connected'
  | 'invalid'
  | 'not_configured'
  | 'forbidden'
  | 'unavailable'
  | 'sync_queued'
  | 'sync_recent'
  | 'disconnected'
  | 'not_found'
  | 'rate_limited';

const BACK = '/app/kb';

const field = (data: FormData, key: string): string => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};

export async function connectShopifyAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const who = { userId: user.id, workspaceId: workspace.id };
  if (!(await actionAllowed('uiSensitive', who))) redirect(`${BACK}?sh=rate_limited`);
  const result = await shopifyConnect().connect(
    { workspaceId: workspace.id, userId: user.id },
    field(data, 'domain'),
    field(data, 'clientId'),
    field(data, 'clientSecret'),
  );
  redirect(`${BACK}?sh=${result === 'ok' ? 'connected' : result}`);
}

export async function syncShopifyAction(): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  // Đồng bộ là thao tác NẶNG qua worker: chặn bấm đúp/dồn ở đây VÀ giữ thời gian chờ nguyên tử ở DB (lớp thứ hai).
  if (!(await actionAllowed('uiHeavy', { userId: user.id, workspaceId: workspace.id }))) {
    redirect(`${BACK}?sh=rate_limited`);
  }
  const result = await shopifyConnect().sync({ workspaceId: workspace.id, userId: user.id });
  redirect(
    `${BACK}?sh=${result === 'queued' ? 'sync_queued' : result === 'recent' ? 'sync_recent' : result}`,
  );
}

export async function disconnectShopifyAction(): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  if (!(await actionAllowed('uiSensitive', { userId: user.id, workspaceId: workspace.id }))) {
    redirect(`${BACK}?sh=rate_limited`);
  }
  const result = await shopifyConnect().disconnect({
    workspaceId: workspace.id,
    userId: user.id,
  });
  redirect(`${BACK}?sh=${result === 'ok' ? 'disconnected' : result}`);
}
