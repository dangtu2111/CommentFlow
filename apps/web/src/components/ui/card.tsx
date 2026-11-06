import { cva } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const cardVariants = cva('card', {
  variants: { stack: { true: 'stack', false: '' } },
  defaultVariants: { stack: false },
});

/** Thẻ nội dung (nền surface, viền, bo 12). `stack` xếp con theo cột có khoảng cách chuẩn. */
export function Card({
  stack = false,
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { stack?: boolean }) {
  return <section className={cn(cardVariants({ stack }), className)} {...rest} />;
}
