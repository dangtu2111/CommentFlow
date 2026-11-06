import type { HTMLAttributes } from 'react';

/** Thẻ nội dung (nền surface, viền, bo 12). `stack` xếp con theo cột có khoảng cách chuẩn. */
export function Card({
  stack = false,
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { stack?: boolean }) {
  return (
    <section
      className={['card', stack ? 'stack' : '', className ?? ''].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
