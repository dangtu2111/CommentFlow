import type { AppPrincipal, MemberRole, WorkspaceMembership } from '@flow/saas-core';

/**
 * Quy tắc truy cập khu `/app` (docs/13 §2–§4), tách khỏi Next để kiểm thử bằng bảng. Thứ tự kiểm CỐ ĐỊNH:
 * phiên → email đã xác minh → 2FA → workspace → vai trò. Mọi đầu vào đều lấy phía server.
 */
export type AppAccessOptions = {
  /** `required` (mặc định): phải có workspace đang chọn; `optional`: không có cũng được. */
  workspace?: 'required' | 'optional';
  /** Chỉ vai trò này mới vào được (vai trò khác → 404, không lộ trang tồn tại). */
  role?: MemberRole;
  /** `skip` CHỈ cho trang bảo mật, nơi Owner/Admin chưa bật 2FA phải vào được để bật. */
  twoFactor?: 'enforce' | 'skip';
};

export type AppAccessDecision =
  | { kind: 'allow' }
  | { kind: 'redirect'; to: string }
  | { kind: 'not-found' };

export const APP_ROUTES = {
  login: '/login',
  security: '/app/security',
  createWorkspace: '/app/onboarding/workspace',
} as const;

export function decideAppAccess(input: {
  principal: AppPrincipal | null;
  /** Workspace đang chọn (đã kiểm thành viên `active` phía server) hoặc null. */
  workspace: WorkspaceMembership | null;
  options?: AppAccessOptions;
}): AppAccessDecision {
  const { principal, workspace, options = {} } = input;
  if (!principal) return { kind: 'redirect', to: APP_ROUTES.login };
  if (!principal.emailVerified) return { kind: 'redirect', to: APP_ROUTES.login };
  if (options.twoFactor !== 'skip' && principal.twoFactorRequired && !principal.twoFactorEnabled) {
    return { kind: 'redirect', to: APP_ROUTES.security };
  }
  if ((options.workspace ?? 'required') === 'required' && !workspace) {
    return { kind: 'redirect', to: APP_ROUTES.createWorkspace };
  }
  if (options.role && workspace?.role !== options.role) return { kind: 'not-found' };
  return { kind: 'allow' };
}
