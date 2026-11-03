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
import { createTenancy as makeTenancy } from './tenancy';

/** Mở pool cf_app (DATABASE_URL) và dựng tenancy — để apps/web không cần import @flow/db trực tiếp. */
export function openTenancy(options: { connectionString: string; max?: number }) {
  return makeTenancy(createDb(options));
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
