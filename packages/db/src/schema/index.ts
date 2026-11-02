import * as cf from './cf';
import * as core from './core';

/** Toàn bộ schema cho Drizzle (client dùng chung). saas-core chỉ import `@flow/db/schema/core`. */
export const schema = { ...core, ...cf };
