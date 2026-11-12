'use server';

import { decideShopSuggestion } from '@flow/db/runtime';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { actionAllowed } from '../../../../server/action-guard';
import { getDb } from '../../../../server/db';
import { requestKbSync } from '../../../../server/kb-sync-request';
import { requireAppUser } from '../../../../server/require-app-user';
import type { KbNotice } from './actions';

/**
 * Áp dụng/Bỏ đề xuất thông tin shop (KB-SHOP-V2 PR5) — chỉ Owner (Staff nhận 404 ở `requireAppUser`, gọi đầu action; trigger DB cũng chặn). Workspace/người dùng lấy từ phiên,
 * không từ form; id chỉ là lựa chọn (kiểm uuid; id lạ hoặc workspace khác bị RLS giấu → `not_found`). Áp dụng đổi hồ sơ nên xếp đồng bộ kiến thức; Bỏ thì không.
 */
const BACK = '/app/kb/shop';

export async function decideShopSuggestionAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const id = z.uuid().safeParse(data.get('id'));
  if (!id.success) redirect(`${BACK}?n=not_found`);
  const decision = z.enum(['applied', 'rejected']).safeParse(data.get('decision'));
  if (!decision.success) redirect(`${BACK}?n=invalid`);
  const session = { workspaceId: workspace.id, userId: user.id };
  if (!(await actionAllowed('uiWrite', session))) redirect(`${BACK}?n=rate_limited`);
  let notice: KbNotice;
  try {
    const outcome = await getDb().withActor(session.workspaceId, session.userId, (tx) =>
      decideShopSuggestion(tx, session.workspaceId, id.data, decision.data),
    );
    notice = outcome;
    if (outcome === 'applied') await requestKbSync(session.workspaceId);
  } catch {
    console.error(JSON.stringify({ event: 'kb_shop_suggestion_failed' }));
    notice = 'unavailable';
  }
  redirect(`${BACK}?n=${notice}`);
}
