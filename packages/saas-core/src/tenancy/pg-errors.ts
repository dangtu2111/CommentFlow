/** Đọc trường lỗi Postgres (Drizzle bọc lỗi gốc trong `cause`). */
export const pgField = (error: unknown, field: 'code' | 'constraint'): string | undefined => {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  };
  return e?.cause?.[field] ?? e?.[field];
};

/** 23505 = trùng khóa duy nhất. */
export const isUniqueViolation = (error: unknown): boolean => pgField(error, 'code') === '23505';

/** 23514 + constraint `members_last_owner` = trigger giữ Owner cuối cùng (migration 0015). */
export const isLastOwnerViolation = (error: unknown): boolean =>
  pgField(error, 'code') === '23514' && pgField(error, 'constraint') === 'members_last_owner';

/**
 * 42501 do RLS ("row-level security"), KHÔNG phải thiếu quyền cột/bảng: lỗi lập trình (ví dụ select() đủ cột
 * `invitations` đụng `token_hash`) phải nổi lên nguyên dạng, không bị che thành "không có quyền".
 */
export const isRlsViolation = (error: unknown): boolean => {
  const e = error as { message?: string; cause?: { message?: string } };
  return (
    pgField(error, 'code') === '42501' &&
    /row-level security/i.test(`${e?.cause?.message ?? e?.message ?? ''}`)
  );
};
