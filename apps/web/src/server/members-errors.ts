import { isAppError } from '@flow/shared';
import { notFound } from 'next/navigation';
import type { MembersFormState } from '../lib/members-form';

/**
 * Đổi lỗi của saas-core thành trạng thái cho giao diện. NOT_FOUND và FORBIDDEN đều thành 404 (không lộ id thuộc
 * workspace khác có tồn tại hay không). Lỗi không rõ chỉ ghi tên sự kiện, không ghi nội dung.
 */
export function membersErrorToState(error: unknown): MembersFormState {
  if (isAppError(error)) {
    if (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN') notFound();
    if (error.code === 'CONFLICT') return { status: 'error', message: 'lastOwner' };
    if (error.code === 'VALIDATION_FAILED') return { status: 'error', message: 'invalid' };
  }
  console.error(JSON.stringify({ event: 'members_action_failed' }));
  return { status: 'error', message: 'generic' };
}
