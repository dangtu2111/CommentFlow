'use server';

import {
  createFaqItem,
  createPolicyItem,
  deleteFaqItem,
  deletePolicyItem,
  updateFaqItem,
  updatePolicyItem,
  upsertBrandVoice,
  upsertShopProfile,
} from '@flow/db/runtime';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  formToBrandVoice,
  formToFaq,
  formToPolicy,
  formToShopProfile,
} from '../../../../lib/kb-content-form';
import { getDb } from '../../../../server/db';
import { requireAppUser } from '../../../../server/require-app-user';

/**
 * Nhập kiến thức tay (FR-050, FR-142) — chỉ Owner (Staff nhận 404 ở `requireAppUser`, gọi đầu MỖI action). Workspace và
 * người dùng lấy từ phiên, KHÔNG từ form; id mục từ form chỉ là lựa chọn (kiểm uuid; id lạ hoặc của workspace khác →
 * RLS giấu → `not_found`). Mọi kết thúc chuyển hướng về đúng trang kèm mã thông báo `n`
 * (saved | deleted | invalid | not_found | unavailable).
 */
export type KbNotice = 'saved' | 'deleted' | 'invalid' | 'not_found' | 'unavailable';

type Session = { workspaceId: string; userId: string };
type Tx = Parameters<Parameters<ReturnType<typeof getDb>['withActor']>[2]>[0];

const SHOP = '/app/kb/shop';
const POLICIES = '/app/kb/policies';
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
  let notice: KbNotice;
  try {
    const found = await getDb().withActor(session.workspaceId, session.userId, run);
    notice = found ? done : 'not_found';
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

export async function createPolicyAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const parsed = formToPolicy(data);
  if (!parsed.ok) redirect(`${POLICIES}?n=invalid`);
  const session = { workspaceId: workspace.id, userId: user.id };
  return write(POLICIES, session, async (tx) => {
    await createPolicyItem(tx, session.workspaceId, parsed.input);
    return true;
  });
}

export async function updatePolicyAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const id = idOf(data);
  const parsed = formToPolicy(data);
  if (!id) redirect(`${POLICIES}?n=not_found`);
  if (!parsed.ok) redirect(`${POLICIES}?n=invalid`);
  const session = { workspaceId: workspace.id, userId: user.id };
  return write(POLICIES, session, (tx) =>
    updatePolicyItem(tx, session.workspaceId, id, {
      title: parsed.input.title,
      content: parsed.input.content,
    }),
  );
}

export async function deletePolicyAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const id = idOf(data);
  if (!id) redirect(`${POLICIES}?n=not_found`);
  const session = { workspaceId: workspace.id, userId: user.id };
  return write(POLICIES, session, (tx) => deletePolicyItem(tx, session.workspaceId, id), 'deleted');
}
