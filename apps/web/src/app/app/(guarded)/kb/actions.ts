'use server';

import {
  createFaqItem,
  deleteFaqItem,
  updateFaqItem,
  upsertBrandVoice,
  upsertShopProfile,
} from '@flow/db/runtime';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { formToBrandVoice, formToFaq, formToShopProfile } from '../../../../lib/kb-content-form';
import { actionAllowed } from '../../../../server/action-guard';
import { getDb } from '../../../../server/db';
import { requestKbSync } from '../../../../server/kb-sync-request';
import { requireAppUser } from '../../../../server/require-app-user';

/**
 * Nhập kiến thức tay (FR-050, FR-142) — chỉ Owner (Staff nhận 404 ở `requireAppUser`, gọi đầu MỖI action). Workspace và
 * người dùng lấy từ phiên, KHÔNG từ form; id mục từ form chỉ là lựa chọn (kiểm uuid; id lạ hoặc của workspace khác →
 * RLS giấu → `not_found`). Mọi kết thúc chuyển hướng về đúng trang kèm mã thông báo `n`
 * (saved | deleted | invalid | not_found | unavailable | rate_limited).
 */
export type KbNotice =
  | 'saved'
  | 'deleted'
  | 'invalid'
  | 'not_found'
  | 'unavailable'
  | 'rate_limited';

type Session = { workspaceId: string; userId: string };
type Tx = Parameters<Parameters<ReturnType<typeof getDb>['withActor']>[2]>[0];

const SHOP = '/app/kb/shop';
const FAQ = '/app/kb/faq';
const VOICE = '/app/kb/voice';

const idOf = (data: FormData): string | null => {
  const parsed = z.uuid().safeParse(data.get('id'));
  return parsed.success ? parsed.data : null;
};

/** Chạy một thao tác ghi trong `withActor`; mọi lỗi bất ngờ → `unavailable` (không lộ chi tiết, không log nội dung). */
async function write(
  back: string,
  session: Session,
  run: (tx: Tx) => Promise<boolean>,
  done: KbNotice = 'saved',
): Promise<never> {
  // Chống bấm đúp/spam: lần thứ hai trong cùng khoảnh khắc (hoặc quá 30 lần/phút) bị chặn, KHÔNG ghi gì.
  if (!(await actionAllowed('uiWrite', session))) redirect(`${back}?n=rate_limited`);
  let notice: KbNotice;
  try {
    const found = await getDb().withActor(session.workspaceId, session.userId, run);
    notice = found ? done : 'not_found';
    // Giọng văn không thành đoạn kiến thức → không cần đồng bộ.
    if (found && back !== VOICE) await requestKbSync(session.workspaceId);
  } catch {
    console.error(JSON.stringify({ event: 'kb_content_write_failed', page: back }));
    notice = 'unavailable';
  }
  redirect(`${back}?n=${notice}`);
}

export async function saveShopProfileAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const parsed = formToShopProfile(data);
  if (!parsed.ok) redirect(`${SHOP}?n=invalid`);
  const session = { workspaceId: workspace.id, userId: user.id };
  return write(SHOP, session, async (tx) => {
    await upsertShopProfile(tx, session.workspaceId, parsed.input);
    return true;
  });
}

export async function saveBrandVoiceAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const parsed = formToBrandVoice(data);
  if (!parsed.ok) redirect(`${VOICE}?n=invalid`);
  const session = { workspaceId: workspace.id, userId: user.id };
  return write(VOICE, session, async (tx) => {
    await upsertBrandVoice(tx, session.workspaceId, parsed.input);
    return true;
  });
}

export async function createFaqAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const parsed = formToFaq(data);
  if (!parsed.ok) redirect(`${FAQ}?n=invalid`);
  const session = { workspaceId: workspace.id, userId: user.id };
  return write(FAQ, session, async (tx) => {
    await createFaqItem(tx, session.workspaceId, parsed.input);
    return true;
  });
}

export async function updateFaqAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const id = idOf(data);
  const parsed = formToFaq(data);
  if (!id) redirect(`${FAQ}?n=not_found`);
  if (!parsed.ok) redirect(`${FAQ}?n=invalid`);
  const session = { workspaceId: workspace.id, userId: user.id };
  return write(FAQ, session, (tx) => updateFaqItem(tx, session.workspaceId, id, parsed.input));
}

export async function deleteFaqAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const id = idOf(data);
  if (!id) redirect(`${FAQ}?n=not_found`);
  const session = { workspaceId: workspace.id, userId: user.id };
  return write(FAQ, session, (tx) => deleteFaqItem(tx, session.workspaceId, id), 'deleted');
}
