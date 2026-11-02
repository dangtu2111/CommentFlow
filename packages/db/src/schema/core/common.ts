import { customType, pgSchema, timestamp } from 'drizzle-orm/pg-core';

/** Schema dùng chung cho mọi sản phẩm (docs/10 §1, docs/09 §3.1). */
export const core = pgSchema('core');

/** Kiểu citext (email không phân biệt hoa thường); extension được tạo ở bước khởi tạo DB. */
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/** Cặp cột created_at / updated_at theo quy ước docs/10 §1. */
export const createdAt = () => timestamptz('created_at').notNull().defaultNow();
export const updatedAt = () => timestamptz('updated_at').notNull().defaultNow();
