'use server';

import { createAbbreviation, deleteAbbreviation, updateAbbreviation } from '@flow/db/runtime';
import { parseAbbreviation } from '@flow/shared';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { actionAllowed } from '../../../../server/action-guard';
import { getDb } from '../../../../server/db';
import { requireAppUser } from '../../../../server/require-app-user';
import type { KbNotice } from './actions';

/**
 * Từ điển viết tắt của shop (FR-025, FR-050) — chỉ Owner (Staff nhận 404 ở `requireAppUser`, gọi đầu MỖI action). Workspace và người dùng lấy từ phiên, không từ form; id từ form
 * chỉ là lựa chọn (kiểm uuid; id lạ hoặc của workspace khác bị RLS giấu → `not_found`). Kết thúc chuyển hướng về trang kèm mã thông báo `n`. Từ điển không thành đoạn kiến thức
 * nên không cần đồng bộ KB.
 */
const BACK = '/app/kb/abbreviations';
const UNIQUE_VIOLATION = '23505';

type Session = { workspaceId: string; userId: string };
type Tx = Parameters<Parameters<ReturnType<typeof getDb>['withActor']>[2]>[0];

const idOf = (data: FormData): string | null => {
  const parsed = z.uuid().safeParse(data.get('id'));
  return parsed.success ? parsed.data : null;
};

const inputOf = (data: FormData) =>
  parseAbbreviation({
    short: String(data.get('short') ?? ''),
    full: String(data.get('full') ?? ''),
    lang: String(data.get('lang') ?? ''),
  });

const isUniqueViolation = (error: unknown): boolean => {
  const code = (error as { code?: unknown; cause?: { code?: unknown } } | null) ?? {};
  return code.code === UNIQUE_VIOLATION || code.cause?.code === UNIQUE_VIOLATION;
};

/** Một thao tác ghi trong `withActor`; trùng từ → `invalid`; lỗi khác → `unavailable` (không lộ chi tiết, không log nội dung). */
async function write(
  session: Session,
  run: (tx: Tx) => Promise<boolean>,
  done: KbNotice = 'saved',
): Promise<never> {
  if (!(await actionAllowed('uiWrite', session))) redirect(`${BACK}?n=rate_limited`);
  let notice: KbNotice;
  try {
    const found = await getDb().withActor(session.workspaceId, session.userId, run);
    notice = found ? done : 'not_found';
  } catch (error) {
    if (!isUniqueViolation(error)) {
      console.error(JSON.stringify({ event: 'kb_abbreviation_write_failed' }));
    }
    notice = isUniqueViolation(error) ? 'invalid' : 'unavailable';
  }
  redirect(`${BACK}?n=${notice}`);
}

export async function createAbbreviationAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const parsed = inputOf(data);
  if (!parsed.success) redirect(`${BACK}?n=invalid`);
  const session = { workspaceId: workspace.id, userId: user.id };
  return write(session, async (tx) => {
    await createAbbreviation(tx, session.workspaceId, parsed.data);
    return true;
  });
}

export async function updateAbbreviationAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const id = idOf(data);
  const parsed = inputOf(data);
  if (!id) redirect(`${BACK}?n=not_found`);
  if (!parsed.success) redirect(`${BACK}?n=invalid`);
  const session = { workspaceId: workspace.id, userId: user.id };
  return write(session, (tx) =>
    updateAbbreviation(tx, session.workspaceId, id, {
      short: parsed.data.short,
      full: parsed.data.full,
    }),
  );
}

export async function deleteAbbreviationAction(data: FormData): Promise<never> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const id = idOf(data);
  if (!id) redirect(`${BACK}?n=not_found`);
  const session = { workspaceId: workspace.id, userId: user.id };
  return write(session, (tx) => deleteAbbreviation(tx, session.workspaceId, id), 'deleted');
}
