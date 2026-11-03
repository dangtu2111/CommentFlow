import type { AppPrincipal, WorkspaceMembership } from '@flow/saas-core';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { type AppAccessOptions, decideAppAccess } from './app-access';
import { getAuthRuntime } from './auth';
import { requestContext } from './request-context';
import { chooseWorkspace, WORKSPACE_COOKIE } from './workspace-selection';

export type AppContext<W extends WorkspaceMembership | null> = {
  user: AppPrincipal;
  /** Workspace đang chọn; mọi truy vấn nghiệp vụ dùng `workspace.id` NÀY, không bao giờ id từ client. */
  workspace: W;
};

/**
 * CỔNG DUY NHẤT của khu `/app` (docs/13 §2–§4): MỌI trang, route handler và Server Action dưới `app/app/**`
 * phải gọi hàm này đầu tiên (test quét `require-app-user.scan.test.ts` ép điều đó). Kiểm theo thứ tự: phiên,
 * email đã xác minh, 2FA (Owner/Admin), membership `active` của workspace đang chọn (đọc lại từ DB mỗi lần),
 * vai trò. Không đạt → chuyển hướng hoặc 404; không bao giờ trả về một ngữ cảnh chưa đủ điều kiện.
 */
export async function requireAppUser(
  options: AppAccessOptions & { workspace?: 'required' },
): Promise<AppContext<WorkspaceMembership>>;
export async function requireAppUser(
  options: AppAccessOptions & { workspace: 'optional' },
): Promise<AppContext<WorkspaceMembership | null>>;
export async function requireAppUser(
  options: AppAccessOptions = {},
): Promise<AppContext<WorkspaceMembership | null>> {
  const runtime = getAuthRuntime();
  const { headers } = await requestContext();
  const user = await runtime.twoFactor.principal(headers);

  let workspace: WorkspaceMembership | null = null;
  if (user) {
    const memberships = await runtime.tenancy.listWorkspacesOfUser(user.id);
    const cookie = (await cookies()).get(WORKSPACE_COOKIE)?.value;
    workspace = chooseWorkspace(memberships, runtime.workspaceCookie.verify(cookie));
  }

  const decision = decideAppAccess({ principal: user, workspace, options });
  if (decision.kind === 'redirect') redirect(decision.to);
  if (decision.kind === 'not-found') notFound();
  // `decision.kind === 'allow'` ⇒ user khác null (decideAppAccess chuyển hướng khi không có phiên).
  return { user: user as AppPrincipal, workspace };
}
