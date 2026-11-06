import { cva, type VariantProps } from 'class-variance-authority';

/** Lớp của nút khối trong khung xác thực (dùng cho `<button>` và cho `<Link>` trông như nút); không 'use client' để trang máy chủ dùng được. */
export const authButton = cva(
  'flex h-11 w-full items-center justify-center gap-space-xs rounded-lg font-title-md text-title-md shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70',
  {
    variants: {
      tone: {
        primary: 'bg-primary text-on-primary hover:bg-primary-container',
        secondary: 'bg-secondary text-on-secondary hover:bg-secondary-container',
        neutral: 'bg-surface-container text-on-surface hover:bg-surface-container-high',
      },
    },
    defaultVariants: { tone: 'primary' },
  },
);

export type AuthButtonProps = VariantProps<typeof authButton>;

/** Chuỗi class của nút khối theo tông màu. */
export function authButtonClass(tone: AuthButtonProps['tone'] = 'primary') {
  return authButton({ tone });
}
