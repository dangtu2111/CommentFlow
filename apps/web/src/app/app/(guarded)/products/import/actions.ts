'use server';

import { applyProductImport } from '@flow/db/runtime';
import { getDb } from '../../../../../server/db';
import { type ImportActionResult, runProductImport } from '../../../../../server/product-import';
import { requireAppUser } from '../../../../../server/require-app-user';

/**
 * Nhập sản phẩm từ Excel/CSV (FR-051). Chỉ Owner (Staff nhận 404); workspace/người dùng lấy từ `requireAppUser`,
 * KHÔNG từ form. `mode=preview` không ghi gì; `mode=commit` ghi trong một giao dịch `withActor` (RLS thành viên).
 * Form gửi lại file + khớp cột ở cả hai bước (không lưu file phía server, Q-KBIX1 g).
 */
export async function runProductImportAction(formData: FormData): Promise<ImportActionResult> {
  const { user, workspace } = await requireAppUser({ role: 'owner' });
  const file = formData.get('file');
  const mapping = formData.get('mapping');
  return runProductImport(
    {
      mode: formData.get('mode') === 'commit' ? 'commit' : 'preview',
      file: file instanceof File ? file : null,
      mapping: typeof mapping === 'string' ? mapping : null,
    },
    {
      commit: (plan) =>
        getDb().withActor(workspace.id, user.id, (tx) =>
          applyProductImport(tx, workspace.id, plan),
        ),
    },
  );
}
