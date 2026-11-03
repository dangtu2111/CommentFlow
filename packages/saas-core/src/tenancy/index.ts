export { slugify, uniqueSlug } from './slug';
export {
  createTenancy,
  type MemberListItem,
  type MemberRole,
  type Tenancy,
  type WorkspaceMembership,
} from './tenancy';

import { createDb } from '@flow/db/runtime';
import { createTenancy as makeTenancy } from './tenancy';

/** Mở pool cf_app (DATABASE_URL) và dựng tenancy — để apps/web không cần import @flow/db trực tiếp. */
export function openTenancy(options: { connectionString: string; max?: number }) {
  return makeTenancy(createDb(options));
}
