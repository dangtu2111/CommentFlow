export { writeActionLog } from './action-log';
export { slugify, uniqueSlug } from './slug';
export {
  createTenancy,
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  type MemberListItem,
  type MemberRole,
  type Tenancy,
  WORKSPACE_TIME_ZONES,
  type WorkspaceMembership,
} from './tenancy';

import { createDb } from '@flow/db/runtime';
import type { Notifier } from '../notify/notifier';
import type { RateLimiter } from '../ratelimit/limiter';
import { createTenancy as makeTenancy } from './tenancy';
import { createWorkspaceAdmin as makeWorkspaceAdmin } from './workspace-admin';

/**
 * Mở MỘT pool cf_app (DATABASE_URL) và dựng tenancy + quản trị thành viên/lời mời dùng chung pool đó — để
 * apps/web không cần import @flow/db trực tiếp.
 */
export function openWorkspaceServices(options: {
  connectionString: string;
  notifier: Notifier;
  limiter: RateLimiter;
  appUrl: string;
  max?: number;
}) {
  const db = createDb({
    connectionString: options.connectionString,
    ...(options.max ? { max: options.max } : {}),
  });
  return {
    tenancy: makeTenancy(db),
    admin: makeWorkspaceAdmin({
      db,
      notifier: options.notifier,
      limiter: options.limiter,
      appUrl: options.appUrl,
    }),
  };
}
export {
  type AcceptResult,
  createWorkspaceAdmin,
  hashInvitationToken,
  INVITATION_TTL_DAYS,
  type InvitationPreview,
  type InviteResult,
  type MemberRow,
  type MemberStatus,
  type PendingInvitation,
  type WorkspaceAdmin,
} from './workspace-admin';
