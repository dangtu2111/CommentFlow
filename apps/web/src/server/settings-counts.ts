import { listChannels } from '@flow/db/runtime';
import type { SettingsCounts } from '../lib/settings-nav';
import { getAuthRuntime } from './auth';
import { getDb } from './db';

/** Số kênh (đã kết nối/tổng) và số thành viên cho cột trái Cài đặt — chỉ Owner (Staff không thấy hai mục này). */
export async function loadSettingsCounts(input: {
  role: 'owner' | 'staff';
  workspaceId: string;
  userId: string;
}): Promise<SettingsCounts | null> {
  if (input.role !== 'owner') return null;
  const [channels, members] = await Promise.all([
    getDb().withActor(input.workspaceId, input.userId, (tx) => listChannels(tx, input.workspaceId)),
    getAuthRuntime().workspaceAdmin.listMembers({
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
    }),
  ]);
  return {
    channelsConnected: channels.filter((channel) => channel.status === 'connected').length,
    channelsTotal: channels.length,
    members: members.length,
  };
}
