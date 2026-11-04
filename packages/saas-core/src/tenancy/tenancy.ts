import { randomUUID } from 'node:crypto';
import type { FlowDb } from '@flow/db/runtime';
import { and, asc, eq } from '@flow/db/runtime';
import { members, users, workspaces } from '@flow/db/schema/core';
import { AppError } from '@flow/shared';
import { z } from 'zod';
import { writeActionLog } from './action-log';
import { uniqueSlug } from './slug';

export type MemberRole = 'owner' | 'staff';

export type WorkspaceMembership = { id: string; name: string; slug: string; role: MemberRole };

/** Một dòng của danh sách thành viên: CHỈ các trường giao diện cần (không email_verified, is_admin, 2FA...). */
export type MemberListItem = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: MemberRole;
};

const nameSchema = z.string().trim().min(1).max(80);
const uuidSchema = z.uuid();
const langSchema = z.enum(['vi', 'en']);

export const DEFAULT_TIME_ZONE = 'Asia/Ho_Chi_Minh';
/**
 * Múi giờ cho phép khi tạo workspace: danh sách có chủ đích cho thị trường mục tiêu (Việt Nam + khu vực), so khớp
 * đúng chữ. Không dùng `Intl.supportedValuesOf` vì nó bỏ các tên đồng nghĩa như Asia/Ho_Chi_Minh.
 */
export const WORKSPACE_TIME_ZONES = [
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Jakarta',
  'Asia/Manila',
  'Asia/Kuala_Lumpur',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
] as const;
const TIME_ZONES: ReadonlySet<string> = new Set(WORKSPACE_TIME_ZONES);

export const isValidTimeZone = (value: string): boolean => TIME_ZONES.has(value);

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError('VALIDATION_FAILED', message);
  return result.data;
}

/** Workspace, thành viên, vai trò. Mọi truy vấn đi qua withWorkspace()/withUser() (RLS). */
export function createTenancy(db: FlowDb) {
  async function getRole(workspaceId: string, userId: string): Promise<MemberRole | null> {
    const wsId = parse(uuidSchema, workspaceId, 'workspaceId không hợp lệ.');
    const uid = parse(uuidSchema, userId, 'userId không hợp lệ.');
    const rows = await db.withWorkspace(wsId, (tx) =>
      tx
        .select({ role: members.role })
        .from(members)
        .where(
          and(eq(members.workspaceId, wsId), eq(members.userId, uid), eq(members.status, 'active')),
        ),
    );
    return (rows[0]?.role as MemberRole | undefined) ?? null;
  }

  return {
    getRole,

    /** Tạo workspace; người tạo là owner. id sinh ở ứng dụng để khớp ngữ cảnh RLS. */
    async createWorkspace(input: {
      userId: string;
      name: string;
      /** Múi giờ IANA; mặc định Asia/Ho_Chi_Minh. */
      timezone?: string;
      /** Ngôn ngữ mặc định của workspace (vi/en); mặc định vi. */
      defaultLang?: 'vi' | 'en';
    }): Promise<WorkspaceMembership> {
      const userId = parse(uuidSchema, input.userId, 'userId không hợp lệ.');
      const name = parse(nameSchema, input.name, 'Tên workspace phải có từ 1 đến 80 ký tự.');
      const timezone = input.timezone ?? DEFAULT_TIME_ZONE;
      if (!isValidTimeZone(timezone))
        throw new AppError('VALIDATION_FAILED', 'Múi giờ không hợp lệ.');
      const defaultLang = parse(
        langSchema,
        input.defaultLang ?? 'vi',
        'Ngôn ngữ phải là vi hoặc en.',
      );
      const id = randomUUID();
      const slug = uniqueSlug(name);
      // withActor: DB cần biết người tạo để cho đường khởi tạo Owner đầu tiên (migration 0016).
      await db.withActor(id, userId, async (tx) => {
        // createdBy: RLS (0016) chỉ cho đúng người tạo tự thêm mình làm Owner đầu tiên của workspace này.
        await tx
          .insert(workspaces)
          .values({ id, name, slug, timezone, defaultLang, createdBy: userId });
        await tx.insert(members).values({ workspaceId: id, userId, role: 'owner' });
        await writeActionLog(tx, {
          workspaceId: id,
          actorId: userId,
          action: 'workspace.created',
          targetType: 'workspace',
          targetId: id,
          after: { timezone, defaultLang },
        });
      });
      return { id, name, slug, role: 'owner' };
    },

    /**
     * Thành viên đang hoạt động của workspace. Chỉ chọn cột cần cho danh sách (cf_app cũng không đọc được
     * cột nhạy cảm của users — migration 0012). Việc kiểm quyền xem (FR-004) là của nơi gọi.
     */
    async listMembers(workspaceId: string): Promise<MemberListItem[]> {
      const wsId = parse(uuidSchema, workspaceId, 'workspaceId không hợp lệ.');
      const rows = await db.withWorkspace(wsId, (tx) =>
        tx
          .select({
            userId: users.id,
            name: users.name,
            email: users.email,
            image: users.image,
            role: members.role,
          })
          .from(members)
          .innerJoin(users, eq(users.id, members.userId))
          .where(and(eq(members.workspaceId, wsId), eq(members.status, 'active')))
          .orderBy(asc(users.name), asc(users.email)),
      );
      return rows.map((r) => ({ ...r, role: r.role as MemberRole }));
    },

    /** Workspace mà người dùng là thành viên (để chuyển workspace), kèm vai trò. */
    async listWorkspacesOfUser(userId: string): Promise<WorkspaceMembership[]> {
      const uid = parse(uuidSchema, userId, 'userId không hợp lệ.');
      const rows = await db.withUser(uid, (tx) =>
        tx
          .select({
            id: workspaces.id,
            name: workspaces.name,
            slug: workspaces.slug,
            role: members.role,
          })
          .from(members)
          .innerJoin(workspaces, eq(workspaces.id, members.workspaceId))
          .where(and(eq(members.userId, uid), eq(members.status, 'active')))
          .orderBy(asc(workspaces.name)),
      );
      return rows.map((r) => ({ ...r, role: r.role as MemberRole }));
    },
  };
}

export type Tenancy = ReturnType<typeof createTenancy>;
